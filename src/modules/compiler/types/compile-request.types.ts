import type { ModelType } from './model.types';
import type { NodeType } from './node.types';

export type CompileRequestType = {
  modelId: number;
}

export type StopRequestType = {
  modelId: number;
}

export type CompilerPayloadType = {
  model: ModelType;
  nodes: NodeType[];
  env: string;
}
