
import React, { memo, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, useEdges, useUpdateNodeInternals, useReactFlow } from 'reactflow';
import { PSDNodeData, TransformedPayload } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { compositePayloadToCanvas } from '../services/psdService';
import { MonitorPlay, Layers, Maximize, Scan } from 'lucide-react';
import { BaseNodeShell } from './shared/BaseNodeShell';

const PreviewMonitor = ({ index, nodeId }: { index: number, nodeId: string }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const edges = useEdges();
    const { payloadRegistry, psdRegistry, registerPreviewPayload } = useProceduralStore();

    const incomingPayload = useMemo(() => {
        const edge = edges.find(e => e.target === nodeId && e.targetHandle === `target-in-payload-${index}`);
        return edge ? payloadRegistry[edge.source]?.[edge.sourceHandle || ''] : null;
    }, [edges, nodeId, index, payloadRegistry]);

    useEffect(() => {
        if (!incomingPayload) { setPreviewUrl(null); return; }
        const psd = psdRegistry[incomingPayload.sourceNodeId];
        if (psd) {
            compositePayloadToCanvas(incomingPayload, psd).then(url => {
                if (url) {
                    setPreviewUrl(url);
                    registerPreviewPayload(nodeId, `source-out-preview-${index}`, incomingPayload, url);
                }
            });
        }
    }, [incomingPayload, psdRegistry, nodeId, index, registerPreviewPayload]);

    return (
        <div className="border-b border-slate-700/50 p-2 last:border-0 relative">
            <Handle type="target" position={Position.Left} id={`target-in-payload-${index}`} className="!w-3 !h-3 !-left-1.5 !bg-indigo-500" />
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{incomingPayload?.targetContainer || 'Idle Monitor'}</span>
                <Handle type="source" position={Position.Right} id={`source-out-preview-${index}`} className="!w-3 !h-3 !-right-1.5 !bg-emerald-500" />
            </div>
            <div className="aspect-video bg-black/40 rounded border border-slate-700 flex items-center justify-center overflow-hidden">
                {previewUrl ? <img src={previewUrl} className="max-w-full max-h-full object-contain" /> : <Scan className="w-6 h-6 text-slate-700 opacity-30" />}
            </div>
        </div>
    );
};

export const ContainerPreviewNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const instanceCount = data.instanceCount || 1;
  const { setNodes, setEdges } = useReactFlow();
  const { unregisterNode } = useProceduralStore();

  const handleMinimize = () => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  const handleDelete = () => { unregisterNode(id); setNodes(nds => nds.filter(n => n.id !== id)); setEdges(eds => eds.filter(e => e.source !== id && e.target !== id)); };

  return (
    <BaseNodeShell
      id={id}
      title="Monitor Output"
      icon={<MonitorPlay className="w-4 h-4 text-emerald-400" />}
      isMinimized={data.isMinimized}
      onMinimize={handleMinimize}
      onDelete={handleDelete}
      headerColorClass="bg-emerald-950 border-emerald-800"
      className="w-[450px]"
    >
      <div className="flex flex-col">
        {Array.from({ length: instanceCount }).map((_, i) => <PreviewMonitor key={i} index={i} nodeId={id} />)}
      </div>
      <button onClick={() => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceCount: instanceCount + 1 } } : n))} className="w-full py-2 bg-slate-900 mt-2 hover:bg-slate-700 text-slate-400 text-[10px] font-bold uppercase rounded border border-slate-700">+ Add Monitor</button>
    </BaseNodeShell>
  );
});
