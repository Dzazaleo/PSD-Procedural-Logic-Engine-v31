
import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  BackgroundVariant,
  ReactFlowProvider,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';

import { LoadPSDNode } from './components/LoadPSDNode';
import { TargetTemplateNode } from './components/TargetTemplateNode';
import { TargetSplitterNode } from './components/TargetSplitterNode';
import { DesignInfoNode } from './components/DesignInfoNode';
import { TemplateSplitterNode } from './components/TemplateSplitterNode';
import { ContainerResolverNode } from './components/ContainerResolverNode';
import { RemapperNode } from './components/RemapperNode';
import { DesignAnalystNode } from './components/DesignAnalystNode'; 
import { ExportPSDNode } from './components/ExportPSDNode';
import { KnowledgeNode } from './components/KnowledgeNode'; 
import { KnowledgeInspectorNode } from './components/KnowledgeInspectorNode';
import { DesignReviewerNode } from './components/DesignReviewerNode';
import { ContainerPreviewNode } from './components/ContainerPreviewNode'; 
import { ProjectControls } from './components/ProjectControls';
import { PSDNodeData } from './types';
import { ProceduralStoreProvider } from './store/ProceduralContext';

const INITIAL_NODES: Node<PSDNodeData>[] = [
  { id: 'node-knowledge-1', type: 'knowledge', position: { x: 92, y: -350 }, data: { fileName: null, template: null, validation: null, designLayers: null } },
  { id: 'node-inspector-1', type: 'knowledgeInspector', position: { x: 450, y: -350 }, data: { fileName: null, template: null, validation: null, designLayers: null } },
  { id: 'node-1', type: 'loadPsd', position: { x: 50, y: 50 }, data: { fileName: null, template: null, validation: null, designLayers: null } },
  { id: 'node-target-1', type: 'targetTemplate', position: { x: 50, y: 450 }, data: { fileName: null, template: null, validation: null, designLayers: null } },
  { id: 'node-info-1', type: 'designInfo', position: { x: 450, y: 50 }, data: { fileName: null, template: null, validation: null, designLayers: null } },
  { id: 'node-template-splitter-1', type: 'templateSplitter', position: { x: 450, y: 450 }, data: { fileName: null, template: null, validation: null, designLayers: null } },
  { id: 'node-resolver-1', type: 'containerResolver', position: { x: 870, y: 50 }, data: { fileName: null, template: null, validation: null, designLayers: null, channelCount: 10 } },
  { id: 'node-target-splitter-1', type: 'targetSplitter', position: { x: 870, y: 450 }, data: { fileName: null, template: null, validation: null, designLayers: null } },
  { id: 'node-analyst-1', type: 'designAnalyst', position: { x: 1562, y: 248 }, data: { fileName: null, template: null, validation: null, designLayers: null }, style: { width: 650 } },
  { id: 'node-remapper-1', type: 'remapper', position: { x: 2300, y: 248 }, data: { fileName: null, template: null, validation: null, designLayers: null, remapperConfig: { targetContainerName: null }, instanceCount: 1 }, style: { width: 500 } },
  { id: 'node-reviewer-1', type: 'designReviewer', position: { x: 2900, y: 248 }, data: { fileName: null, template: null, validation: null, designLayers: null, instanceCount: 1 }, style: { width: 480 } },
  { id: 'node-preview-1', type: 'containerPreview', position: { x: 3500, y: 248 }, data: { fileName: null, template: null, validation: null, designLayers: null }, style: { width: 650, height: 500 } },
  { id: 'node-export-1', type: 'exportPsd', position: { x: 4250, y: 248 }, data: { fileName: null, template: null, validation: null, designLayers: null } }
];

const INITIAL_EDGES: Edge[] = [
    { id: 'e-load-info', source: 'node-1', target: 'node-info-1', sourceHandle: 'psd-output', targetHandle: 'target-in-psd' },
    { id: 'e-load-template-splitter', source: 'node-1', target: 'node-template-splitter-1', sourceHandle: 'psd-output', targetHandle: 'target-in-psd' },
    { id: 'e-target-target-splitter', source: 'node-target-1', target: 'node-target-splitter-1', sourceHandle: 'source-out-metadata', targetHandle: 'target-in-metadata' },
    { id: 'e-knowledge-inspector', source: 'node-knowledge-1', target: 'node-inspector-1', sourceHandle: 'source-out-knowledge', targetHandle: 'target-in-knowledge' }
];

const getInitialNodes = (): Node<PSDNodeData>[] => {
  try {
    const saved = localStorage.getItem('psd_graph_layout');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((node: Node<PSDNodeData>) => ({
          ...node,
          data: { ...node.data, fileName: null, template: null, validation: null, designLayers: null }
        }));
      }
    }
  } catch (err) {}
  return INITIAL_NODES;
};

const App: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const edgeReconnectSuccessful = useRef(true);

  const onConnect = useCallback((params: Connection) => {
    const sourceNode = nodes.find((n) => n.id === params.source);
    const targetNode = nodes.find((n) => n.id === params.target);
    const targetHandle = params.targetHandle || '';
    if (sourceNode && targetNode) {
      if (targetNode.type === 'targetSplitter' && targetHandle === 'target-in-metadata' && sourceNode.type !== 'targetTemplate') return;
      if (targetNode.type === 'knowledgeInspector' && targetHandle === 'target-in-knowledge' && sourceNode.type !== 'knowledge') return;
      if (targetNode.type === 'designAnalyst' && targetHandle === 'target-in-knowledge' && sourceNode.type !== 'knowledge') return;
    }
    setEdges((eds) => addEdge(params, eds));
  }, [nodes, setEdges]);

  const onReconnectStart = useCallback(() => { edgeReconnectSuccessful.current = false; }, []);
  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => { edgeReconnectSuccessful.current = true; setEdges((els) => reconnectEdge(oldEdge, newConnection, els)); }, [setEdges]);
  const onReconnectEnd = useCallback((_: any, edge: Edge) => { if (!edgeReconnectSuccessful.current) setEdges((eds) => eds.filter((e) => e.id !== edge.id)); edgeReconnectSuccessful.current = true; }, [setEdges]);

  const nodeTypes = useMemo(() => ({
    loadPsd: LoadPSDNode, targetTemplate: TargetTemplateNode, targetSplitter: TargetSplitterNode, designInfo: DesignInfoNode, templateSplitter: TemplateSplitterNode, containerResolver: ContainerResolverNode, remapper: RemapperNode, designAnalyst: DesignAnalystNode, designReviewer: DesignReviewerNode, containerPreview: ContainerPreviewNode, exportPsd: ExportPSDNode, knowledge: KnowledgeNode, knowledgeInspector: KnowledgeInspectorNode, 
  }), []);

  return (
    <ProceduralStoreProvider>
      <div className="w-screen h-screen bg-slate-900">
        <ReactFlowProvider>
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onReconnect={onReconnect} onReconnectStart={onReconnectStart} onReconnectEnd={onReconnectEnd} nodeTypes={nodeTypes} fitView className="bg-slate-900">
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#334155" />
            <Controls className="bg-slate-800 border-slate-700 fill-slate-200" />
            <MiniMap className="bg-slate-800 border-slate-700" nodeColor="#475569" maskColor="rgba(15, 23, 42, 0.6)" />
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight">PSD Procedural Logic Engine</h1>
              <p className="text-slate-400 text-sm">Automated Design Synthesis DAG</p>
            </div>
          </ReactFlow>
          <ProjectControls />
        </ReactFlowProvider>
      </div>
    </ProceduralStoreProvider>
  );
};

export default App;
