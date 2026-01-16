
import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useEdges } from 'reactflow';
import { PSDNodeData, TransformedPayload, ChatMessage, ReviewerInstanceState, TransformedLayer } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { ShieldCheck, RotateCcw, Check, MessageSquare } from 'lucide-react';
import { BaseNodeShell } from './shared/BaseNodeShell';

const DEFAULT_INSTANCE_STATE: ReviewerInstanceState = { chatHistory: [], reviewerStrategy: null };

export const DesignReviewerNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
    const instanceCount = data.instanceCount || 1;
    const reviewerInstances = data.reviewerInstances || {};
    const edges = useEdges();
    const { setNodes, setEdges } = useReactFlow();
    const { payloadRegistry, updatePayload, unregisterNode } = useProceduralStore();

    const handleMinimize = () => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
    const handleDelete = () => { unregisterNode(id); setNodes(nds => nds.filter(n => n.id !== id)); setEdges(eds => eds.filter(e => e.source !== id && e.target !== id)); };

    const handleVerify = (index: number) => {
        const edge = edges.find(e => e.target === id && e.targetHandle === `target-in-payload-${index}`);
        const sourcePayload = edge ? payloadRegistry[edge.source]?.[edge.sourceHandle || ''] : null;
        if (sourcePayload) {
            updatePayload(id, `source-out-polished-${index}`, { ...sourcePayload, isPolished: true, status: 'success' });
        }
    };

    return (
        <BaseNodeShell
            id={id}
            title="Design Reviewer"
            icon={<ShieldCheck className="w-4 h-4 text-emerald-300" />}
            isMinimized={data.isMinimized}
            onMinimize={handleMinimize}
            onDelete={handleDelete}
            headerColorClass="bg-emerald-950 border-emerald-800"
            className="w-[450px]"
        >
            <Handle type="target" position={Position.Top} id="target-in-knowledge" className="!w-4 !h-4 !-top-2 !bg-emerald-500 !border-2 !border-slate-900 z-50" style={{ left: '50%', transform: 'translateX(-50%)' }} />
            <div className="space-y-2">
                {Array.from({ length: instanceCount }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-900/50 rounded border border-slate-700 relative">
                        <Handle type="target" position={Position.Left} id={`target-in-payload-${i}`} className="!w-3 !h-3 !-left-1.5 !bg-purple-500 !border-white" />
                        <span className="text-[10px] font-bold text-slate-300 uppercase">Instance {i + 1}</span>
                        <div className="flex space-x-2">
                            <button onClick={() => handleVerify(i)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-bold uppercase">Verify</button>
                        </div>
                        <Handle type="source" position={Position.Right} id={`source-out-polished-${i}`} className="!w-3 !h-3 !-right-1.5 !bg-emerald-500 !border-white" />
                    </div>
                ))}
            </div>
            <button onClick={() => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceCount: instanceCount + 1 } } : n))} className="w-full py-2 bg-slate-900 mt-2 hover:bg-slate-700 text-slate-400 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-700">+ Add Audit</button>
        </BaseNodeShell>
    );
});
