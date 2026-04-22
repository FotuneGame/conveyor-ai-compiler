import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  corsUrls: string[];
  dev: boolean;
}

export default registerAs(
  'app',
  (): AppConfig => ({
    port: parseInt(process.env.PORT || '5000', 10),
    corsUrls: process.env.URL_CORS?.split(' ') || [
      'http://localhost:5000',
      'https://localhost:5000',
      'http://localhost',
      'https://localhost',
    ],
    dev: process.env.DEV === 'true',
  }),
);
