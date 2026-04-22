import { registerAs } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';

export interface ThrottlerConfig {
    ttl: number,
    limit: number
}

export const throttlerFactory = (config: ConfigService) => ([
  {
    ttl: config.get<number>('throttler.ttl', 5000),
    limit: config.get<number>('throttler.limit', 10),
  }
]);

export default registerAs(
  'throttler',
  (): ThrottlerConfig => ({
    ttl: parseInt(process.env.MAX_REQUESTS_TTL_MS || '5000', 10),
    limit: parseInt(process.env.MAX_REQUESTS_LIMIT || '10', 10)
  }),
);
