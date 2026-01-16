
import React, { memo, useMemo, useEffect, useCallback } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals } from 'reactflow';
import type { NodeProps, Node } from 'reactflow';
import { PSDNodeData } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { getSemanticThemeObject } from '../services/psdService';
import { BaseNodeShell } from './shared/BaseNodeShell';
import { BoxSelect, LayoutGrid } from 'lucide-react';

export const TargetSplitterNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { templateRegistry, registerTemplate, unregisterNode } = useProceduralStore();

  const upstreamNodeId = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'target-in-metadata');
    return edge ? edge.source : null;
  }, [edges, id]);

  const template = useMemo(() => {
      // Priority: Upstream store lookup, then local node data if re-hydrating
      if (upstreamNodeId && templateRegistry[upstreamNodeId]) {
          return templateRegistry[upstreamNodeId];
      }
      return data.template || null;
  }, [upstreamNodeId, templateRegistry, data.template]);

  // [PHASE 5.1]: RE-HYDRATION LOGIC
  useEffect(() => {
    if (template) {
        console.log(`[TargetSplitter] Re-hydrating store with template registry for node ${id}`);
        registerTemplate(id, template);
        updateNodeInternals(id);
    }
  }, [id, template, registerTemplate, updateNodeInternals]);

  useEffect(() => { return () => unregisterNode(id); }, [id, unregisterNode]);
  useEffect(() => { updateNodeInternals(id); }, [id, data.isMinimized, template?.containers.length, updateNodeInternals]);

  const sortedContainers = useMemo(() => {
      if (!template?.containers) return [];
      return [...template.containers].sort((a, b) => a.name.localeCompare(b.name));
  }, [template]);

  const handleMinimize = useCallback(() => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  }, [id, setNodes]);

  return (
    <BaseNodeShell id={id} title="Target Splitter" icon={<BoxSelect className="w-4 h-4 text-emerald-400" />} isMinimized={data.isMinimized} onMinimize={handleMinimize} onDelete={() => setNodes(nds => nds.filter(n => n.id !== id))} headerColorClass="bg-emerald-950 border-emerald-800" className="min-w-[280px]">
       <Handle type="target" position={Position.Left} id="target-in-metadata" className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-slate-800" />
       <div className="space-y-3">
        {!template ? (
          <div className="flex flex-col items-center justify-center py-4 text-slate-500 italic text-[10px] border border-dashed border-slate-700 rounded bg-slate-900/30">Connect Metadata Source...</div>
        ) : (
             <div className="space-y-1">
               {sortedContainers.map((container, index) => {
                 const isFilled = edges.some(e => e.target === id && e.targetHandle === `target-in-slot-${container.name}`);
                 const theme = getSemanticThemeObject(container.name, index);
                 return (
                   <div key={container.id} className={`relative flex items-center justify-between p-2 rounded border transition-colors ${isFilled ? `${theme.bg.replace('/20', '/10')} ${theme.border.replace('border-', 'border-opacity-30 border-')}` : 'bg-slate-900/30 border-slate-700/50'}`}>
                     <Handle type="target" position={Position.Left} id={`target-in-slot-${container.name}`} className={`!w-3 !h-3 !border-2 ${isFilled ? `${theme.dot} !border-white` : '!bg-slate-700 !border-slate-500'}`} />
                     <div className="flex flex-col leading-tight overflow-hidden w-full mx-3">
                        <span className={`text-[10px] font-bold truncate ${isFilled ? theme.text : 'text-slate-400'}`}>{container.name}</span>
                        <span className="text-[8px] text-slate-600 font-mono">{Math.round(container.normalized.w * 100)}% x {Math.round(container.normalized.h * 100)}%</span>
                     </div>
                     {/* [PHASE 5.1]: STABLE HANDLE ID ALIGNMENT */}
                     <Handle type="source" position={Position.Right} id={`slot-out-${container.id}`} className="!w-3 !h-3 !bg-emerald-500 !border-white" />
                   </div>
                 );
               })}
             </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
