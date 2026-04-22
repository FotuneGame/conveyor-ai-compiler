import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { swaggerOptions } from './config/swagger.config';
import { nestCsrf, CsrfFilter } from "ncsrf";
import helmet from 'helmet';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);
    const port = configService.get<number>('app.port', 5000);
    const corsUrls = configService.get<string[]>('app.corsUrls', ['http://localhost:5000']);
    const devMode = configService.get<boolean>('app.dev', true);

    if (devMode) {
      const { config, customOptions } = swaggerOptions();
      const document = SwaggerModule.createDocument(app, config);
      const swaggerPath = configService.get<string>('swagger.path', 'api-docs');
      SwaggerModule.setup(swaggerPath, app, document, customOptions);
    }
    

    app.use(
      helmet({
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: devMode ? false : undefined,
      })
    );
    app.enableCors({
      origin: (
        origin: string,
        callback: (error: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin) {
          return callback(null, true);
        }

        if (corsUrls.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'), false);
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Accept',
        'Origin',
        'X-Requested-With',
        'Cross-Origin-Resource-Policy'
      ],
      exposedHeaders: ['Set-Cookie', 'Authorization'],
      credentials: true,
      maxAge: 86400,
    });
 
    const cookieParserModule = await import('cookie-parser');
    app.use(cookieParserModule.default());
    app.use(nestCsrf());
    app.useGlobalFilters(new CsrfFilter());

    const httpAdapter = app.getHttpAdapter().getInstance();
    httpAdapter.set('trust proxy', true);
    
    await app.listen(port);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

void bootstrap();
