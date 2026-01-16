
import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { parsePsdFile, extractTemplateMetadata, getSemanticTheme } from '../services/psdService';
import { PSDNodeData, TemplateMetadata } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { BaseNodeShell } from './shared/BaseNodeShell';
import { Layout, CheckCircle, AlertTriangle, UploadCloud } from 'lucide-react';

const TargetTemplatePreview: React.FC<{ metadata: TemplateMetadata }> = ({ metadata }) => {
  const { canvas, containers } = metadata;
  const aspectRatio = canvas.height / canvas.width;
  const PREVIEW_WIDTH = 224;
  const previewHeight = PREVIEW_WIDTH * aspectRatio;

  return (
    <div className="w-full mt-2 flex flex-col items-center">
      <div className="w-full flex justify-between items-end mb-1 px-1">
        <span className="text-[10px] uppercase text-emerald-400 font-semibold tracking-wider">Target Layout</span>
        <span className="text-[9px] text-emerald-600/70">{canvas.width} x {canvas.height}</span>
      </div>
      <div 
        className="relative w-56 bg-black/40 border border-emerald-900/50 rounded overflow-hidden shadow-inner"
        style={{ height: `${previewHeight}px` }}
      >
        <div className="absolute inset-0">
          {containers.map((container, index) => (
            <div
              key={container.id}
              className={`absolute border border-dashed flex items-center justify-center transition-opacity hover:opacity-100 opacity-70 ${getSemanticTheme(container.originalName, index)}`}
              style={{
                top: `${container.normalized.y * 100}%`,
                left: `${container.normalized.x * 100}%`,
                width: `${container.normalized.w * 100}%`,
                height: `${container.normalized.h * 100}%`,
              }}
              title={`${container.name} (${container.bounds.w}x${container.bounds.h})`}
            >
              <div className="text-[8px] font-mono truncate px-0.5 bg-black/40 rounded">{container.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const TargetTemplateNode = memo(({ data, id }: NodeProps<PSDNodeData>) => {
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setNodes } = useReactFlow();

  const { psdRegistry, registerPsd, registerTemplate, unregisterNode } = useProceduralStore();

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

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLocalError(null);

    try {
      const parsedPsd = await parsePsdFile(file, { skipLayerImageData: true, skipThumbnail: true });
      const templateData = extractTemplateMetadata(parsedPsd);

      if (templateData.containers.length === 0) {
        throw new Error("INVALID TARGET: No !!TEMPLATE Group Found");
      }

      registerPsd(id, parsedPsd);
      registerTemplate(id, templateData);

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                fileName: file.name,
                template: templateData,
                error: null,
              },
            };
          }
          return node;
        })
      );
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to parse Target PSD';
      setLocalError(errorMessage);
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: { ...node.data, error: errorMessage },
            };
          }
          return node;
        })
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, setNodes, registerPsd, registerTemplate]);

  const handleBoxClick = () => fileInputRef.current?.click();
  
  const headerIcon = isDehydrated 
    ? <AlertTriangle className="w-4 h-4 text-orange-400" />
    : <Layout className="w-4 h-4 text-emerald-300" />;

  const statusBadge = isDataLoaded && (
    <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
      <CheckCircle className="w-2.5 h-2.5" /> READY
    </span>
  );

  return (
    <BaseNodeShell
      id={id}
      title={isDehydrated ? 'Target Missing Binary' : (data.fileName || 'Target Template')}
      icon={headerIcon}
      isMinimized={data.isMinimized}
      onMinimize={handleMinimize}
      onDelete={() => setNodes(nds => nds.filter(n => n.id !== id))}
      statusBadge={statusBadge}
      headerColorClass={isDehydrated ? 'bg-orange-950/50 border-orange-700' : 'bg-emerald-950 border-emerald-800'}
      className="w-72"
    >
      <input type="file" accept=".psd" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

      {isDehydrated && !isLoading && (
          <div className="flex flex-col space-y-3">
              <div className="text-[11px] text-orange-200/90 leading-tight bg-orange-900/20 p-2 rounded border border-orange-500/20">
                 <strong>Structure loaded, binary missing.</strong><br/>
                 Required for assembly: <span className="font-mono text-orange-100 bg-black/20 px-1 rounded">{data.fileName}</span>
              </div>
              <button onClick={handleBoxClick} className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-xs font-bold uppercase tracking-wider shadow-lg transition-colors flex items-center justify-center space-x-2">
                  <UploadCloud className="w-4 h-4" />
                  <span>Re-upload File</span>
              </button>
          </div>
      )}

      {!isDataLoaded && !isLoading && !isDehydrated && (
        <div onClick={handleBoxClick} className="group cursor-pointer border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-md p-6 flex flex-col items-center justify-center transition-colors bg-slate-800/50 hover:bg-slate-700/50">
             <UploadCloud className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 mb-2 transition-colors" />
             <span className="text-xs text-slate-400 group-hover:text-slate-300 text-center font-medium">Load Target .psd</span>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-6 space-y-3 text-emerald-500">
          <Layout className="w-8 h-8 animate-spin" />
          <span className="text-xs text-slate-300">Analyzing target structure...</span>
        </div>
      )}

      {isDataLoaded && !isLoading && !isDehydrated && (
           <div className="bg-slate-900/50 rounded p-3 border border-slate-700">
              <div className="flex items-center space-x-2 mb-2">
                 <div className="bg-emerald-500/20 text-emerald-400 p-1 rounded-full shrink-0">
                   <CheckCircle className="w-3 h-3" />
                 </div>
                 <span className="text-xs font-medium text-slate-200 truncate" title={data.fileName || ''}>{data.fileName}</span>
              </div>
              {data.template && <TargetTemplatePreview metadata={data.template} />}
              <div className="flex justify-end mt-2">
                <button onClick={handleBoxClick} className="py-1 px-3 bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-300 rounded transition-colors uppercase font-medium tracking-wide">Replace</button>
              </div>
           </div>
        )}

      {(localError || data.error) && !isLoading && (
        <div className="mt-2 p-3 bg-red-900/30 border border-red-800 rounded text-[10px] text-red-200">
          {localError || data.error}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="source-out-metadata"
        className={`!w-3 !h-3 !border-2 transition-colors duration-300 ${isDataLoaded && hasBinary ? '!bg-emerald-500 !border-white' : '!bg-slate-600 !border-slate-400'}`}
      />
    </BaseNodeShell>
  );
});
