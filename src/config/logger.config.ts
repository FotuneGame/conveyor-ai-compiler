import { registerAs } from '@nestjs/config';

export interface LoggerConfig {
  level: string;
  path: string;
  maxSize: number;
  maxFiles: number;
  maxDays: string;
}

export default registerAs(
  'logger',
  (): LoggerConfig => ({
    level: process.env.LOG_LEVEL || 'info',
    path: process.env.LOG_PATH || 'logs',
    maxSize: parseInt(process.env.LOG_MAX_SIZE || '5242880', 10), // 5MB
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
    maxDays: process.env.LOG_MAX_DAYS || '30',
  }),
);
