import { Injectable } from '@nestjs/common';
import { OnApplicationBootstrap } from '@nestjs/common';
import { WinstonService } from '../logger/winston.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: WinstonService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    try {
      const port = this.configService.get<number>('app.port');
      const corsUrls = this.configService.get<string[]>('app.corsUrls');
      const devMode = this.configService.get<boolean>('app.dev');
      const swaggerPath = this.configService.get<string>(
        'swagger.path',
        'api-docs',
      );

      this.logger.log('Application module initialized');
      this.logger.log(`🚀 Server is running on port: ${port}`);
      this.logger.log(
        `📁 Environment: ${devMode ? 'Development' : 'Production'}`,
      );

      const basePublic = this.configService.get<string>('static.path', "public").replace(/^\.\/|\/$/g, '');
      this.logger.log(`🌐 Public URL: http://localhost:${port}/${basePublic}`);
      this.logger.log(`🌐 API URL: http://localhost:${port}`);
      

      if (devMode) {
        this.logger.log(
          `📚 Swagger UI: http://localhost:${port}/${swaggerPath}`,
        );
        this.logger.log(
          `📖 Swagger JSON: http://localhost:${port}/${swaggerPath}-json`,
        );
      }

      this.logger.debug(`🔗 CORS enabled for: ${corsUrls?.join(', ')}`);
    } catch (error) {
      this.logger.error(
        '❌ Failed to connect to database or Redis or Mail. Shutting down...',
        (error as Error).stack,
      );
      process.exit(1);
    }
  }
}
