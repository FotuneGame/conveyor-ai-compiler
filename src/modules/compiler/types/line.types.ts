import type { NodeType } from './node.types';

export type LineType = {
  id: number;
  parent: NodeType;
  child: NodeType;
}
