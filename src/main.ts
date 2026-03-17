import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from '@fastify/helmet';
import compression from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCors from '@fastify/cors';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: true,
      maxParamLength: 1000,
    }),
    { bufferLogs: true }
  );

  const configService = app.get(ConfigService);
  const logger = app.get(Logger);



  // Security
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
      },
    },
  });

  // CORS
  await app.register(fastifyCors, {
    origin: configService.get<string[]>('app.corsOrigin'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Rate limiting
  // Rate limiting
  await app.register(fastifyRateLimit, {
    max: configService.get<number>('app.rateLimit.limit') ?? 100,
    timeWindow: (configService.get<number>('app.rateLimit.ttl') ?? 60) * 1000,
    ban: 60,
    keyGenerator: (req) => {
      return (req.headers['x-forwarded-for'] as string) || req.ip;
    },
  });
  // Compression
  await app.register(compression, {
    encodings: ['gzip', 'deflate', 'br'],
    threshold: 1024, // Compress responses larger than 1KB
  });

  // Global prefixes
  // Global prefixes
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'metrics'],
  });
  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      errorHttpStatusCode: 422,
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger documentation
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('NestJS Boilerplate 2026 API')
      .setDescription('The NestJS Boilerplate API description')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  // Health check
  app.getHttpAdapter().get('/health', async (req, res) => {
    return res.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Start server
  // Start server
  const port = configService.get<number>('app.port') ?? 3000;
  const host = configService.get<string>('app.host') ?? '0.0.0.0';

  try {
    // Using the object syntax satisfies the FastifyListenOptions type
    await app.listen({ port, host });

    logger.log(`🚀 Application is running on: http://${host}:${port}/${apiPrefix}`);
    logger.log(`📄 API Documentation: http://${host}:${port}/docs`);
    logger.log(`❤️ Health Check: http://${host}:${port}/health`);
  } catch (err) {
    logger.error(`❌ Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});