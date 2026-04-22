import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';


@Injectable()
export class WinstonService implements LoggerService {
  private logger: winston.Logger;

  constructor(
    private configService: ConfigService
  ) {
    const level = this.configService.get<string>('logger.level', 'info');
    const dir = this.configService.get<string>('logger.path', 'logs');
    const size = this.configService.get<number>(
      'logger.maxSize',
      5 * 1024 * 1024,
    ); // 5MB
    const files = this.configService.get<number>('logger.maxFiles', 5);
    const maxDays = this.configService.get<string>('logger.maxDays', '30');

    const logDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
      ),
      transports: [
        // Console
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              ({ timestamp, level, message, context, ...meta }) => {
                const ctx = typeof context === 'string' ? context : 'App';
                const metaStr = Object.keys(meta).length
                  ? JSON.stringify(meta, null, 2)
                  : '';
                return `${String(timestamp)} [${ctx}] ${level}: ${String(message)} ${metaStr}`.trim();
              },
            ),
          ),
        }),
        // All logs
        new winston.transports.File({
          filename: path.join(logDir, 'all.log'),
          maxsize: size,
          maxFiles: files,
        }),
        // Errors only
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: size,
          maxFiles: files,
        }),
        // Daily rotation
        new winston.transports.DailyRotateFile({
          filename: path.join(logDir, 'application-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: size,
          maxFiles: maxDays,
        }),
      ],
    });
  }

  log(message: string, context?: string, data?: unknown) {
    this.logger.info(message, { context }, data);
  }

  error(message: string, trace?: string, context?: string, data?: unknown) {
    this.logger.error(message, { trace, context }, data);
  }

  warn(message: string, context?: string, data?: unknown) {
    this.logger.warn(message, { context }, data);
  }

  debug(message: string, context?: string, data?: unknown) {
    this.logger.debug(message, { context }, data);
  }

  verbose(message: string, context?: string, data?: unknown) {
    this.logger.verbose(message, { context }, data);
  }
}
