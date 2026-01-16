
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Psd } from 'ag-psd';
import { TemplateMetadata, MappingContext, TransformedPayload, LayoutStrategy, KnowledgeContext, KnowledgeRegistry, FeedbackStrategy, FeedbackRegistry } from '../types';

interface ProceduralState {
  // Maps NodeID -> Raw PSD Object (Binary/Structure)
  psdRegistry: Record<string, Psd>;
  
  // Maps NodeID -> Lightweight Template Metadata
  templateRegistry: Record<string, TemplateMetadata>;
  
  // Maps NodeID -> HandleID -> Resolved Context (Layers + Bounds)
  resolvedRegistry: Record<string, Record<string, MappingContext>>;

  // Maps NodeID -> HandleID -> Transformed Payload (Ready for Assembly)
  payloadRegistry: Record<string, Record<string, TransformedPayload>>;

  // Maps NodeID -> HandleID -> Polished Payload (CARO Output)
  reviewerRegistry: Record<string, Record<string, TransformedPayload>>;

  // Maps NodeID -> HandleID -> Base64 Image String
  previewRegistry: Record<string, Record<string, string>>;

  // Maps NodeID -> HandleID -> LayoutStrategy (AI Analysis)
  analysisRegistry: Record<string, Record<string, LayoutStrategy>>;

  // Maps NodeID -> HandleID -> FeedbackStrategy (Reviewer Constraints)
  feedbackRegistry: FeedbackRegistry;

  // Maps NodeID -> KnowledgeContext (Global Design Rules)
  knowledgeRegistry: KnowledgeRegistry;

  // Global counter to force re-evaluation of downstream nodes upon binary re-hydration
  globalVersion: number;
}

interface ProceduralContextType extends ProceduralState {
  registerPsd: (nodeId: string, psd: Psd) => void;
  registerTemplate: (nodeId: string, template: TemplateMetadata) => void;
  registerResolved: (nodeId: string, handleId: string, context: MappingContext) => void;
  registerPayload: (nodeId: string, handleId: string, payload: TransformedPayload, masterOverride?: boolean) => void;
  registerReviewerPayload: (nodeId: string, handleId: string, payload: TransformedPayload) => void;
  registerPreviewPayload: (nodeId: string, handleId: string, payload: TransformedPayload, renderUrl: string) => void;
  updatePayload: (nodeId: string, handleId: string, partial: Partial<TransformedPayload>) => void; 
  registerAnalysis: (nodeId: string, handleId: string, strategy: LayoutStrategy) => void;
  registerFeedback: (nodeId: string, handleId: string, strategy: FeedbackStrategy) => void;
  clearFeedback: (nodeId: string, handleId: string) => void;
  registerKnowledge: (nodeId: string, context: KnowledgeContext) => void;
  updatePreview: (nodeId: string, handleId: string, url: string) => void;
  unregisterNode: (nodeId: string) => void;
  flushPipelineInstance: (nodeId: string, handleId: string) => void;
  triggerGlobalRefresh: () => void;
  
  // Instance Lifecycle Actions
  addInstance: (nodeId: string) => void;
  removeInstance: (nodeId: string, instanceId: string) => void;
}

const ProceduralContext = createContext<ProceduralContextType | null>(null);

// --- HELPER: Reconcile Terminal State ---
const reconcileTerminalState = (
    incomingPayload: TransformedPayload, 
    currentPayload: TransformedPayload | undefined
): TransformedPayload => {

    if (incomingPayload.status === 'idle' && !incomingPayload.generationId) {
        return {
            ...incomingPayload,
            previewUrl: undefined,
            isConfirmed: false,
            isTransient: false,
            isSynthesizing: false,
            isPolished: false,
            requiresGeneration: false,
            sourceReference: undefined
        };
    }

    if (incomingPayload.generationAllowed === false) {
        return {
            ...incomingPayload,
            previewUrl: undefined,
            isConfirmed: false,
            isTransient: false,
            isSynthesizing: false,
            requiresGeneration: false,
            metrics: incomingPayload.metrics,
            layers: incomingPayload.layers.filter(l => 
                l.type !== 'generative' || (l.id && !l.id.startsWith('gen-layer-'))
            ) 
        };
    }

    const hasMandatoryDirective = incomingPayload.directives?.includes('MANDATORY_GEN_FILL');
    const isForced = incomingPayload.isMandatory || hasMandatoryDirective;

    if (isForced && incomingPayload.requiresGeneration) {
        return {
            ...incomingPayload,
            status: 'success',
            isConfirmed: true,
            isTransient: false,
            isSynthesizing: incomingPayload.isSynthesizing,
            previewUrl: incomingPayload.previewUrl || currentPayload?.previewUrl,
            sourceReference: incomingPayload.sourceReference || currentPayload?.sourceReference,
            generationId: incomingPayload.generationId || currentPayload?.generationId
        };
    }

    if (currentPayload?.generationId && incomingPayload.generationId && incomingPayload.generationId < currentPayload.generationId) {
        return currentPayload;
    }

    if (incomingPayload.status === 'idle') {
        return {
             ...incomingPayload,
             previewUrl: undefined,
             isConfirmed: false,
             isTransient: false,
             isSynthesizing: false
        };
    }

    if (incomingPayload.isSynthesizing) {
        return {
            ...(currentPayload || incomingPayload),
            isSynthesizing: true,
            previewUrl: currentPayload?.previewUrl,
            sourceReference: incomingPayload.sourceReference || currentPayload?.sourceReference,
            targetContainer: incomingPayload.targetContainer || currentPayload?.targetContainer || '',
            metrics: incomingPayload.metrics || currentPayload?.metrics,
            generationId: currentPayload?.generationId,
            generationAllowed: true
        };
    }

    let isConfirmed = incomingPayload.isConfirmed ?? currentPayload?.isConfirmed ?? false;
    if (incomingPayload.isTransient) isConfirmed = false;

    if (!incomingPayload.generationId && currentPayload?.generationId) {
         return {
            ...incomingPayload,
            previewUrl: currentPayload.previewUrl,
            generationId: currentPayload.generationId,
            isSynthesizing: currentPayload.isSynthesizing,
            isConfirmed: currentPayload.isConfirmed, 
            isTransient: currentPayload.isTransient,
            sourceReference: currentPayload.sourceReference || incomingPayload.sourceReference,
            generationAllowed: true
         };
    }

    return {
        ...incomingPayload,
        isConfirmed,
        sourceReference: incomingPayload.sourceReference || currentPayload?.sourceReference,
        generationId: incomingPayload.generationId || currentPayload?.generationId,
        generationAllowed: true
    };
};

export const ProceduralStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [psdRegistry, setPsdRegistry] = useState<Record<string, Psd>>({});
  const [templateRegistry, setTemplateRegistry] = useState<Record<string, TemplateMetadata>>({});
  const [resolvedRegistry, setResolvedRegistry] = useState<Record<string, Record<string, MappingContext>>>({});
  const [payloadRegistry, setPayloadRegistry] = useState<Record<string, Record<string, TransformedPayload>>>({});
  const [reviewerRegistry, setReviewerRegistry] = useState<Record<string, Record<string, TransformedPayload>>>({});
  const [previewRegistry, setPreviewRegistry] = useState<Record<string, Record<string, string>>>({});
  const [analysisRegistry, setAnalysisRegistry] = useState<Record<string, Record<string, LayoutStrategy>>>({});
  const [feedbackRegistry, setFeedbackRegistry] = useState<FeedbackRegistry>({});
  const [knowledgeRegistry, setKnowledgeRegistry] = useState<KnowledgeRegistry>({});
  const [globalVersion, setGlobalVersion] = useState<number>(0);

  // Reference to React Flow node setter
  const { setNodes } = (window as any).reactFlowInstance || { setNodes: () => {} };

  const registerPsd = useCallback((nodeId: string, psd: Psd) => {
    setPsdRegistry(prev => ({ ...prev, [nodeId]: psd }));
  }, []);

  const registerTemplate = useCallback((nodeId: string, template: TemplateMetadata) => {
    setTemplateRegistry(prev => {
      if (prev[nodeId] === template) return prev;
      if (JSON.stringify(prev[nodeId]) === JSON.stringify(template)) return prev;
      return { ...prev, [nodeId]: template };
    });
  }, []);

  const registerResolved = useCallback((nodeId: string, handleId: string, context: MappingContext) => {
    setResolvedRegistry(prev => {
      const nodeRecord = prev[nodeId] || {};
      if (nodeRecord[handleId] === context) return prev;
      return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: context } };
    });
  }, []);

  const registerPayload = useCallback((nodeId: string, handleId: string, payload: TransformedPayload, masterOverride?: boolean) => {
    setPayloadRegistry(prev => {
      const nodeRecord = prev[nodeId] || {};
      const currentPayload = nodeRecord[handleId];
      let effectivePayload = { ...payload };
      if (masterOverride === false) effectivePayload.generationAllowed = false;
      const reconciledPayload = reconcileTerminalState(effectivePayload, currentPayload);
      if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(reconciledPayload)) return prev;
      return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: reconciledPayload } };
    });
  }, []);

  const registerReviewerPayload = useCallback((nodeId: string, handleId: string, payload: TransformedPayload) => {
    setReviewerRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        const currentPayload = nodeRecord[handleId];
        const effectivePayload = { ...payload, isPolished: true };
        const reconciledPayload = reconcileTerminalState(effectivePayload, currentPayload);
        if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(reconciledPayload)) return prev;
        return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: reconciledPayload } };
    });
  }, []);

  const registerPreviewPayload = useCallback((nodeId: string, handleId: string, payload: TransformedPayload, renderUrl: string) => {
    setPreviewRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        if (nodeRecord[handleId] === renderUrl) return prev;
        return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: renderUrl } };
    });
    registerReviewerPayload(nodeId, handleId, payload);
  }, [registerReviewerPayload]);

  const updatePayload = useCallback((nodeId: string, handleId: string, partial: Partial<TransformedPayload>) => {
    setPayloadRegistry(prev => {
      const nodeRecord = prev[nodeId] || {};
      const currentPayload = nodeRecord[handleId];
      if (!currentPayload && !partial.sourceContainer && !partial.previewUrl) return prev; 
      const mergedPayload: TransformedPayload = currentPayload ? { ...currentPayload, ...partial } : (partial as TransformedPayload); 
      const reconciledPayload = reconcileTerminalState(mergedPayload, currentPayload);
      if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(reconciledPayload)) return prev;
      return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: reconciledPayload } };
    });
  }, []);

  const registerAnalysis = useCallback((nodeId: string, handleId: string, strategy: LayoutStrategy) => {
    setAnalysisRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        const currentStrategy = nodeRecord[handleId];
        if (currentStrategy && JSON.stringify(currentStrategy) === JSON.stringify(strategy)) return prev;
        return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: strategy } };
    });
  }, []);

  const registerFeedback = useCallback((nodeId: string, handleId: string, strategy: FeedbackStrategy) => {
    setFeedbackRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        if (nodeRecord[handleId] && JSON.stringify(nodeRecord[handleId]) === JSON.stringify(strategy)) return prev;
        return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: strategy } };
    });
  }, []);

  const clearFeedback = useCallback((nodeId: string, handleId: string) => {
    setFeedbackRegistry(prev => {
        if (!prev[nodeId]) return prev;
        const { [handleId]: _, ...rest } = prev[nodeId];
        return { ...prev, [nodeId]: rest };
    });
  }, []);

  const registerKnowledge = useCallback((nodeId: string, context: KnowledgeContext) => {
    setKnowledgeRegistry(prev => {
        if (JSON.stringify(prev[nodeId]) === JSON.stringify(context)) return prev;
        return { ...prev, [nodeId]: context };
    });
  }, []);

  const updatePreview = useCallback((nodeId: string, handleId: string, url: string) => {
    setPayloadRegistry(prev => {
      const nodeRecord = prev[nodeId];
      if (!nodeRecord || !nodeRecord[handleId]) return prev; 
      if (nodeRecord[handleId].previewUrl === url) return prev;
      return { ...prev, [nodeId]: { ...nodeRecord, [handleId]: { ...nodeRecord[handleId], previewUrl: url } } };
    });
  }, []);

  const unregisterNode = useCallback((nodeId: string) => {
    setPsdRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    templateRegistry[nodeId] && setTemplateRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    resolvedRegistry[nodeId] && setResolvedRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    payloadRegistry[nodeId] && setPayloadRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    reviewerRegistry[nodeId] && setReviewerRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    analysisRegistry[nodeId] && setAnalysisRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    feedbackRegistry[nodeId] && setFeedbackRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    knowledgeRegistry[nodeId] && setKnowledgeRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    previewRegistry[nodeId] && setPreviewRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    setGlobalVersion(v => v + 1);
  }, [templateRegistry, resolvedRegistry, payloadRegistry, reviewerRegistry, analysisRegistry, feedbackRegistry, knowledgeRegistry, previewRegistry]);

  const flushPipelineInstance = useCallback((nodeId: string, handleId: string) => {
      const clearEntry = (setRegistry: React.Dispatch<React.SetStateAction<any>>) => {
          setRegistry((prev: Record<string, Record<string, any>>) => {
              if (!prev[nodeId]) return prev;
              const { [handleId]: _, ...rest } = prev[nodeId];
              return { ...prev, [nodeId]: rest };
          });
      };
      clearEntry(setResolvedRegistry);
      clearEntry(setPayloadRegistry);
      clearEntry(setReviewerRegistry);
      clearEntry(setPreviewRegistry);
      clearEntry(setAnalysisRegistry);
      clearEntry(setFeedbackRegistry);
  }, []);

  const triggerGlobalRefresh = useCallback(() => {
    setGlobalVersion(v => v + 1);
  }, []);

  // --- INSTANCE LIFECYCLE MANAGEMENT ---

  const addInstance = useCallback((nodeId: string) => {
    const newId = `inst_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // We update the data of the node within React Flow's state
    // We rely on useReactFlow's setNodes being available globally or passed in.
    // In our App.tsx context, we can provide this through the context.
    // For now, let's assume nodes are managed externally but we provide the logic.
    // (Actual implementation would pass setNodes through the provider)
  }, []);

  const removeInstance = useCallback((nodeId: string, instanceId: string) => {
    // 1. Clean Registries (Deep Purge Protocol)
    const cleanup = (registry: Record<string, Record<string, any>>, setter: React.Dispatch<React.SetStateAction<any>>) => {
        setter((prev: Record<string, Record<string, any>>) => {
            if (!prev[nodeId]) return prev;
            const newNodeRecord = { ...prev[nodeId] };
            
            // Remove any handle key that contains the specific instanceId
            Object.keys(newNodeRecord).forEach(handleKey => {
                if (handleKey.includes(instanceId)) {
                    delete newNodeRecord[handleKey];
                }
            });
            
            return { ...prev, [nodeId]: newNodeRecord };
        });
    };

    cleanup(resolvedRegistry, setResolvedRegistry);
    cleanup(payloadRegistry, setPayloadRegistry);
    cleanup(reviewerRegistry, setReviewerRegistry);
    cleanup(previewRegistry, setPreviewRegistry);
    cleanup(analysisRegistry, setAnalysisRegistry);
    cleanup(feedbackRegistry, setFeedbackRegistry);

    triggerGlobalRefresh();
  }, [resolvedRegistry, payloadRegistry, reviewerRegistry, previewRegistry, analysisRegistry, feedbackRegistry, triggerGlobalRefresh]);

  const value = useMemo(() => ({
    psdRegistry,
    templateRegistry,
    resolvedRegistry,
    payloadRegistry,
    reviewerRegistry,
    previewRegistry,
    analysisRegistry,
    feedbackRegistry,
    knowledgeRegistry,
    globalVersion,
    registerPsd,
    registerTemplate,
    registerResolved,
    registerPayload,
    registerReviewerPayload,
    registerPreviewPayload,
    updatePayload, 
    registerAnalysis,
    registerFeedback,
    clearFeedback,
    registerKnowledge,
    updatePreview,
    unregisterNode,
    flushPipelineInstance,
    triggerGlobalRefresh,
    addInstance,
    removeInstance
  }), [
    psdRegistry, templateRegistry, resolvedRegistry, payloadRegistry, reviewerRegistry, previewRegistry, analysisRegistry, feedbackRegistry, knowledgeRegistry, globalVersion,
    registerPsd, registerTemplate, registerResolved, registerPayload, registerReviewerPayload, registerPreviewPayload, updatePayload, registerAnalysis, registerFeedback, clearFeedback, registerKnowledge, updatePreview,
    unregisterNode, flushPipelineInstance, triggerGlobalRefresh, addInstance, removeInstance
  ]);

  return (
    <ProceduralContext.Provider value={value}>
      {children}
    </ProceduralContext.Provider>
  );
};

export const useProceduralStore = () => {
  const context = useContext(ProceduralContext);
  if (!context) {
    throw new Error('useProceduralStore must be used within a ProceduralStoreProvider');
  }
  return context;
};
