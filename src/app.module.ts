import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './shared/prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from './shared/redis/redis.module';
import redisConfig from './modules/config/redis/redis.config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [redisConfig], }), LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',

    },
  }),
  // Throttling
  ThrottlerModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ([
      {
        // Provide sensible defaults (e.g., 60 seconds, 10 requests)
        ttl: config.get<number>('app.rateLimit.ttl') ?? 60,
        limit: config.get<number>('app.rateLimit.limit') ?? 10,
      },
    ]),
  }),
    PrismaModule, RedisModule, AuthModule, UserModule],
  controllers: [AppController],
  providers: [AppService,// Global guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

    // Global interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },],
})
export class AppModule { }
