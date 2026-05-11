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
    url: string,
    token: string,
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
      url: process.env.GITLAB_URL || 'http://localhost:8080',
      token: process.env.GITLAB_TOKEN || '',
    }
  }),
);
