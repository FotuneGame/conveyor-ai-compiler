import type { GraphType } from "../../../modules/compiler/types/graph.types";
import type { ModelType } from "../../../modules/compiler/types/model.types";
import type { NodeType } from "../../../modules/compiler/types/node.types";
import type { DataType } from "../../../modules/compiler/types/data-type.types";
import type { NodeTypeType } from "../../../modules/compiler/types/node.types";
import type { ProtocolTypeType } from "../../../modules/compiler/types/protocol.types";

export type TemplateProjectConfigType = {
  graphId: string;
  modelId: string;
  outputDir: string;
};

export type GeneratedFileType = {
  path: string;
  content: string;
};

export type TemplateContextType = {
  model: ModelType;
  graph: GraphType;
  nodes: NodeType[];
  dataTypes: DataType[];
  nodeTypes: NodeTypeType[];
  protocolTypes: ProtocolTypeType[];
};

export type ProjectTemplateType = {
  env: Record<string, string>;
  gitignore: string;
  dockerignore: string;
  dockerfile: string;
  gitlabCi: string;
  packageJson: Record<string, unknown>;
  sourceFiles: GeneratedFileType[];
};
