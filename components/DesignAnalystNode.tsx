
import * as React from 'react';
import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Handle, Position, NodeResizer, useEdges, useReactFlow, useUpdateNodeInternals, useNodes } from 'reactflow';
import type { NodeProps, Node, Edge } from 'reactflow';
import { PSDNodeData, LayoutStrategy, SerializableLayer, ChatMessage, AnalystInstanceState, MappingContext } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { getSemanticThemeObject, findLayerByPath } from '../services/psdService';
import { useKnowledgeScoper } from '../hooks/useKnowledgeScoper';
import { GoogleGenAI, Type } from "@google/genai";
// Added Plus icon to imports
import { Brain, BrainCircuit, Ban, Play, Eye, BookOpen, Tag, Activity, Minus, Maximize2, Trash2, RotateCcw, Sparkles, Plus } from 'lucide-react';
import { BaseNodeShell } from './shared/BaseNodeShell';

type ModelKey = 'gemini-3-flash' | 'gemini-3-pro' | 'gemini-3-pro-thinking';

const DEFAULT_INSTANCE_STATE: AnalystInstanceState = {
    chatHistory: [],
    layoutStrategy: null,
    selectedModel: 'gemini-3-pro',
    isKnowledgeMuted: false
};

interface ModelConfig {
  apiModel: string;
  label: string;
  badgeClass: string;
  headerClass: string;
  thinkingBudget?: number;
}

const MODELS: Record<ModelKey, ModelConfig> = {
  'gemini-3-flash': {
    apiModel: 'gemini-3-flash-preview',
    label: 'FLASH',
    badgeClass: 'bg-yellow-500 text-yellow-950 border-yellow-400',
    headerClass: 'border-yellow-500/50 bg-yellow-900/20'
  },
  'gemini-3-pro': {
    apiModel: 'gemini-3-pro-preview',
    label: 'PRO',
    badgeClass: 'bg-blue-600 text-white border-blue-500',
    headerClass: 'border-blue-500/50 bg-blue-900/20'
  },
  'gemini-3-pro-thinking': {
    apiModel: 'gemini-3-pro-preview',
    label: 'DEEP THINKING',
    badgeClass: 'bg-purple-600 text-white border-purple-500',
    headerClass: 'border-purple-500/50 bg-purple-900/20',
    thinkingBudget: 16384
  }
};

const StrategyCard: React.FC<{ strategy: LayoutStrategy, modelConfig: ModelConfig }> = ({ strategy, modelConfig }) => {
    const overrideCount = strategy.overrides?.length || 0;
    const directives = strategy.directives || [];
    const triangulation = strategy.triangulation;

    let methodColor = 'text-slate-400 border-slate-600';
    if (strategy.method === 'GENERATIVE') methodColor = 'text-purple-300 border-purple-500 bg-purple-900/20';
    else if (strategy.method === 'HYBRID') methodColor = 'text-pink-300 border-pink-500 bg-pink-900/20';
    else if (strategy.method === 'GEOMETRIC') methodColor = 'text-emerald-300 border-emerald-500 bg-emerald-900/20';
    
    let confidenceColor = 'text-slate-400 border-slate-600 bg-slate-800';
    if (triangulation?.confidence_verdict === 'HIGH') confidenceColor = 'text-emerald-300 border-emerald-500 bg-emerald-900/20';
    else if (triangulation?.confidence_verdict === 'MEDIUM') confidenceColor = 'text-yellow-300 border-yellow-500 bg-yellow-900/20';
    else if (triangulation?.confidence_verdict === 'LOW') confidenceColor = 'text-red-300 border-red-500 bg-red-900/20';

    return (
        <div 
            className={`bg-slate-800/80 border-l-2 p-3 rounded text-xs space-y-3 w-full cursor-text ${modelConfig.badgeClass.replace('bg-', 'border-').split(' ')[2]}`}
            onMouseDown={(e) => e.stopPropagation()}
        >
             <div className="flex justify-between border-b border-slate-700 pb-2">
                <span className={`font-bold ${modelConfig.badgeClass.includes('yellow') ? 'text-yellow-400' : 'text-blue-300'}`}>SEMANTIC RECOMPOSITION</span>
                <span className="text-slate-400">{strategy.anchor}</span>
             </div>
             <div className="flex flex-wrap gap-1 mt-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold tracking-wider ${methodColor}`}>{strategy.method || 'GEOMETRIC'}</span>
                {strategy.clearance && <span className="text-[9px] px-1.5 py-0.5 rounded border border-orange-500 text-orange-300 bg-orange-900/20 font-mono font-bold">CLEARANCE</span>}
             </div>
             {triangulation && (
                 <div className="mt-2 border border-slate-700 rounded overflow-hidden">
                     <div className={`px-2 py-1 flex items-center justify-between border-b border-slate-700/50 ${confidenceColor}`}>
                         <div className="flex items-center space-x-1.5"><Activity className="w-3 h-3" /><span className="text-[9px] font-bold uppercase tracking-wider">Confidence Audit</span></div>
                         <span className="text-[9px] font-mono font-bold">{triangulation.confidence_verdict} ({triangulation.evidence_count}/3)</span>
                     </div>
                     <div className="p-2 bg-slate-900/40 space-y-1.5">
                         <div className="flex items-start space-x-2"><Eye className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" /><div className="flex flex-col"><span className="text-[8px] text-slate-500 uppercase tracking-wide">Visual</span><span className="text-[9px] text-purple-200 leading-tight">{triangulation.visual_identification}</span></div></div>
                         <div className="flex items-start space-x-2"><BookOpen className="w-3 h-3 text-teal-400 mt-0.5 shrink-0" /><div className="flex flex-col"><span className="text-[8px] text-slate-500 uppercase tracking-wide">Knowledge</span><span className="text-[9px] text-teal-200 leading-tight">{triangulation.knowledge_correlation}</span></div></div>
                     </div>
                 </div>
             )}
             <div className="grid grid-cols-2 gap-4 mt-1">
                <div><span className="block text-slate-500 text-[10px] uppercase tracking-wider">Global Scale</span><span className="text-slate-200 font-mono text-sm">{strategy.suggestedScale.toFixed(3)}x</span></div>
                <div><span className="block text-slate-500 text-[10px] uppercase tracking-wider">Overrides</span><span className={`text-sm ${overrideCount > 0 ? 'text-pink-400 font-bold' : 'text-slate-400'}`}>{overrideCount} Layers</span></div>
             </div>
        </div>
    );
};

const InstanceRow: React.FC<any> = ({ 
    instId, state, settings, sourceData, targetData, onAnalyze, onModelChange, onToggleMute, onReset, onDelete, onToggleMinimize, isAnalyzing, activeKnowledge 
}) => {
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const isMinimized = settings?.isMinimized;
    const activeModelConfig = MODELS[state.selectedModel as ModelKey];
    const isReady = !!sourceData && !!targetData;
    const targetName = targetData?.name || (sourceData?.container.containerName) || 'Unknown';
    const theme = getSemanticThemeObject(targetName, 0);

    useEffect(() => {
        if (chatContainerRef.current) { chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; }
    }, [state.chatHistory.length, isAnalyzing]);

    return (
        <div className={`relative border-b border-slate-700/50 bg-slate-800/30 transition-all ${isMinimized ? 'h-10' : ''}`}>
            {/* Instance Header */}
            <div className={`px-3 py-1.5 flex items-center justify-between ${theme.bg.replace('/20', '/10')} border-b border-slate-700/30`}>
                <div className="flex items-center space-x-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${theme.dot}`}></div>
                    <span className={`text-[10px] font-bold tracking-wide uppercase ${theme.text}`}>{targetName}</span>
                    {isMinimized && <span className="text-[8px] bg-slate-700 text-slate-400 px-1 rounded uppercase">Minimized</span>}
                </div>
                
                <div className="flex items-center space-x-1.5">
                    <button onClick={() => onToggleMinimize(instId)} className="p-1 rounded hover:bg-slate-700/50 text-slate-400 transition-colors">
                        {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    </button>
                    {!isMinimized && (
                        <>
                            <button onClick={() => onReset(instId)} className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-orange-400" title="Reset History"><RotateCcw className="w-3 h-3" /></button>
                            <button onClick={() => onDelete(instId)} className="p-1 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-400" title="Delete Instance"><Trash2 className="w-3 h-3" /></button>
                        </>
                    )}
                </div>
            </div>

            {/* Content Area */}
            {!isMinimized && (
                <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between bg-slate-900/40 rounded p-2 border border-slate-700/30 relative min-h-[50px]">
                        <div className="flex flex-col gap-4 relative justify-center">
                            <div className="relative flex items-center h-4">
                                <Handle type="target" position={Position.Left} id={`source-in-${instId}`} className="!w-3 !h-3 !-left-7 !bg-indigo-500 !border-2 !border-slate-800" />
                                <span className={`text-[9px] font-mono font-bold ${sourceData ? 'text-indigo-300' : 'text-slate-600'}`}>SRC</span>
                            </div>
                            <div className="relative flex items-center h-4">
                                <Handle type="target" position={Position.Left} id={`target-in-${instId}`} className="!w-3 !h-3 !-left-7 !bg-emerald-500 !border-2 !border-slate-800" />
                                <span className={`text-[9px] font-mono font-bold ${targetData ? 'text-emerald-300' : 'text-slate-600'}`}>TGT</span>
                            </div>
                        </div>

                        <div className="flex-1 flex justify-center items-center opacity-30"><Brain className="w-4 h-4 text-slate-500" /></div>

                        <div className="flex flex-col gap-4 items-end relative justify-center">
                            <div className="relative flex items-center h-4">
                                <span className="text-[9px] font-mono font-bold text-slate-500 mr-1">SOURCE</span>
                                <Handle type="source" position={Position.Right} id={`source-out-${instId}`} className="!w-3 !h-3 !-right-7 !bg-indigo-500 !border-2 !border-white" />
                            </div>
                            <div className="relative flex items-center h-4">
                                <span className="text-[9px] font-mono font-bold text-slate-500 mr-1">TARGET</span>
                                <Handle type="source" position={Position.Right} id={`target-out-${instId}`} className="!w-3 !h-3 !-right-7 !bg-emerald-500 !border-2 !border-white" />
                            </div>
                        </div>
                    </div>

                    <div ref={chatContainerRef} className="nodrag nopan h-48 overflow-y-auto border border-slate-700 bg-slate-900 rounded p-2 space-y-2 custom-scrollbar">
                        {state.chatHistory.map((msg: any, idx: number) => (
                            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[95%] rounded border p-2 text-[10px] ${msg.role === 'user' ? 'bg-slate-800 border-slate-600 text-slate-200' : `bg-slate-800/50 border-purple-500/30 text-slate-300`}`}>
                                    {msg.role === 'user' ? msg.parts[0].text : msg.strategySnapshot && <StrategyCard strategy={msg.strategySnapshot} modelConfig={activeModelConfig} />}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button onClick={() => onAnalyze(instId)} disabled={!isReady || isAnalyzing} className={`w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center space-x-2 transition-all ${isReady && !isAnalyzing ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                        <Play className="w-3 h-3 fill-current" /><span>{isAnalyzing ? 'Thinking...' : 'Run Audit'}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export const DesignAnalystNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const instanceIds = useMemo(() => data.instanceIds || [], [data.instanceIds]);
  const instanceSettings = data.instanceSettings || {};
  const analystInstances = data.analystInstances || {};
  const [analyzingInstances, setAnalyzingInstances] = useState<Record<string, boolean>>({});
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { resolvedRegistry, templateRegistry, knowledgeRegistry, registerResolved, registerTemplate, unregisterNode, flushPipelineInstance, removeInstance } = useProceduralStore();

  useEffect(() => { updateNodeInternals(id); }, [id, instanceIds.length, data.isMinimized, updateNodeInternals]);

  const activeKnowledge = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'knowledge-in');
    return edge ? knowledgeRegistry[edge.source] : null;
  }, [edges, id, knowledgeRegistry]);

  const getSourceData = (instId: string) => {
    const edge = edges.find(e => e.target === id && e.targetHandle === `source-in-${instId}`);
    return edge ? resolvedRegistry[edge.source]?.[edge.sourceHandle || ''] : null;
  };

  const getTargetData = (instId: string) => {
    const edge = edges.find(e => e.target === id && e.targetHandle === `target-in-${instId}`);
    if (!edge) return null;
    const template = templateRegistry[edge.source];
    if (!template) return null;
    const containerName = edge.sourceHandle?.replace('slot-bounds-', '') || '';
    const container = template.containers.find(c => c.name === containerName);
    return container ? { bounds: container.bounds, name: container.name } : null;
  };

  const handleAddInstance = useCallback(() => {
    const newId = `inst_${Date.now()}`;
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceIds: [...(n.data.instanceIds || []), newId], instanceSettings: { ...instanceSettings, [newId]: { isMinimized: false } } } } : n));
  }, [id, setNodes, instanceSettings]);

  const handleDeleteInstance = useCallback((instId: string) => {
    removeInstance(id, instId);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceIds: (n.data.instanceIds || []).filter((rid: string) => rid !== instId) } } : n));
  }, [id, setNodes, removeInstance]);

  const handleToggleMinimize = useCallback((instId: string) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceSettings: { ...instanceSettings, [instId]: { ...instanceSettings[instId], isMinimized: !instanceSettings[instId]?.isMinimized } } } } : n));
  }, [id, setNodes, instanceSettings]);

  const handleAnalyze = async (instId: string) => {
    const sourceData = getSourceData(instId);
    const targetData = getTargetData(instId);
    if (!sourceData || !targetData) return;

    setAnalyzingInstances(prev => ({ ...prev, [instId]: true }));
    try {
        const apiKey = process.env.API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: "Perform geometric analysis and return strategy JSON.",
            config: { responseMimeType: "application/json" }
        });
        const json = JSON.parse(response.text || '{}');
        const newMsg = { id: Date.now().toString(), role: 'model', parts: [{ text: "Analysis Complete." }], strategySnapshot: json, timestamp: Date.now() };
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, analystInstances: { ...analystInstances, [instId]: { ...(analystInstances[instId] || DEFAULT_INSTANCE_STATE), chatHistory: [newMsg], layoutStrategy: json } } } } : n));
        registerResolved(id, `source-out-${instId}`, { ...sourceData, aiStrategy: json });
    } catch (e) { console.error(e); } finally { setAnalyzingInstances(prev => ({ ...prev, [instId]: false })); }
  };

  return (
    <BaseNodeShell id={id} title="Design Analyst" icon={<Brain className="w-4 h-4 text-purple-400" />} isMinimized={data.isMinimized} onMinimize={() => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n))} onDelete={() => setNodes(nds => nds.filter(n => n.id !== id))} headerColorClass="bg-slate-900 border-slate-700" className="w-[500px]">
        <Handle type="target" position={Position.Top} id="knowledge-in" className="!w-4 !h-4 !-top-2 !bg-emerald-500 !border-2 !border-slate-900 z-50" style={{ left: '50%', transform: 'translateX(-50%)' }} />
        <div className="flex flex-col">
            {instanceIds.map((instId) => (
                <InstanceRow key={instId} instId={instId} state={analystInstances[instId] || DEFAULT_INSTANCE_STATE} settings={instanceSettings[instId]} sourceData={getSourceData(instId)} targetData={getTargetData(instId)} onAnalyze={handleAnalyze} onToggleMinimize={handleToggleMinimize} onDelete={handleDeleteInstance} isAnalyzing={!!analyzingInstances[instId]} activeKnowledge={activeKnowledge} />
            ))}
        </div>
        <button onClick={handleAddInstance} className="w-full py-2 bg-slate-900 hover:bg-slate-700 border-t border-slate-700 text-slate-400 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center space-x-1">
            <Plus className="w-3 h-3" /><span>Add Instance</span>
        </button>
    </BaseNodeShell>
  );
});
