
import { useNodes, useEdges } from 'reactflow';
import type { Node } from 'reactflow';
import { PSDNodeData, ContainerContext } from '../types';
import { createContainerContext } from '../services/psdService';

export const useContainerContext = (nodeId: string): ContainerContext | null => {
  const nodes = useNodes();
  const edges = useEdges();
  const edge = edges.find(e => e.target === nodeId);
  
  if (!edge || !edge.sourceHandle) return null;
  const sourceNode = nodes.find(n => n.id === edge.source) as Node<PSDNodeData>;
  if (!sourceNode || !sourceNode.data.template) return null;

  // Convention: source-out-slot-{name}
  const cleanHandle = edge.sourceHandle.replace('source-out-slot-', '');
  return createContainerContext(sourceNode.data.template, cleanHandle);
};
