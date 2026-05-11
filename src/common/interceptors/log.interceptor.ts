import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { WinstonService } from 'src/shared/logger/winston.service';



@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  constructor(
    private readonly winstonService: WinstonService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, query, params, body, payload } = request;

    const safeData = {
      payload: payload ? { 
        user: payload.user,
        email: payload.security?.email 
      } : undefined,
      body: { 
        ...body, 
        password: undefined, 
        code: undefined
      },
      query: {...query},
      params: {...params},
    };

    const now = Date.now();
    this.winstonService.log(`Incoming request: ${method} ${url}`, `HTTP`);
    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        this.winstonService.log(`${method} ${url} ${duration}ms`, 'HTTP');
        // this.winstonService.debug(`${method} ${url} ${duration}ms`, 'HTTP', safeData);
      }),
      catchError((error) => {
        const duration = Date.now() - now;
        // this.winstonService.error(
        //   `${method} ${url} ${duration}ms - Error: ${error.message};`,
        //   error.stack,
        //   'HTTP',
        //   safeData
        // );
        return throwError(() => error);
      }),
    );
  }
}