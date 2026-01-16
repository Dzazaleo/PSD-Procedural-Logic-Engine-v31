
import React, { memo, useMemo, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, useEdges, useReactFlow } from 'reactflow';
import { PSDNodeData } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { useKnowledgeScoper } from '../hooks/useKnowledgeScoper';
import { Filter, ScanSearch, Terminal, Copy, Check } from 'lucide-react';
import { BaseNodeShell } from './shared/BaseNodeShell';

const GLOBAL_KEY = 'GLOBAL CONTEXT';

export const KnowledgeInspectorNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const edges = useEdges();
  const { knowledgeRegistry, unregisterNode } = useProceduralStore();
  const { setNodes, setEdges } = useReactFlow();
  const [copied, setCopied] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string>(data.inspectorState?.selectedContainer || GLOBAL_KEY);

  const sourceNodeId = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'target-in-knowledge');
    return edge ? edge.source : null;
  }, [edges, id]);

  const knowledge = sourceNodeId ? knowledgeRegistry[sourceNodeId] : null;
  const { scopes, availableScopes } = useKnowledgeScoper(knowledge?.rules);
  const currentRules = scopes[selectedContainer] || [];

  const handleMinimize = () => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  const handleDelete = () => {
    unregisterNode(id);
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
  };

  return (
    <BaseNodeShell
      id={id}
      title="Knowledge Inspector"
      icon={<Terminal className="w-4 h-4 text-teal-400" />}
      isMinimized={data.isMinimized}
      onMinimize={handleMinimize}
      onDelete={handleDelete}
      className="w-80"
    >
      <Handle type="target" position={Position.Left} id="target-in-knowledge" className="!w-3 !h-3 !bg-teal-500 !border-2 !border-slate-900" />
      <div className="space-y-3">
        <select 
          value={selectedContainer} onChange={(e) => setSelectedContainer(e.target.value)}
          className="w-full bg-black/40 border border-slate-700 text-teal-100 text-xs rounded p-2 focus:outline-none focus:border-teal-500 font-mono"
        >
          {availableScopes.map(key => <option key={key} value={key}>{key}</option>)}
        </select>

        <div className="bg-black/60 rounded-md border border-slate-800 flex flex-col min-h-[150px] max-h-[250px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1 bg-slate-900/50 border-b border-slate-800">
            <span className="text-[9px] font-bold text-slate-500 uppercase">{selectedContainer}</span>
            <button onClick={() => { navigator.clipboard.writeText(currentRules.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-slate-500 hover:text-teal-400">
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <div className="p-2 overflow-y-auto custom-scrollbar flex-1 font-mono text-[9px] leading-relaxed text-slate-300">
            {currentRules.length > 0 ? currentRules.map((r, i) => <div key={i} className="mb-1">{`> ${r}`}</div>) : <div className="text-slate-600 italic">No directives found.</div>}
          </div>
        </div>
      </div>
    </BaseNodeShell>
  );
});
