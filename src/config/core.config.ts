import { registerAs } from '@nestjs/config';

export interface CoreConfig {
  compiler: {
    tempDir: string,
  },
  gitlab: {
    baseUrl: string,
    token: string,
    projectId: number,
    namespaceId: number,
  },
  docker: {
    registry: string,
  },
}

export default registerAs(
  'core',
  (): CoreConfig => ({
    compiler: {
      tempDir: process.env.COMPILER_TEMP_DIR || '/tmp/compiler-projects',
    },
    gitlab: {
      baseUrl: process.env.GITLAB_BASE_URL || 'https://gitlab.com',
      token: process.env.GITLAB_TOKEN || '',
      projectId: parseInt(process.env.GITLAB_PROJECT_ID || '0', 10),
      namespaceId: parseInt(process.env.GITLAB_NAMESPACE_ID || '0', 10),
    },
    docker: {
      registry: process.env.DOCKER_REGISTRY || 'registry.gitlab.com',
    },
  }),
);
