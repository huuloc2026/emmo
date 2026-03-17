import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {
    
    
    super({
      host: configService.get('redis.host'),
      port: configService.get('redis.port'),
      password: configService.get('redis.password'),
      db: configService.get('redis.db'),
      keyPrefix: configService.get('redis.keyPrefix'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });
  }

  async onModuleDestroy() {
    await this.quit();
    this.logger.log('Redis disconnected');
  }

  // Helper methods
  async setWithExpiry(key: string, value: any, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async getParsed<T>(key: string): Promise<T | null> {
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async bulkSetWithExpiry(items: { key: string; value: any; ttl: number }[]): Promise<void> {
    const pipeline = this.pipeline();
    items.forEach(({ key, value, ttl }) => {
      pipeline.set(key, JSON.stringify(value), 'EX', ttl);
    });
    await pipeline.exec();
  }

  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {

    const result = await this.set(lockKey, 'locked', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(lockKey: string): Promise<void> {
    await this.del(lockKey);
  }
}