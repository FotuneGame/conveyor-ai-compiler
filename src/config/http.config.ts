import { registerAs } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';

export interface HTTPConfig {
  timeout: number;
  maxRedirects: number;
}

export const httpFactory = (configService: ConfigService) => ({
    timeout: configService.get('http.timeout', 5000),
    maxRedirects: configService.get('http.maxRedirects', 5),
});

export default registerAs(
  'http',
  (): HTTPConfig => ({
    timeout: parseInt(process.env.HTTP_TIMEOUT || '5000', 10),
    maxRedirects: parseInt(process.env.HTTP_MAX_REDIRECTS || '5', 10),
  }),
);
