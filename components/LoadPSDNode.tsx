
import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { parsePsdFile, extractTemplateMetadata, mapLayersToContainers, getCleanLayerTree, getSemanticTheme } from '../services/psdService';
import { PSDNodeData, TemplateMetadata } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { BaseNodeShell } from './shared/BaseNodeShell';
import { UploadCloud, FileType, CheckCircle, AlertTriangle } from 'lucide-react';

// Sub-component for visualizing the template structure
const TemplatePreview: React.FC<{ metadata: TemplateMetadata }> = ({ metadata }) => {
  const { canvas, containers } = metadata;
  const aspectRatio = canvas.height / canvas.width;
  const PREVIEW_WIDTH = 224;
  const previewHeight = PREVIEW_WIDTH * aspectRatio;

  return (
    <div className="w-full mt-2 flex flex-col items-center">
      <div className="w-full flex justify-between items-end mb-1 px-1">
        <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Template Preview</span>
        <span className="text-[9px] text-slate-600">{canvas.width} x {canvas.height}</span>
      </div>
      
      <div 
        className="relative w-56 bg-black/40 border border-slate-700 rounded overflow-hidden shadow-sm"
        style={{ height: `${previewHeight}px` }}
      >
        <div className="absolute inset-0">
          {containers.length === 0 && (
            <div className="flex items-center justify-center h-full w-full text-slate-600 text-[10px]">
              No !!TEMPLATE group found
            </div>
          )}
          
          {containers.map((container, index) => (
            <div
              key={container.id}
              className={`absolute border flex flex-col justify-start items-start overflow-hidden transition-opacity hover:opacity-100 opacity-80 ${getSemanticTheme(container.originalName, index)}`}
              style={{
                top: `${container.normalized.y * 100}%`,
                left: `${container.normalized.x * 100}%`,
                width: `${container.normalized.w * 100}%`,
                height: `${container.normalized.h * 100}%`,
              }}
              title={`${container.name} (${container.bounds.w}x${container.bounds.h})`}
            >
              <div className="px-1 py-0.5 bg-black/40 text-[8px] whitespace-nowrap truncate w-full leading-none">
                {container.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const LoadPSDNode = memo(({ data, id }: NodeProps<PSDNodeData>) => {
  // Moved to top and fixed self-reference initialization
  const [localError, setLocalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setNodes, setEdges } = useReactFlow();
  
  const { psdRegistry, registerPsd, registerTemplate, unregisterNode, removeInstance, triggerGlobalRefresh } = useProceduralStore();

  const isDataLoaded = !!data.template;
  const hasBinary = !!psdRegistry[id];
  const isDehydrated = isDataLoaded && !hasBinary;

  const handleMinimize = useCallback(() => {
    setNodes((nds) => nds.map((node) => {
      if (node.id === id) {
        return { ...node, data: { ...node.data, isMinimized: !node.data.isMinimized } };
      }
      return node;
    }));
  }, [id, setNodes]);

  const handleDelete = useCallback(() => {
    // 1. Centralized Deletion Logic: Clear instances first
    if (data.instanceIds) {
        data.instanceIds.forEach(instId => removeInstance(id, instId));
    } else if (data.instanceCount) {
        // Fallback for legacy indexing
        for (let i = 0; i < data.instanceCount; i++) {
            removeInstance(id, `legacy-inst-${i}`);
        }
    }
    
    // 2. Purge Node from Procedural Store Registry
    unregisterNode(id);
    
    // 3. Final removal from React Flow Graph
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  }, [id, data.instanceIds, data.instanceCount, setNodes, setEdges, unregisterNode, removeInstance]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLocalError(null);

    try {
      const parsedPsd = await parsePsdFile(file);
      const templateData = extractTemplateMetadata(parsedPsd);
      const validationReport = mapLayersToContainers(parsedPsd, templateData);
      const designLayers = parsedPsd.children ? getCleanLayerTree(parsedPsd.children) : [];

      registerPsd(id, parsedPsd);
      registerTemplate(id, templateData);
      triggerGlobalRefresh();

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                fileName: file.name,
                template: templateData,
                validation: validationReport,
                designLayers: designLayers,
                error: null,
              },
            };
          }
          return node;
        })
      );
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to parse PSD';
      setLocalError(errorMessage);
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return { ...node, data: { ...node.data, error: errorMessage } };
          }
          return node;
        })
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, setNodes, registerPsd, registerTemplate, triggerGlobalRefresh]);

  const handleBoxClick = () => fileInputRef.current?.click();

  const headerIcon = isDehydrated 
    ? <AlertTriangle className="w-4 h-4 text-orange-400" />
    : <FileType className="w-4 h-4 text-blue-400" />;

  const statusBadge = isDataLoaded && (
    <span className="text-[9px] text-emerald-400/80 font-mono flex items-center gap-1">
      <CheckCircle className="w-2.5 h-2.5" /> READY
    </span>
  );

  return (
    <BaseNodeShell
      id={id}
      title={isDehydrated ? 'Missing Binary' : (data.fileName || 'Load PSD')}
      icon={headerIcon}
      isMinimized={data.isMinimized}
      onMinimize={handleMinimize}
      onDelete={handleDelete}
      statusBadge={statusBadge}
      headerColorClass={isDehydrated ? 'bg-orange-900/50 border-orange-700' : 'bg-slate-900 border-slate-700'}
      className="w-72"
    >
      <input
        type="file"
        accept=".psd"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {isDehydrated && !isLoading && (
          <div className="flex flex-col space-y-3">
              <div className="text-[11px] text-orange-200/90 leading-tight bg-orange-900/20 p-2 rounded border border-orange-500/20">
                 <strong>Binary Data Missing.</strong><br/>
                 Project structure was loaded, but the binary data is needed.
                 <br/><br/>
                 Required: <span className="font-mono text-orange-100 bg-black/20 px-1 rounded">{data.fileName}</span>
              </div>
              
              <button 
                onClick={handleBoxClick}
                className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-xs font-bold uppercase tracking-wider shadow-lg transition-colors flex items-center justify-center space-x-2"
              >
                  <UploadCloud className="w-4 h-4" />
                  <span>Re-upload File</span>
              </button>
          </div>
      )}

      {!isDataLoaded && !isLoading && !isDehydrated && (
        <div 
          onClick={handleBoxClick}
          className="group cursor-pointer border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-md p-6 flex flex-col items-center justify-center transition-colors bg-slate-800/50 hover:bg-slate-700/50"
        >
          <UploadCloud className="w-10 h-10 text-slate-500 group-hover:text-blue-400 mb-2 transition-colors" />
          <span className="text-xs text-slate-400 group-hover:text-slate-300 text-center font-medium">
            Click to select .psd file
          </span>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-6 space-y-3 text-slate-300">
          <FileType className="w-8 h-8 animate-bounce text-blue-500" />
          <span className="text-sm">Parsing structure...</span>
        </div>
      )}

      {isDataLoaded && !isLoading && !isDehydrated && (
        <div className="bg-slate-900/50 rounded p-3 border border-slate-700">
          <div className="flex items-center space-x-2 mb-3">
            <div className="bg-green-500/20 text-green-400 p-1 rounded-full shrink-0">
              <CheckCircle className="w-3 h-3" />
            </div>
            <span className="text-xs font-medium text-slate-200 truncate" title={data.fileName || ''}>
              {data.fileName}
            </span>
          </div>
          
          {data.template && <TemplatePreview metadata={data.template} />}

          {data.validation && (
            <div className={`mt-3 p-2 rounded border text-[10px] ${data.validation.isValid ? 'border-green-800 bg-green-900/20 text-green-300' : 'border-orange-800 bg-orange-900/20 text-orange-200'}`}>
              <div className="flex items-center space-x-1 mb-1">
                <span className="font-bold uppercase tracking-wider">{data.validation.isValid ? 'Structure Valid' : 'Violations Detected'}</span>
              </div>
              {!data.validation.isValid && (
                <ul className="list-disc pl-3 space-y-0.5 opacity-90">
                  {data.validation.issues.slice(0, 3).map((issue, i) => (
                    <li key={i} className="leading-tight">{issue.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          
          <div className="flex justify-end mt-2">
              <button 
                onClick={handleBoxClick}
                className="py-1 px-3 bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-300 rounded transition-colors uppercase font-medium tracking-wide"
              >
              Replace
              </button>
          </div>
        </div>
      )}

      {(localError || data.error) && (
        <div className="mt-2 p-3 bg-red-900/30 border border-red-800 rounded text-xs text-red-200">
          {localError || data.error}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="psd-output"
        isConnectable={isDataLoaded}
        className={`!w-3 !h-3 !border-2 transition-colors duration-300 ${isDataLoaded ? '!bg-blue-500 !border-white hover:!bg-blue-400' : '!bg-slate-600 !border-slate-400'}`}
      />
    </BaseNodeShell>
  );
});
