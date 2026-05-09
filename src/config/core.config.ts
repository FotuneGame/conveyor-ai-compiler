import { registerAs } from '@nestjs/config';

export interface CoreConfig {
  backendUrl: string,
  compiler: {
    tempDir: string,
    envPath: string,
  },
  gitlab: {
    baseUrl: string,
    token: string,
  }
}

export default registerAs(
  'core',
  (): CoreConfig => ({
    backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',
    compiler: {
      tempDir: process.env.COMPILER_TEMP_DIR || './tmp/compiler-projects',
      envPath: process.env.ENV_PATH || './public/example.env',
    },
    gitlab: {
      baseUrl: process.env.GITLAB_BASE_URL || 'https://gitlab.com',
      token: process.env.GITLAB_TOKEN || '',
    }
  }),
);
