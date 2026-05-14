import type { DataType } from './data-type.types';
import type { GraphType } from './graph.types';
import type { ModelType } from './model.types';
import type { NodeType, NodeTypeType } from './node.types';
import type { ProtocolTypeType } from './protocol.types';

export type StopRequestType = {
  model: ModelType,
  graph: GraphType,
}

export type CompileRequestType = {
  model: ModelType;
  graph: GraphType;
  nodes: NodeType[];
  dataTypes: DataType[];
  nodeTypes: NodeTypeType[];
  protocolTypes: ProtocolTypeType[];
  gitlab?: {
    project?: { path?: string };
    id?: number;
  };
  customEnv?: Record<string, unknown>;
};

export type CompileResultType = {
  success: boolean;
  projectId: string;
  projectPath: string;
  gitlab?: {
    projectId?: number;
    pipelineId?: number;
  };
  error?: string;
};

export type ContainerLogsType = {
  pipelineId: number;
  jobs: Array<{
    id: number;
    name: string;
    status: string;
    logs: string;
  }>;
};
