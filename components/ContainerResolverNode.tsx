
import React, { memo, useMemo, useEffect, useCallback } from 'react';
import { Handle, Position, useNodes, useEdges, useReactFlow, useUpdateNodeInternals } from 'reactflow';
import type { NodeProps, Node } from 'reactflow';
import { PSDNodeData } from '../types';
import { createContainerContext } from '../services/psdService';
import { usePsdResolver, ResolverStatus } from '../hooks/usePsdResolver';
import { useProceduralStore } from '../store/ProceduralContext';
import { BaseNodeShell } from './shared/BaseNodeShell';
import { Zap, Share2 } from 'lucide-react';

interface ChannelState {
  index: number;
  status: 'idle' | 'resolved' | 'warning' | 'error';
  containerName?: string;
  layerCount: number;
  message?: string;
  debugCode?: ResolverStatus;
  resolvedContext?: any;
}

export const ContainerResolverNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const channelCount = data.channelCount || 10;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { registerResolved, unregisterNode } = useProceduralStore();
  const { resolveLayer } = usePsdResolver();

  const loadPsdNode = nodes.find(n => n.type === 'loadPsd') as Node<PSDNodeData>;
  const designLayers = loadPsdNode?.data?.designLayers || null;
  const globalTemplate = loadPsdNode?.data?.template || null;

  useEffect(() => { return () => unregisterNode(id); }, [id, unregisterNode]);
  useEffect(() => { updateNodeInternals(id); }, [id, data.isMinimized, channelCount, updateNodeInternals]);

  const channels: ChannelState[] = useMemo(() => {
    return Array.from({ length: channelCount }).map((_, index) => {
      const targetHandleId = `target-in-slot-${index}`;
      const edge = edges.find(e => e.target === id && e.targetHandle === targetHandleId);
      if (!edge) return { index, status: 'idle', layerCount: 0 };
      if (!globalTemplate) return { index, status: 'error', layerCount: 0, message: 'Data Locked', debugCode: 'DATA_LOCKED' };

      // Strip convention source-out-slot-{name}
      const containerName = edge.sourceHandle?.replace('source-out-slot-', '') || '';
      const containerContext = createContainerContext(globalTemplate, containerName);
      if (!containerContext) return { index, status: 'error', layerCount: 0, message: 'Invalid Ref', debugCode: 'UNKNOWN_ERROR' };

      const result = resolveLayer(containerContext.containerName, designLayers);
      let uiStatus: ChannelState['status'] = 'idle';
      switch (result.status) {
        case 'RESOLVED': uiStatus = 'resolved'; break;
        case 'CASE_MISMATCH':
        case 'EMPTY_GROUP': uiStatus = 'warning'; break;
        default: uiStatus = 'error'; break;
      }

      return {
        index, status: uiStatus, containerName: containerContext.containerName, layerCount: result.totalCount || 0, message: result.message, debugCode: result.status,
        resolvedContext: result.layer && containerContext ? { container: containerContext, layers: result.layer.children || [], status: 'resolved', message: result.message } : null
      };
    });
  }, [channelCount, edges, designLayers, globalTemplate, id, resolveLayer]);

  useEffect(() => {
    channels.forEach(channel => {
        if (channel.resolvedContext) {
            registerResolved(id, `source-out-channel-${channel.index}`, channel.resolvedContext as any);
        }
    });
  }, [channels, id, registerResolved]);

  const handleMinimize = useCallback(() => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  }, [id, setNodes]);

  return (
    <BaseNodeShell id={id} title="Container Resolver" icon={<Zap className="w-4 h-4 text-emerald-400" />} isMinimized={data.isMinimized} onMinimize={handleMinimize} onDelete={() => setNodes(nds => nds.filter(n => n.id !== id))} className="min-w-[340px]">
      <div className="flex flex-col">
        {channels.map((channel) => (
          <div key={channel.index} className={`relative flex items-center h-10 border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${channel.status === 'resolved' ? 'bg-emerald-900/10' : channel.status === 'warning' ? 'bg-orange-900/10' : ''}`}>
            <Handle type="target" position={Position.Left} id={`target-in-slot-${channel.index}`} className={`!w-3 !h-3 !-left-1.5 transition-colors duration-200 z-50 ${channel.status === 'resolved' ? '!bg-emerald-500 !border-white' : '!bg-slate-600 !border-slate-400'}`} />
            <div className="flex-1 flex items-center justify-between px-8 w-full">
                <div className="flex flex-col leading-tight min-w-0">
                    <span className={`text-[10px] font-bold truncate ${channel.status === 'idle' ? 'text-slate-600' : 'text-slate-200'}`}>{channel.containerName || `Slot ${channel.index}`}</span>
                    {channel.status !== 'idle' && <span className="text-[8px] text-slate-500 truncate">{channel.message}</span>}
                </div>
            </div>
            <Handle type="source" position={Position.Right} id={`source-out-channel-${channel.index}`} className={`!w-3 !h-3 !-right-1.5 transition-colors duration-200 z-50 ${channel.status === 'resolved' ? '!bg-blue-500 !border-white' : '!bg-slate-700 !border-slate-500'}`} />
          </div>
        ))}
      </div>
      <button onClick={() => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, channelCount: (n.data.channelCount || 10) + 1 } } : n))} className="w-full py-1.5 bg-slate-900 hover:bg-slate-700 border-t border-slate-700 text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center space-x-1 rounded-b-lg"><span className="text-[10px] font-medium uppercase tracking-wider">+ Add Channel</span></button>
    </BaseNodeShell>
  );
});
