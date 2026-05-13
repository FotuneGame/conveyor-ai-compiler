import { registerAs } from '@nestjs/config';

export interface CoreConfig {
  compiler: {
    name: string,
    tempDir: string,
    envPath: string,
    keepTempFiles: boolean,
  },
  gitlab: {
    url: string,
    registry: string,
    token: string,
    backend: string
  }
}

export default registerAs(
  'core',
  (): CoreConfig => ({
    compiler: {
      name: process.env.COMPILER_NAME || 'compiler-typescript',
      tempDir: process.env.COMPILER_TEMP_DIR || './tmp/compiler-projects',
      envPath: process.env.ENV_PATH || './public/example.env',
      keepTempFiles: process.env.KEEP_TEMP_FILES === 'true',
    },
    gitlab: {
      url: process.env.GITLAB_URL || 'http://localhost:8080',
      registry: process.env.GITLAB_REGISTRY_URL || 'http://localhost:8081',
      token: process.env.GITLAB_TOKEN || '',
      backend: process.env.GITLAB_CI_BACKEND_URL || 'http://host.docker.internal:5000'
    }
  }),
);
