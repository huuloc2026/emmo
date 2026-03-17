import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './shared/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './shared/redis/redis.module';
import redisConfig from './modules/config/redis/redis.config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [redisConfig], }), PrismaModule, RedisModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
