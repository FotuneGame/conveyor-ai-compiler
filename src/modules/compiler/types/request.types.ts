import type { DataType } from './data-type.types';
import type { GraphType } from './graph.types';
import type { ModelType } from './model.types';
import type { NodeTypeType } from './node.types';
import type { ProtocolTypeType } from './protocol.types';

export type CompileRequestType = {
  model: ModelType,
  graph: GraphType,
  nodes: Node[],
  dataTypes: DataType[]
  nodeTypes: NodeTypeType[],
  protocolTypes: ProtocolTypeType[],
}

export type StopRequestType = {
  model: ModelType,
  graph: GraphType,
}