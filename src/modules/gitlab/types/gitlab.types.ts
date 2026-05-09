export type GitLabProjectType = {
  id: number;
  name: string;
  path: string;
  webUrl: string;
  httpUrlToRepo: string;
};

export type GitLabPipelineType = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  webUrl: string;
  createdAt: Date;
};

export type GitLabJobType = {
  id: number;
  status: string;
  stage: string;
  name: string;
  pipeline: {
    id: number;
    status: string;
  };
  createdAt: Date;
  finishedAt?: Date;
};

export type CreateGitLabProjectType = {
  name: string;
  description?: string;
  visibility?: 'private' | 'internal' | 'public';
};

