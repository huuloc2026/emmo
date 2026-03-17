import { Prisma } from '@/generated/prisma';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { Logger, NotFoundException } from '@nestjs/common';

export abstract class BaseRepository<T> {
    protected abstract readonly logger: Logger;

    constructor(
        protected readonly prisma: PrismaService,
        protected readonly modelName: string,
        protected readonly cacheService?: any, // RedisService có thể inject sau
    ) { }

    /**
     * Get the Prisma delegate for the model
     */
    protected get model(): any {
        return this.prisma[this.modelName];
    }

    /**
     * Find entity by ID
     */
    async findById(id: string, include?: any): Promise<T | null> {
        try {
            // Try cache first if cache service exists
            if (this.cacheService) {
                const cached = await this.cacheService.get(`${this.modelName}:${id}`);
                if (cached) {
                    this.logger.debug(`Cache hit for ${this.modelName}:${id}`);
                    return cached as T;
                }
            }

            const result = await this.model.findUnique({
                where: { id, deletedAt: null },
                include,
            });

            // Cache the result
            if (result && this.cacheService) {
                await this.cacheService.set(`${this.modelName}:${id}`, result, 3600);
            }

            return result;
        } catch (error) {
            this.logger.error(`Error finding ${this.modelName} by id: ${error.message}`);
            throw error;
        }
    }

    /**
     * Find entity by ID or fail
     */
    async findByIdOrFail(id: string, include?: any): Promise<T> {
        const result = await this.findById(id, include);

        if (!result) {
            throw new NotFoundException(`${this.modelName} with id ${id} not found`);
        }

        return result;
    }

    /**
     * Find first entity matching criteria
     */
    async findFirst(where: any, include?: any): Promise<T | null> {
        try {
            return await this.model.findFirst({
                where: { ...where, deletedAt: null },
                include,
            });
        } catch (error) {
            this.logger.error(`Error finding first ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Find many entities with pagination
     */
    async findMany(params: {
        where?: any;
        include?: any;
        orderBy?: any;
        page?: number;
        limit?: number;
        skip?: number;
        take?: number;
    }): Promise<{ data: T[]; total: number; page: number; limit: number }> {
        const {
            where = {},
            include,
            orderBy = { createdAt: 'desc' },
            page = 1,
            limit = 10,
            skip,
            take,
        } = params;

        const calculatedSkip = skip ?? (page - 1) * limit;
        const calculatedTake = take ?? limit;

        try {
            // Build cache key for list queries
            const cacheKey = `${this.modelName}:list:${JSON.stringify({ where, page, limit, orderBy })}`;

            // Try cache for list queries (shorter TTL)
            if (this.cacheService && page === 1 && limit <= 50) {
                const cached = await this.cacheService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Cache hit for ${cacheKey}`);
                    return cached as any;
                }
            }

            const [data, total] = await Promise.all([
                this.model.findMany({
                    where: { ...where, deletedAt: null },
                    include,
                    orderBy,
                    skip: calculatedSkip,
                    take: calculatedTake,
                }),
                this.model.count({ where: { ...where, deletedAt: null } }),
            ]);

            const result = {
                data,
                total,
                page,
                limit: calculatedTake,
            };

            // Cache list results (short TTL)
            if (this.cacheService && page === 1 && limit <= 50) {
                await this.cacheService.set(cacheKey, result, 300); // 5 minutes cache
            }

            return result;
        } catch (error) {
            this.logger.error(`Error finding many ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a new entity
     */
    async create(data: any, include?: any): Promise<T> {
        try {
            const result = await this.model.create({
                data,
                include,
            });

            this.logger.log(`${this.modelName} created with id: ${result.id}`);

            // Clear list cache
            await this.clearListCache();

            return result;
        } catch (error) {
            this.logger.error(`Error creating ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create many entities
     */
    async createMany(data: any[]): Promise<{ count: number }> {
        try {
            const result = await this.model.createMany({
                data,
                skipDuplicates: true,
            });

            this.logger.log(`${result.count} ${this.modelName}(s) created`);

            // Clear list cache
            await this.clearListCache();

            return result;
        } catch (error) {
            this.logger.error(`Error creating many ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update an entity
     */
    async update(id: string, data: any, include?: any): Promise<T> {
        try {
            // Check if entity exists
            await this.findByIdOrFail(id);

            const result = await this.model.update({
                where: { id },
                data: {
                    ...data,
                    updatedAt: new Date(),
                },
                include,
            });

            this.logger.log(`${this.modelName} updated with id: ${id}`);

            // Clear caches
            await this.clearEntityCache(id);

            return result;
        } catch (error) {
            this.logger.error(`Error updating ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update many entities
     */
    async updateMany(where: any, data: any): Promise<{ count: number }> {
        try {
            const result = await this.model.updateMany({
                where: { ...where, deletedAt: null },
                data: {
                    ...data,
                    updatedAt: new Date(),
                },
            });

            this.logger.log(`Updated ${result.count} ${this.modelName}(s)`);

            // Clear list cache
            await this.clearListCache();

            return result;
        } catch (error) {
            this.logger.error(`Error updating many ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Soft delete an entity
     */
    async softDelete(id: string): Promise<T> {
        try {
            // Check if entity exists
            await this.findByIdOrFail(id);

            const result = await this.model.update({
                where: { id },
                data: {
                    deletedAt: new Date(),
                },
            });

            this.logger.log(`${this.modelName} soft deleted with id: ${id}`);

            // Clear caches
            await this.clearEntityCache(id);
            await this.clearListCache();

            return result;
        } catch (error) {
            this.logger.error(`Error soft deleting ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Hard delete an entity
     */
    async hardDelete(id: string): Promise<T> {
        try {
            const result = await this.model.delete({
                where: { id },
            });

            this.logger.log(`${this.modelName} hard deleted with id: ${id}`);

            // Clear caches
            await this.clearEntityCache(id);
            await this.clearListCache();

            return result;
        } catch (error) {
            this.logger.error(`Error hard deleting ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Soft delete many entities
     */
    async softDeleteMany(where: any): Promise<{ count: number }> {
        try {
            const result = await this.model.updateMany({
                where: { ...where, deletedAt: null },
                data: {
                    deletedAt: new Date(),
                },
            });

            this.logger.log(`Soft deleted ${result.count} ${this.modelName}(s)`);

            // Clear list cache
            await this.clearListCache();

            return result;
        } catch (error) {
            this.logger.error(`Error soft deleting many ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Restore a soft-deleted entity
     */
    async restore(id: string): Promise<T> {
        try {
            const result = await this.model.update({
                where: { id },
                data: {
                    deletedAt: null,
                },
            });

            this.logger.log(`${this.modelName} restored with id: ${id}`);

            // Clear caches
            await this.clearEntityCache(id);
            await this.clearListCache();

            return result;
        } catch (error) {
            this.logger.error(`Error restoring ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if entity exists
     */
    async exists(where: any): Promise<boolean> {
        try {
            const count = await this.model.count({
                where: { ...where, deletedAt: null },
            });
            return count > 0;
        } catch (error) {
            this.logger.error(`Error checking existence of ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Count entities
     */
    async count(where: any = {}): Promise<number> {
        try {
            return await this.model.count({
                where: { ...where, deletedAt: null },
            });
        } catch (error) {
            this.logger.error(`Error counting ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a raw query
     */
    async executeRaw(query: string, params?: any[]): Promise<any> {
        try {
            return await this.prisma.$executeRawUnsafe(query, ...(params || []));
        } catch (error) {
            this.logger.error(`Error executing raw query on ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a raw query and return results
     */
    async queryRaw(query: string, params?: any[]): Promise<any[]> {
        try {
            return await this.prisma.$queryRawUnsafe(query, ...(params || []));
        } catch (error) {
            this.logger.error(`Error executing raw query on ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Find entities with complex where conditions
     */
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
        dateField?: string;
    }): Promise<{ data: T[]; total: number; page: number; limit: number }> {
        const {
            search,
            searchFields = [],
            where = {},
            include,
            orderBy = { createdAt: 'desc' },
            page = 1,
            limit = 10,
            startDate,
            endDate,
            dateField = 'createdAt',
        } = filters;

        // Build where conditions
        let finalWhere: any = { ...where, deletedAt: null };

        // Add search conditions
        if (search && searchFields.length > 0) {
            finalWhere.OR = searchFields.map(field => ({
                [field]: { contains: search, mode: 'insensitive' },
            }));
        }

        // Add date range conditions
        if (startDate || endDate) {
            finalWhere[dateField] = {};
            if (startDate) {
                finalWhere[dateField].gte = startDate;
            }
            if (endDate) {
                finalWhere[dateField].lte = endDate;
            }
        }

        return this.findMany({
            where: finalWhere,
            include,
            orderBy,
            page,
            limit,
        });
    }

    /**
     * Bulk upsert entities
     */
    async bulkUpsert(
        data: any[],
        uniqueKey: string | string[],
        updateFields?: string[],
    ): Promise<{ created: number; updated: number }> {
        try {
            let created = 0;
            let updated = 0;

            for (const item of data) {
                // Build where condition based on unique key(s)
                const where = Array.isArray(uniqueKey)
                    ? uniqueKey.reduce((acc, key) => ({ ...acc, [key]: item[key] }), {})
                    : { [uniqueKey]: item[uniqueKey] };

                const existing = await this.model.findFirst({ where });

                if (existing) {
                    // Update existing
                    const updateData = updateFields
                        ? updateFields.reduce((acc, field) => ({ ...acc, [field]: item[field] }), {})
                        : item;

                    await this.model.update({
                        where: { id: existing.id },
                        data: updateData,
                    });
                    updated++;
                } else {
                    // Create new
                    await this.model.create({ data: item });
                    created++;
                }
            }

            this.logger.log(`Bulk upsert on ${this.modelName}: ${created} created, ${updated} updated`);

            // Clear list cache
            await this.clearListCache();

            return { created, updated };
        } catch (error) {
            this.logger.error(`Error bulk upserting ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get paginated results with cursor-based pagination
     */
    async findWithCursor(params: {
        where?: any;
        include?: any;
        orderBy?: any;
        limit?: number;
        cursor?: string;
        cursorField?: string;
    }): Promise<{ data: T[]; nextCursor: string | null; hasMore: boolean }> {
        const {
            where = {},
            include,
            orderBy = { createdAt: 'desc' },
            limit = 10,
            cursor,
            cursorField = 'id',
        } = params;

        try {
            const cursorOrderBy = Array.isArray(orderBy) ? orderBy[0] : orderBy;
            const cursorDirection = Object.values(cursorOrderBy)[0] === 'desc' ? 'lt' : 'gt';

            const query: any = {
                where: { ...where, deletedAt: null },
                include,
                orderBy,
                take: limit + 1, // Take one extra to check if there's more
            };

            if (cursor) {
                query.cursor = { [cursorField]: cursor };
                query.skip = 1; // Skip the cursor
            }

            const results = await this.model.findMany(query);

            const hasMore = results.length > limit;
            const data = hasMore ? results.slice(0, -1) : results;
            const nextCursor = hasMore ? data[data.length - 1][cursorField] : null;

            return {
                data,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            this.logger.error(`Error finding with cursor on ${this.modelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear cache for a specific entity
     */
    protected async clearEntityCache(id: string): Promise<void> {
        if (this.cacheService) {
            await this.cacheService.del(`${this.modelName}:${id}`);
        }
    }

    /**
     * Clear all list caches (can be overridden)
     */
    protected async clearListCache(): Promise<void> {
        if (this.cacheService) {
            // This is a simplified approach - in production you might want to use Redis patterns
            // or maintain a list of cache keys
            this.logger.debug(`Clearing list cache for ${this.modelName}`);
        }
    }

    /**
     * Execute operations in a transaction
     */
    async transaction<R>(fn: (prisma: Prisma.TransactionClient) => Promise<R>): Promise<R> {
        try {
            // Cast the transaction instance to 'any' or the specific generated TransactionClient
            return await this.prisma.$transaction(async (tx) => {
                return fn(tx as Prisma.TransactionClient);
            });
        } catch (error) {
            this.logger.error(`Transaction failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Find entities with grouping and aggregation
     */
    async aggregate(params: {
        where?: any;
        groupBy?: string | string[];
        aggregates?: {
            _count?: boolean;
            _sum?: string[];
            _avg?: string[];
            _min?: string[];
            _max?: string[];
        };
        having?: any;
        orderBy?: any;
    }): Promise<any[]> {
        try {
            const { where = {}, groupBy, aggregates = {}, having, orderBy } = params;

            // Build aggregate selections
            const select: any = {};

            if (aggregates._count) {
                select._count = true;
            }

            ['_sum', '_avg', '_min', '_max'].forEach(aggType => {
                if (aggregates[aggType]?.length) {
                    select[aggType] = {};
                    aggregates[aggType].forEach(field => {
                        select[aggType][field] = true;
                    });
                }
            });

            // For Prisma, we need to use groupBy
            if (groupBy) {
                return await this.model.groupBy({
                    by: Array.isArray(groupBy) ? groupBy : [groupBy],
                    where: { ...where, deletedAt: null },
                    having,
                    orderBy,
                    ...select,
                });
            }

            // Simple aggregation without grouping
            return await this.model.aggregate({
                where: { ...where, deletedAt: null },
                ...select,
            });
        } catch (error) {
            this.logger.error(`Error aggregating ${this.modelName}: ${error.message}`);
            throw error;
        }
    }
}