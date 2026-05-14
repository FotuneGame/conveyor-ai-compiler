import type { NodeWithLinesType } from '../../parser/types';

export type GraphNodeType = {
  id: number;
  node: NodeWithLinesType;
  children: Array<number>;
  parents: Array<number>;
  depth: number;
};

export type GraphType = {
  nodes: Map<number, GraphNodeType>;
  startNodeId: number;
  order: Array<number>;
};

export type TraversalResultType = {
  success: boolean;
  error?: string;
  order: Array<number>;
};
