
import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from 'reactflow';
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
  const { setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { psdRegistry, registerPsd, registerTemplate, unregisterNode } = useProceduralStore();

  // [PHASE 5.1]: RE-HYDRATION LOGIC
  useEffect(() => {
    if (data.template) {
      console.log(`[TargetTemplate] Re-hydrating store with template for node ${id}`);
      registerTemplate(id, data.template);
      updateNodeInternals(id);
    }
  }, [id, data.template, registerTemplate, updateNodeInternals]);

  useEffect(() => {
    return () => unregisterNode(id);
  }, [id, unregisterNode]);

  const isDataLoaded = !!data.template;
  const hasBinary = !!psdRegistry[id];
  const isDehydrated = isDataLoaded && !hasBinary;

  const handleMinimize = useCallback(() => {
    setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...node.data, isMinimized: !node.data.isMinimized } } : node));
  }, [id, setNodes]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true); setLocalError(null);
    try {
      const parsedPsd = await parsePsdFile(file, { skipLayerImageData: true, skipThumbnail: true });
      const templateData = extractTemplateMetadata(parsedPsd);
      if (templateData.containers.length === 0) throw new Error("INVALID TARGET: No !!TEMPLATE Group Found");
      registerPsd(id, parsedPsd);
      registerTemplate(id, templateData);
      setNodes((nodes) => nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, fileName: file.name, template: templateData, error: null } } : node));
    } catch (err: any) {
      setLocalError(err.message || 'Failed to parse Target PSD');
    } finally { setIsLoading(false); }
  }, [id, setNodes, registerPsd, registerTemplate]);

  const handleDelete = () => {
    unregisterNode(id);
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
  };

  return (
    <BaseNodeShell
      id={id} title={isDehydrated ? 'Target Missing Binary' : (data.fileName || 'Target Template')}
      icon={<Layout className="w-4 h-4 text-emerald-300" />} isMinimized={data.isMinimized} onMinimize={handleMinimize}
      onDelete={handleDelete} headerColorClass={isDehydrated ? 'bg-orange-950/50 border-orange-700' : 'bg-emerald-950 border-emerald-800'}
      className="w-72"
    >
      <input type="file" accept=".psd" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
      {isDataLoaded && <TargetTemplatePreview metadata={data.template!} />}
      {!isDataLoaded && !isLoading && (
        <div onClick={() => fileInputRef.current?.click()} className="group cursor-pointer border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-md p-6 flex flex-col items-center justify-center transition-colors bg-slate-800/50 hover:bg-slate-700/50">
             <UploadCloud className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 mb-2" />
             <span className="text-xs text-slate-400">Load Target PSD</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} id="source-out-metadata" className={`!w-3 !h-3 !border-2 ${isDataLoaded ? '!bg-emerald-500 !border-white' : '!bg-slate-600 !border-slate-400'}`} />
    </BaseNodeShell>
  );
});
