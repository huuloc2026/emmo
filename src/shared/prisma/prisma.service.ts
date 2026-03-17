import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../../prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    constructor() {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL || '',
        });
        super({ adapter });

    }

    async onModuleInit() {
        await this.$connect();
        this.logger.log('Database connected successfully');
        
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Database disconnected');
    }

    async enableShutdownHooks() {
        process.on('beforeExit', async () => {
            await this.$disconnect();
        });
    }

    // Helper method for clean transactions
    async executeInTransaction<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
        return this.$transaction(async (prisma) => {
            return fn(prisma as PrismaClient);
        });
    }
}