import { Module, ValidationPipe } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from './shared/logger/winston.module';
import { HttpModule } from '@nestjs/axios';
import { HashModule } from "./shared/hash/hash.module";
import { HealthModule } from './shared/health/health.module';
import { CoreModule } from './modules/core.module';

import appConfig from './config/app.config';
import loggerConfig from './config/logger.config';
import swaggerConfig from './config/swagger.config';
import passportConfig from './config/passport.config';
import httpConfig from './config/http.config';
import hashConfig from "./config/hash.config";
import throttlerConfig from "./config/throttler.config";
import coreConfig from './config/core.config';
import { throttlerFactory } from "./config/throttler.config";
import { httpFactory } from './config/http.config';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { LoggerInterceptor } from './common/interceptors/log.interceptor';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env`,
      load: [
        appConfig,
        throttlerConfig,
        passportConfig,
        loggerConfig,
        swaggerConfig,
        httpConfig,
        hashConfig,
        coreConfig,
      ],
      cache: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: throttlerFactory,
      inject: [ConfigService],
    }),
    HttpModule.registerAsync({
      global: true,
      useFactory: httpFactory,
      inject: [ConfigService],
    }),
    WinstonModule,
    HashModule,
    HealthModule,
    CoreModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor
    },
  ]
})
export class AppModule {}
