
import React, { memo, useMemo, useCallback, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals } from 'reactflow';
import type { NodeProps, Node } from 'reactflow';
import { PSDNodeData } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { getSemanticThemeObject } from '../services/psdService';
import { BaseNodeShell } from './shared/BaseNodeShell';
import { Scissors, Layers } from 'lucide-react';

export const TemplateSplitterNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const edges = useEdges();
  const nodes = useNodes();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const sourceNode = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'target-in-psd');
    if (!edge) return null;
    return nodes.find(n => n.id === edge.source) as Node<PSDNodeData> | undefined;
  }, [edges, nodes, id]);

  const template = sourceNode?.data?.template;
  
  useEffect(() => { updateNodeInternals(id); }, [id, data.isMinimized, template?.containers.length, updateNodeInternals]);

  const sortedContainers = useMemo(() => {
      if (!template?.containers) return [];
      return [...template.containers].sort((a, b) => a.name.localeCompare(b.name));
  }, [template]);

  const handleMinimize = useCallback(() => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  }, [id, setNodes]);

  return (
    <BaseNodeShell id={id} title="Template Splitter" icon={<Scissors className="w-4 h-4 text-pink-500" />} isMinimized={data.isMinimized} onMinimize={handleMinimize} onDelete={() => setNodes(nds => nds.filter(n => n.id !== id))} className="min-w-[220px]">
      <Handle type="target" position={Position.Left} id="target-in-psd" className="!w-3 !h-3 !bg-blue-500 !border-2 !border-slate-800" />
      <div className="space-y-1">
        {!sourceNode || !template ? (
          <div className="flex flex-col items-center justify-center py-4 text-slate-500 italic text-[10px]">Awaiting Source...</div>
        ) : sortedContainers.length === 0 ? (
          <div className="text-[10px] text-slate-500 text-center py-2">No containers found</div>
        ) : (
          sortedContainers.map((container, index) => {
            const theme = getSemanticThemeObject(container.name, index);
            const isConnected = edges.some(e => e.source === id && e.sourceHandle === `source-out-slot-${container.name}`);
            return (
              <div key={container.id} className="relative flex items-center justify-between p-1.5 rounded border border-slate-700/50 bg-slate-900/30 group hover:border-slate-600 transition-colors">
                <div className="flex items-center space-x-2 overflow-hidden">
                   <div className={`w-1.5 h-1.5 rounded-full ${theme.dot} shrink-0`}></div>
                   <span className={`text-[10px] font-bold truncate ${theme.text}`} title={container.name}>{container.name}</span>
                </div>
                <Handle type="source" position={Position.Right} id={`source-out-slot-${container.name}`} className={`!w-3 !h-3 !border-2 transition-colors duration-300 ${isConnected ? '!bg-emerald-500 !border-white' : '!bg-slate-600 !border-slate-400'}`} />
              </div>
            );
          })
        )}
      </div>
    </BaseNodeShell>
  );
});
