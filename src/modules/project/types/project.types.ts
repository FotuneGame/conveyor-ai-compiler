export type GitLabProjectRefType = {
  id: number;
  path: string;
};

export type GitLabPipelineRefType = {
  id: number;
};

export type ProjectType = {
  id: string;
  path: string;
  graphId: number;
  modelId: number;
  createdAt: Date;
  gitlab?: {
    project?: GitLabProjectRefType;
    pipeline?: GitLabPipelineRefType;
  };
};