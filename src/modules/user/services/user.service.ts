import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '../../../generated/prisma'; // Fix import
import { UserRepository } from '../repositories/user.repository';
import { UserEntity } from '../entities/user.entity';
import { CreateUserDto, UpdateUserDto, UserFilterDto } from '../dto/user.zod';
import { RedisService } from '../../../shared/redis/redis.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly CACHE_LIST_TTL = 300; // 5 minutes for list queries

  constructor(
    private userRepository: UserRepository,
    private redisService: RedisService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserEntity> {
    try {
      // Check if user exists
      const existingUser = await this.userRepository.findByEmail(createUserDto.email);
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash password if provided
      if (createUserDto.password) {
        createUserDto.password = await this.hashPassword(createUserDto.password);
      }

      // Prepare data for creation
      const userData = {
        ...createUserDto,
        email: createUserDto.email.toLowerCase(), // Normalize email
      };

      const user = await this.userRepository.create(userData);
      this.logger.log(`User created: ${user.id}`);

      // Clear list cache (invalidate all list caches)
      await this.invalidateListCache();

      return new UserEntity(user);
    } catch (error) {
      this.logger.error(`Error creating user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(filters: UserFilterDto): Promise<{ 
    data: UserEntity[]; 
    total: number; 
    page: number; 
    limit: number;
    totalPages: number;
  }> {
    try {
      const { page = 1, limit = 10, search, role, status, sortBy = 'createdAt', sortOrder = 'desc' } = filters;

      // Create cache key based on filters
      const cacheKey = this.generateListCacheKey(filters);
      
      // Try to get from cache for first page only (to avoid cache explosion)
      if (page === 1 && limit <= 50) {
        const cached = await this.redisService.getParsed<{ 
          data: User[]; 
          total: number;
          timestamp: number;
        }>(cacheKey);
        
        // Check if cache is still valid (max 5 minutes old)
        if (cached && Date.now() - cached.timestamp < this.CACHE_LIST_TTL * 1000) {
          this.logger.debug(`Cache hit for ${cacheKey}`);
          return {
            data: cached.data.map(user => new UserEntity(user)),
            total: cached.total,
            page,
            limit,
            totalPages: Math.ceil(cached.total / limit),
          };
        }
      }

      // Get from database using repository's findWithFilters
      const { data, total } = await this.userRepository.findWithFilters({
        search,
        searchFields: ['email', 'fullName'],
        where: {
          ...(role && { role }),
          ...(status && { status }),
        },
        orderBy: { [sortBy]: sortOrder },
        page,
        limit,
      });

      // Cache the result for first page only
      if (page === 1 && limit <= 50) {
        await this.redisService.setWithExpiry(
          cacheKey, 
          { 
            data, 
            total,
            timestamp: Date.now(),
          }, 
          this.CACHE_LIST_TTL
        );
      }

      return {
        data: data.map(user => new UserEntity(user)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`Error finding all users: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string): Promise<UserEntity> {
    try {
      const cacheKey = `user:${id}`;
      
      // Try to get from cache
      const cached = await this.redisService.getParsed<User>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for user:${id}`);
        return new UserEntity(cached);
      }

      // Get from database using BaseRepository's findById
      const user = await this.userRepository.findById(id, {
        // Include relations if needed
        // wallet: true,
        // orders: { take: 5, orderBy: { createdAt: 'desc' } }
      });
      
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Cache the result
      await this.redisService.setWithExpiry(cacheKey, user, this.CACHE_TTL);

      return new UserEntity(user);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error finding user ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    try {
      const normalizedEmail = email.toLowerCase();
      
      // Try cache first
      const cacheKey = `user:email:${normalizedEmail}`;
      const cached = await this.redisService.getParsed<User>(cacheKey);
      if (cached) {
        return new UserEntity(cached);
      }

      // Use repository's findByEmail (custom method)
      const user = await this.userRepository.findByEmail(normalizedEmail);
      
      if (user) {
        // Cache by email as well
        await this.redisService.setWithExpiry(cacheKey, user, this.CACHE_TTL);
        // Also cache by ID
        await this.redisService.setWithExpiry(`user:${user.id}`, user, this.CACHE_TTL);
      }
      
      return user ? new UserEntity(user) : null;
    } catch (error) {
      this.logger.error(`Error finding user by email ${email}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserEntity> {
    try {
      // Check if user exists using BaseRepository's findByIdOrFail
      const existingUser = await this.userRepository.findByIdOrFail(id);

      // If email is being updated, check if it's already taken
      if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
        const userWithEmail = await this.userRepository.findByEmail(updateUserDto.email);
        if (userWithEmail) {
          throw new ConflictException('Email is already taken');
        }
        updateUserDto.email = updateUserDto.email.toLowerCase();
      }

      // Hash password if being updated
      if (updateUserDto.password) {
        updateUserDto.password = await this.hashPassword(updateUserDto.password);
      }

      // Update using BaseRepository's update
      const updatedUser = await this.userRepository.update(id, updateUserDto);
      
      this.logger.log(`User updated: ${id}`);

      // Invalidate caches
      await this.invalidateUserCache(id, existingUser.email);

      return new UserEntity(updatedUser);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Error updating user ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      // Check if user exists
      const user = await this.userRepository.findByIdOrFail(id);

      // Soft delete using BaseRepository
      await this.userRepository.softDelete(id);
      
      this.logger.log(`User soft deleted: ${id}`);

      // Invalidate caches
      await this.invalidateUserCache(id, user.email);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error removing user ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async hardRemove(id: string): Promise<void> {
    try {
      // Check if user exists
      await this.userRepository.findByIdOrFail(id);

      // Hard delete using BaseRepository
      await this.userRepository.hardDelete(id);
      
      this.logger.log(`User hard deleted: ${id}`);

      // Invalidate caches (though user is gone)
      await this.invalidateUserCache(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error hard removing user ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async restore(id: string): Promise<UserEntity> {
    try {
      // Restore using BaseRepository
      const restoredUser = await this.userRepository.restore(id);
      
      this.logger.log(`User restored: ${id}`);

      // Invalidate caches
      await this.invalidateUserCache(id, restoredUser.email);
      await this.invalidateListCache();

      return new UserEntity(restoredUser);
    } catch (error) {
      this.logger.error(`Error restoring user ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async validatePassword(user: UserEntity, password: string): Promise<boolean> {
    if (!user.password) {
      return false;
    }
    try {
      return await bcrypt.compare(password, user.password);
    } catch (error) {
      this.logger.error(`Error validating password for user ${user.id}: ${error.message}`);
      return false;
    }
  }

  async updateLastLogin(id: string, ipAddress?: string): Promise<void> {
    try {
      // Use custom repository method
      await this.userRepository.updateLastLogin(id, ipAddress);
      
      // Invalidate cache
      await this.redisService.del(`user:${id}`);
      
      this.logger.debug(`Updated last login for user ${id}`);
    } catch (error) {
      this.logger.error(`Error updating last login for user ${id}: ${error.message}`, error.stack);
      // Don't throw - this is not critical
    }
  }

  async countUsers(where?: any): Promise<number> {
    try {
      return await this.userRepository.count(where);
    } catch (error) {
      this.logger.error(`Error counting users: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUsersByRole(role: string): Promise<UserEntity[]> {
    try {
      const { data } = await this.userRepository.findMany({
        where: { role },
        orderBy: { createdAt: 'desc' },
        limit: 100, // Reasonable limit
      });
      
      return data.map(user => new UserEntity(user));
    } catch (error) {
      this.logger.error(`Error getting users by role ${role}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async searchUsers(query: string): Promise<UserEntity[]> {
    try {
      const { data } = await this.userRepository.findWithFilters({
        search: query,
        searchFields: ['email', 'fullName'],
        limit: 20,
      });
      
      return data.map(user => new UserEntity(user));
    } catch (error) {
      this.logger.error(`Error searching users with query ${query}: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12); // Increased salt rounds for better security
    return bcrypt.hash(password, salt);
  }

  private generateListCacheKey(filters: UserFilterDto): string {
    const { page = 1, limit = 10, search, role, status, sortBy = 'createdAt', sortOrder = 'desc' } = filters;
    return `users:list:p${page}:l${limit}:s${search || ''}:r${role || ''}:st${status || ''}:sb${sortBy}:so${sortOrder}`;
  }

  private async invalidateUserCache(id: string, email?: string): Promise<void> {
    const keys = [`user:${id}`];
    if (email) {
      keys.push(`user:email:${email.toLowerCase()}`);
    }
    
    await Promise.all(keys.map(key => this.redisService.del(key)));
    this.logger.debug(`Invalidated user caches: ${keys.join(', ')}`);
  }

  private async invalidateListCache(): Promise<void> {
    // In production, you might want to use Redis pattern matching
    // For now, we'll just increment a version key to invalidate all list caches
    await this.redisService.incr('users:list:version');
    this.logger.debug('Invalidated all user list caches');
  }

  async getOrCreateCacheListKey(baseKey: string): Promise<string> {
    const version = await this.redisService.get('users:list:version') || '1';
    return `${baseKey}:v${version}`;
  }
}