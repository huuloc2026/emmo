// src/modules/user/repositories/user.repository.ts
import { Injectable, Logger } from '@nestjs/common';
import { User, Prisma } from '../../../generated/prisma';
import { BaseRepository } from '../../../common/base/base.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';

@Injectable()
export class UserRepository extends BaseRepository<User> {
    protected readonly logger = new Logger(UserRepository.name);

    constructor(
        protected prisma: PrismaService,
        private redisService: RedisService,
    ) {
        super(prisma, 'user', redisService);
    }

    // Custom method for finding by email
    async findByEmail(email: string): Promise<User | null> {
        return this.findFirst({ email: email.toLowerCase() });
    }

    // Custom method for updating last login
    async updateLastLogin(id: string, ipAddress?: string): Promise<User> {
        return this.update(id, {
            lastLoginAt: new Date(),
            lastLoginIP: ipAddress,
        });
    }

    async findWithFilters(filters: {
        search?: string;
        searchFields?: string[];
        where?: any;
        include?: any;
        orderBy?: any;
        page?: number;
        limit?: number;
        startDate?: Date;
        endDate?: Date;
    }): Promise<{ data: User[]; total: number; page: number; limit: number }> { // 1. Added types here
        // Add default search fields if not provided
        if (filters.search && !filters.searchFields) {
            filters.searchFields = ['email', 'fullName'];
        }

        // Add default ordering if not provided
        if (!filters.orderBy) {
            filters.orderBy = { createdAt: 'desc' };
        }

        // 2. Destructure the result from the parent
        const result = await super.findWithFilters(filters);

        // 3. Return the full object to satisfy the BaseRepository interface
        return {
            ...result,
            page: filters.page || 1,
            limit: filters.limit || 10,
        };
    }
    // Custom method to find active users
    async findActiveUsers(page = 1, limit = 10): Promise<{ data: User[]; total: number }> {
        return this.findMany({
            where: { status: 'ACTIVE' },
            page,
            limit,
            orderBy: { createdAt: 'desc' },
        });
    }

    // Custom method to find users with pending email verification
    async findUnverifiedUsers(): Promise<User[]> {
        const { data } = await this.findMany({
            where: {
                emailVerified: false,
                status: 'PENDING_VERIFICATION',
            },
            limit: 100,
        });
        return data;
    }

    // Transaction example for creating user with related data
    async createUserWithProfile(userData: Prisma.UserCreateInput, profileData?: any): Promise<User> {
        return this.transaction(async (prisma) => {
            const user = await prisma.user.create({
                data: userData,
            });

            // Create related data if needed
            // if (profileData) {
            //   await prisma.profile.create({
            //     data: { ...profileData, userId: user.id },
            //   });
            // }

            return user;
        });
    }
}