export type DockerImageType = {
  id: string;
  repoTags: string[];
  created: number;
  size: number;
};

export type DockerContainerType = {
  id: string;
  names: string[];
  image: string;
  command: string;
  created: number;
  state: string;
  status: string;
  ports: Array<{
    IP: string;
    PrivatePort: number;
    PublicPort: number;
    Type: string;
  }>;
};

export type DockerNetworkType = {
  id: string;
  name: string;
  driver: string;
  scope: string;
};

export type BuildImageDto = {
  path: string;
  tag: string;
  dockerfileName?: string;
  buildArgs?: Record<string, string>;
};

export type RunContainerDto = {
  image: string;
  name: string;
  env?: Record<string, string>;
  ports?: Record<number, number>;
  volumes?: Record<string, string>;
  network?: string;
  restartPolicy?: string;
};

export type StopContainerDto = {
  containerId: string;
  timeout?: number;
};

export type RemoveContainerDto = {
  containerId: string;
  force?: boolean;
};

export type RemoveImageDto = {
  imageId: string;
  force?: boolean;
};
