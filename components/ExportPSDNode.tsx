
import React, { memo, useState, useMemo, useEffect } from 'react';
import { Handle, Position, NodeProps, useEdges, useReactFlow } from 'reactflow';
import { PSDNodeData, TransformedPayload } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { writePsdFile } from '../services/psdService';
import { Layer, Psd } from 'ag-psd';
import { BaseNodeShell } from './shared/BaseNodeShell';
import { Download, Layout, ShieldCheck } from 'lucide-react';

export const ExportPSDNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const [isExporting, setIsExporting] = useState(false);
  const edges = useEdges();
  const { setNodes, setEdges } = useReactFlow();
  const { psdRegistry, templateRegistry, reviewerRegistry, unregisterNode } = useProceduralStore();

  const templateMetadata = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'target-in-template');
    return edge ? templateRegistry[edge.source] : null;
  }, [edges, id, templateRegistry]);

  const slotConnections = useMemo(() => {
    const map = new Map<string, TransformedPayload>();
    edges.forEach(edge => {
      if (edge.target === id && edge.targetHandle?.startsWith('target-in-input-')) {
        const slotName = edge.targetHandle.replace('target-in-input-', '');
        const payload = reviewerRegistry[edge.source]?.[edge.sourceHandle || ''];
        if (payload?.isPolished) map.set(slotName, payload);
      }
    });
    return map;
  }, [edges, id, reviewerRegistry]);

  const handleExport = async () => {
    if (!templateMetadata) return;
    setIsExporting(true);
    try {
      const newPsd: Psd = { width: templateMetadata.canvas.width, height: templateMetadata.canvas.height, children: [] };
      // Simulating assembly logic...
      await writePsdFile(newPsd, `EXPORT_${Date.now()}.psd`);
    } finally { setIsExporting(false); }
  };

  const handleMinimize = () => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  const handleDelete = () => { unregisterNode(id); setNodes(nds => nds.filter(n => n.id !== id)); setEdges(eds => eds.filter(e => e.source !== id && e.target !== id)); };

  return (
    <BaseNodeShell
      id={id}
      title="PSD Export"
      icon={<Download className="w-4 h-4 text-indigo-400" />}
      isMinimized={data.isMinimized}
      onMinimize={handleMinimize}
      onDelete={handleDelete}
      className="w-[300px]"
    >
      <div className="space-y-2">
        <div className="relative pl-4 py-2 bg-slate-900 rounded border border-slate-700">
          <Handle type="target" position={Position.Left} id="target-in-template" className="!w-3 !h-3 !-left-1.5 !bg-emerald-500" />
          <span className="text-[10px] text-slate-400 font-mono uppercase">Template Context</span>
        </div>
        <div className="space-y-1">
          {templateMetadata?.containers.map(c => (
            <div key={c.id} className="relative pl-4 py-2 bg-slate-900 rounded border border-slate-700 flex justify-between">
              <Handle type="target" position={Position.Left} id={`target-in-input-${c.name}`} className="!w-3 !h-3 !-left-1.5 !bg-indigo-500" />
              <span className="text-[10px] text-slate-300 font-bold truncate">{c.name}</span>
              {slotConnections.has(c.name) && <ShieldCheck className="w-3 h-3 text-emerald-400" />}
            </div>
          ))}
        </div>
        <button onClick={handleExport} disabled={!templateMetadata || isExporting} className={`w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold uppercase tracking-widest ${!templateMetadata ? 'opacity-30' : ''}`}>
          {isExporting ? 'Constructing...' : 'Generate PSD'}
        </button>
      </div>
    </BaseNodeShell>
  );
});
