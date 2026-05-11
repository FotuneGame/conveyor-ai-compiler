import type { ModelType } from "../../../modules/compiler/types/model.types";
import type { GraphType } from "../../../modules/compiler/types/graph.types";
import type { NodeType } from "../../../modules/compiler/types/node.types";
import type { DataType } from "../../../modules/compiler/types/data-type.types";
import type { NodeTypeType } from "../../../modules/compiler/types/node.types";
import type { ProtocolTypeType } from "../../../modules/compiler/types/protocol.types";

export type TempProjectType = {
  id: string;
  path: string;
  graphId: number;
  modelId: number;
  containerName: string;
  imageName: string;
  createdAt: Date;
  gitLabPipelineId?: number;
  gitLabProjectId?: number;
};

export type CreateTempProjectType = {
  model: ModelType;
  graph: GraphType;
  nodes: NodeType[];
  dataTypes: DataType[];
  nodeTypes: NodeTypeType[];
  protocolTypes: ProtocolTypeType[];
  customEnv?: Record<string, string>;
};

export type CompileResultType = {
  success: boolean;
  projectId: string;
  projectPath: string;
  containerName: string;
  imageName: string;
  gitLabProjectId?: number;
  gitLabPipelineId?: number;
  error?: string;
};

export type ProjectConfigType = {
  tempDir: string;
  gitLabProjectId: number;
  dockerRegistry: string;
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

export type StoreType = {
  [projectId: string]: TempProjectType;
}