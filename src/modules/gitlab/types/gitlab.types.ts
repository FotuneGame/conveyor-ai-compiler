export type GitLabProjectType = {
  id: number;
  name: string;
  path: string;
  webUrl: string;
  httpUrlToRepo: string;
};

export type GitLabCommitType = {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  created_at: Date;
};

export type GitLabPipelineType = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  webUrl: string;
  createdAt: Date;
};

export type CreateGitLabProjectDto = {
  name: string;
  description?: string;
  visibility?: 'private' | 'internal' | 'public';
  namespaceId?: number;
};

export type PushToGitLabDto = {
  projectPath: string;
  branch: string;
  message: string;
};

export type GitLabConfigType = {
  baseUrl: string;
  token: string;
  projectId: number;
  namespaceId: number;
};
