export type GeneratedNodeType = {
  id: number;
  name: string;
  fileName: string;
  content: string;
};

export type GeneratedEngineType = {
  fileName: string;
  content: string;
};

export type CodegenResultType = {
  nodes: Array<GeneratedNodeType>;
  engine: GeneratedEngineType;
  types: string;
  app: string;
};
