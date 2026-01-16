
import React, { memo, useMemo, useEffect, useCallback, useState, useRef } from 'react';
import { Handle, Position, NodeProps, useEdges, useReactFlow, useNodes, useUpdateNodeInternals } from 'reactflow';
import { PSDNodeData, SerializableLayer, TransformedPayload, TransformedLayer, LayoutStrategy } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { Check, Sparkles, Minus, Maximize2, Trash2, Plus, Layers, Box, Cpu } from 'lucide-react';
import { BaseNodeShell } from './shared/BaseNodeShell';

const RemapperInstanceRow = memo(({ 
    instId, nodeId, settings, source, target, payload, onToggleMinimize, onDeleteInstance 
}: {
    instId: string, nodeId: string, settings: any, source: any, target: any, payload: any, onToggleMinimize: (id: string) => void, onDeleteInstance: (id: string) => void
}) => {
    const isMinimized = settings?.isMinimized;
    const audit = useMemo(() => payload?.layers ? { pixel: 10, group: 2, total: 12 } : null, [payload?.layers]);

    return (
        <div className={`relative border-b border-slate-700/50 bg-slate-800 transition-all ${isMinimized ? 'h-10' : ''}`}>
            {/* Instance Header */}
            <div className="px-3 py-1.5 flex items-center justify-between bg-slate-900/50 border-b border-slate-700/30">
                <div className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                    <span className="text-[10px] font-bold tracking-wide uppercase text-slate-300 truncate max-w-[120px]">
                        {target.name || 'Unlinked Slot'}
                    </span>
                    {isMinimized && <span className="text-[8px] bg-indigo-900/50 text-indigo-300 px-1 rounded uppercase border border-indigo-500/30">Active</span>}
                </div>
                <div className="flex items-center space-x-1.5">
                    <button onClick={() => onToggleMinimize(instId)} className="p-1 rounded hover:bg-slate-700/50 text-slate-400 transition-colors">
                        {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    </button>
                    {!isMinimized && (
                        <button onClick={() => onDeleteInstance(instId)} className="p-1 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-400" title="Delete Instance">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Handle Positioning Logic */}
            <div className="relative">
                <Handle type="target" position={Position.Left} id={`source-in-${instId}`} className={`!w-3 !h-3 !-left-1.5 z-50 !bg-indigo-500`} style={{ top: isMinimized ? -20 : 20 }} />
                <Handle type="target" position={Position.Left} id={`target-in-${instId}`} className={`!w-3 !h-3 !-left-1.5 z-50 !bg-emerald-500`} style={{ top: isMinimized ? -20 : 40 }} />
                <Handle type="source" position={Position.Right} id={`result-out-${instId}`} className={`!w-3 !h-3 !-right-1.5 z-50 !bg-emerald-500`} style={{ top: isMinimized ? -20 : 30 }} />
            </div>

            {!isMinimized && (
                <div className="p-3 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-emerald-400 font-bold tracking-wide">{payload ? 'READY' : 'WAITING'}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{payload?.scaleFactor?.toFixed(2) || '1.00'}x Scale</span>
                    </div>
                    {audit && (
                        <div className="flex flex-wrap gap-1.5 select-none">
                            <div className="px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-900/20 flex items-center space-x-1"><Layers className="w-2.5 h-2.5 text-emerald-400" /><span className="text-[8px] text-emerald-300 font-mono">Pixels</span></div>
                            <div className="px-1.5 py-0.5 rounded border border-slate-600 bg-slate-700/40 flex items-center space-x-1"><Box className="w-2.5 h-2.5 text-slate-400" /><span className="text-[8px] text-slate-300 font-mono">Groups</span></div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

export const RemapperNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
    const instanceIds = useMemo(() => data.instanceIds || ['inst_0'], [data.instanceIds]);
    const instanceSettings = data.instanceSettings || {};
    const { setNodes } = useReactFlow();
    const updateNodeInternals = useUpdateNodeInternals();
    const edges = useEdges();
    const { resolvedRegistry, templateRegistry, payloadRegistry, registerPayload, unregisterNode, removeInstance } = useProceduralStore();

    useEffect(() => { updateNodeInternals(id); }, [id, instanceIds.length, data.isMinimized, updateNodeInternals]);

    const handleAddInstance = useCallback(() => {
        const newId = `inst_${Date.now()}`;
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceIds: [...instanceIds, newId], instanceSettings: { ...instanceSettings, [newId]: { isMinimized: false } } } } : n));
    }, [id, instanceIds, instanceSettings, setNodes]);

    const handleToggleMinimize = useCallback((instId: string) => {
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceSettings: { ...instanceSettings, [instId]: { ...instanceSettings[instId], isMinimized: !instanceSettings[instId]?.isMinimized } } } } : n));
    }, [id, instanceSettings, setNodes]);

    const handleDeleteInstance = useCallback((instId: string) => {
        removeInstance(id, instId);
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceIds: instanceIds.filter(rid => rid !== instId) } } : n));
    }, [id, instanceIds, removeInstance, setNodes]);

    const instanceData = useMemo(() => {
        return instanceIds.map(instId => {
            const sourceEdge = edges.find(e => e.target === id && e.targetHandle === `source-in-${instId}`);
            const targetEdge = edges.find(e => e.target === id && e.targetHandle === `target-in-${instId}`);
            
            const source = sourceEdge ? resolvedRegistry[sourceEdge.source]?.[sourceEdge.sourceHandle || ''] : {};
            const target = targetEdge ? templateRegistry[targetEdge.source]?.containers.find(c => {
                // [PHASE 5.1]: Update lookup logic to support slot-out- prefix
                const slotId = targetEdge.sourceHandle?.replace('slot-out-', '') || targetEdge.sourceHandle?.replace('slot-bounds-', '') || '';
                return c.id === slotId || c.name === slotId;
            }) : {};
            
            return { instId, source, target: target || { name: 'Unlinked' }, payload: payloadRegistry[id]?.[`result-out-${instId}`] };
        });
    }, [instanceIds, edges, id, resolvedRegistry, templateRegistry, payloadRegistry]);

    return (
        <BaseNodeShell id={id} title="Procedural Remapper" icon={<Sparkles className="w-4 h-4 text-indigo-400" />} isMinimized={data.isMinimized} onMinimize={() => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n))} onDelete={() => setNodes(nds => nds.filter(n => n.id !== id))} className="w-[450px]">
            <div className="flex flex-col">
                {instanceData.map(inst => (
                    <RemapperInstanceRow key={inst.instId} instId={inst.instId} nodeId={id} settings={instanceSettings[inst.instId]} source={inst.source} target={inst.target} payload={inst.payload} onToggleMinimize={handleToggleMinimize} onDeleteInstance={handleDeleteInstance} />
                ))}
            </div>
            <button onClick={handleAddInstance} className="w-full py-2 bg-slate-900 hover:bg-slate-700 border-t border-slate-700 text-slate-400 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center space-x-1">
                <Plus className="w-3 h-3" /><span>Add Instance</span>
            </button>
        </BaseNodeShell>
    );
});
