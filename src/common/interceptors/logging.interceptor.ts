import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest } from 'fastify';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = ctx.getResponse();
          const delay = Date.now() - now;
          this.logger.log(
            `${method} ${url} ${response.statusCode} - ${delay}ms - ${ip} - ${userAgent}`,
          );
        },
        error: (error) => {
          const delay = Date.now() - now;
          this.logger.error(
            `${method} ${url} - ${delay}ms - ${ip} - ${userAgent} - Error: ${error.message}`,
          );
        },
      }),
    );
  }
}