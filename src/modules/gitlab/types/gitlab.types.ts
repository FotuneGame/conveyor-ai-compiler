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

export type CreateGitLabProjectType = {
  name: string;
  description?: string;
  visibility?: 'private' | 'internal' | 'public';
  namespaceId?: number;
};

export type GitLabConfigType = {
  baseUrl: string;
  token: string;
  projectId: number;
  namespaceId: number;
};
