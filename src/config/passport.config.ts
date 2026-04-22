import { registerAs } from '@nestjs/config';

export interface PassportConfig {
  compiler: {
    secret: string,
  },
}

export default registerAs(
  'passport',
  (): PassportConfig => ({
    compiler: {
      secret: process.env.COMPILER_SECRET || 'test-compiler-secret',
    }
  }),
);
