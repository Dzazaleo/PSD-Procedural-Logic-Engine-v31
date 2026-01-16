
import React, { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Handle, Position, useReactFlow, useEdges, useNodes, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import type { NodeProps, Node } from 'reactflow';
import { SerializableLayer, PSDNodeData } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { findLayerByPath, getOpticalBounds } from '../services/psdService';
import { Scan, Box, Layers, MousePointer2, Info } from 'lucide-react';
import { BaseNodeShell } from './shared/BaseNodeShell';

interface LayerPreviewProps {
    layer: SerializableLayer;
    sourceNodeId: string;
}

const LayerPreview: React.FC<LayerPreviewProps> = ({ layer, sourceNodeId }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { psdRegistry } = useProceduralStore();
    const [metrics, setMetrics] = useState<{
        geo: { w: number, h: number },
        optical: { x: number, y: number, w: number, h: number } | null,
        canvasDims: { w: number, h: number }
    } | null>(null);

    useEffect(() => {
        const psd = psdRegistry[sourceNodeId];
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!psd || !canvas || !container) return;

        const agLayer = findLayerByPath(psd, layer.id);
        if (!agLayer || !agLayer.canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            setMetrics(null);
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const containerRect = container.getBoundingClientRect();
        canvas.width = containerRect.width * dpr;
        canvas.height = containerRect.height * dpr;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const padding = 20;
        const availableW = containerRect.width - (padding * 2);
        const availableH = containerRect.height - (padding * 2);
        
        const imgW = agLayer.canvas.width;
        const imgH = agLayer.canvas.height;
        const scale = Math.min(availableW / imgW, availableH / imgH);
        
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const offsetX = (containerRect.width - drawW) / 2;
        const offsetY = (containerRect.height - drawH) / 2;

        ctx.clearRect(0, 0, containerRect.width, containerRect.height);
        ctx.drawImage(agLayer.canvas, offsetX, offsetY, drawW, drawH);

        const geoW = layer.coords.w;
        const geoH = layer.coords.h;
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(offsetX, offsetY, geoW * scale, geoH * scale);
        
        const opticalScan = getOpticalBounds(agLayer.canvas.getContext('2d')!, imgW, imgH);
        if (opticalScan) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            const optX = offsetX + (opticalScan.bounds.x * scale);
            const optY = offsetY + (opticalScan.bounds.y * scale);
            const optW = opticalScan.bounds.w * scale;
            const optH = opticalScan.bounds.h * scale;
            ctx.strokeRect(optX, optY, optW, optH);
            setMetrics({ geo: { w: geoW, h: geoH }, optical: opticalScan.bounds, canvasDims: { w: imgW, h: imgH } });
        } else {
            setMetrics({ geo: { w: geoW, h: geoH }, optical: null, canvasDims: { w: imgW, h: imgH } });
        }
    }, [layer, sourceNodeId, psdRegistry]);

    if (!metrics) return (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-[10px] italic bg-slate-900/50 m-2 rounded border border-slate-700/50 border-dashed">
             <div ref={containerRef} className="absolute inset-0 pointer-events-none" />
             <canvas ref={canvasRef} className="absolute inset-0" />
             <span className="z-10 bg-slate-900/80 px-2 py-1 rounded">Select a visual layer</span>
        </div>
    );

    return (
        <div className="relative flex-1 bg-slate-900/50 m-2 rounded border border-slate-700 overflow-hidden flex flex-col">
            <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1 pointer-events-none">
                <span className="text-[9px] font-mono text-blue-300 bg-black/60 px-1.5 py-0.5 rounded border border-blue-500/30">GEO: {Math.round(metrics.geo.w)}x{Math.round(metrics.geo.h)}</span>
                {metrics.optical && <span className="text-[9px] font-mono text-red-300 bg-black/60 px-1.5 py-0.5 rounded border border-red-500/30">OPT: {Math.round(metrics.optical.w)}x{Math.round(metrics.optical.h)}</span>}
            </div>
            <div ref={containerRef} className="flex-1 relative w-full h-full min-h-[150px]"><canvas ref={canvasRef} className="absolute inset-0 w-full h-full" /></div>
            <div className="h-6 bg-slate-900 border-t border-slate-700 flex items-center px-2 gap-3 shrink-0">
                <div className="flex items-center gap-1"><div className="w-2 h-2 border border-blue-400 border-dashed"></div><span className="text-[9px] text-slate-400">Geo</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 border border-red-500 bg-red-500/10"></div><span className="text-[9px] text-slate-400">Optical</span></div>
            </div>
        </div>
    );
};

const LayerItem: React.FC<{ node: SerializableLayer; depth?: number; isSelected: boolean; onSelect: (l: SerializableLayer) => void }> = ({ node, depth = 0, isSelected, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isGroup = node.type === 'group';
  const hasChildren = isGroup && node.children && node.children.length > 0;
  const toggleOpen = (e: React.MouseEvent) => { e.stopPropagation(); if (hasChildren) setIsOpen(!isOpen); onSelect(node); };
  const handleSelect = (e: React.MouseEvent) => { e.stopPropagation(); onSelect(node); }

  return (
    <div className="select-none">
      <div className={`flex items-center py-1 pr-2 rounded cursor-pointer transition-colors border-l-2 ${isSelected ? 'bg-indigo-600/20 border-indigo-400' : 'hover:bg-slate-700/50 border-transparent'} ${!node.isVisible ? 'opacity-50' : ''}`} style={{ paddingLeft: `${depth * 12 + 6}px` }} onClick={hasChildren ? toggleOpen : handleSelect}>
        <div className="mr-1 w-3.5 flex justify-center shrink-0">
          {hasChildren && <svg className={`w-2.5 h-2.5 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>}
        </div>
        <div className="mr-1.5 text-slate-500 shrink-0">
           {isGroup ? <Box className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
        </div>
        <span className={`text-[11px] truncate ${isSelected ? 'text-white font-medium' : 'text-slate-300'}`}>{node.name}</span>
      </div>
      {isOpen && hasChildren && (
        <div className="border-l border-slate-700/50 ml-3">
          {[...node.children!].reverse().map((child) => <LayerItem key={child.id} node={child} depth={depth + 1} isSelected={isSelected && false} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
};

export const DesignInfoNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const edges = useEdges();
  const nodes = useNodes();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [selectedLayer, setSelectedLayer] = useState<SerializableLayer | null>(null);
  
  const sourceNode = useMemo(() => {
    const edge = edges.find(e => e.target === id);
    return edge ? nodes.find(n => n.id === edge.source) as Node<PSDNodeData> : null;
  }, [edges, nodes, id]);

  const designLayers = sourceNode?.data?.designLayers;
  useEffect(() => { updateNodeInternals(id); }, [id, data.isMinimized, updateNodeInternals]);

  const handleMinimize = useCallback(() => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  }, [id, setNodes]);

  return (
    <BaseNodeShell id={id} title="Design Inspector" icon={<Info className="w-4 h-4 text-orange-400" />} isMinimized={data.isMinimized} onMinimize={handleMinimize} onDelete={() => setNodes(nds => nds.filter(n => n.id !== id))} className="w-[500px] h-[450px]">
      <NodeResizer minWidth={500} minHeight={450} isVisible={!data.isMinimized} onResize={() => updateNodeInternals(id)} handleStyle={{ background: 'transparent', border: 'none' }} lineStyle={{ border: 'none' }} />
      <Handle type="target" position={Position.Left} id="target-in-psd" className="!w-3 !h-3 !bg-blue-500 !border-2 !border-slate-800" />
      <div className="flex flex-1 overflow-hidden h-full min-h-[350px]">
          <div className="w-1/2 overflow-y-auto custom-scrollbar border-r border-slate-700 bg-slate-900/20 p-1">
            {!designLayers ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-2"><Scan className="w-6 h-6 opacity-30" /><span>No Data</span></div>
            ) : (
              <div className="py-1">{[...designLayers].reverse().map(layer => <LayerItem key={layer.id} node={layer} isSelected={selectedLayer?.id === layer.id} onSelect={setSelectedLayer} />)}</div>
            )}
          </div>
          <div className="w-1/2 flex flex-col bg-black/10">
              {selectedLayer && sourceNode ? <LayerPreview layer={selectedLayer} sourceNodeId={sourceNode.id} /> : <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-2"><MousePointer2 className="w-6 h-6 opacity-20" /><span className="text-[10px] uppercase tracking-widest font-bold">Select Layer</span></div>}
          </div>
      </div>
    </BaseNodeShell>
  );
});
