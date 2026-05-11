import { registerAs } from '@nestjs/config';

export interface CoreConfig {
  backendUrl: string,
  compiler: {
    name: string,
    tempDir: string,
    envPath: string,
    keepTempFiles: boolean,
  },
  gitlab: {
    baseUrl: string,
    token: string,
    internalUrl?: string,
  }
}

export default registerAs(
  'core',
  (): CoreConfig => ({
    backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',
    compiler: {
      name: process.env.COMPILER_NAME || 'compiler-typescript',
      tempDir: process.env.COMPILER_TEMP_DIR || './tmp/compiler-projects',
      envPath: process.env.ENV_PATH || './public/example.env',
      keepTempFiles: process.env.KEEP_TEMP_FILES === 'true',
    },
    gitlab: {
      baseUrl: process.env.GITLAB_BASE_URL || 'https://gitlab.com',
      token: process.env.GITLAB_TOKEN || '',
      internalUrl: process.env.GITLAB_INTERNAL_URL,
    }
  }),
);
