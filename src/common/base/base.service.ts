import { Logger, NotFoundException } from '@nestjs/common';

export abstract class BaseService<T, CreateDto, UpdateDto> {
  protected abstract readonly logger: Logger;
  protected abstract readonly repository: any;

  async create(createDto: CreateDto): Promise<T> {
    try {
      const entity = await this.repository.create(createDto);
      this.logger.log(`Created ${this.getEntityName()}: ${entity.id}`);
      return entity;
    } catch (error) {
      this.logger.error(`Error creating ${this.getEntityName()}: ${error.message}`);
      throw error;
    }
  }

  async findAll(params?: any): Promise<{ data: T[]; total: number; page: number; limit: number }> {
    try {
      return await this.repository.findMany(params || {});
    } catch (error) {
      this.logger.error(`Error finding all ${this.getEntityName()}s: ${error.message}`);
      throw error;
    }
  }

  async findOne(id: string): Promise<T> {
    try {
      const entity = await this.repository.findById(id);
      
      if (!entity) {
        throw new NotFoundException(`${this.getEntityName()} with ID ${id} not found`);
      }
      
      return entity;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error finding ${this.getEntityName()}: ${error.message}`);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateDto): Promise<T> {
    try {
      const entity = await this.repository.update(id, updateDto);
      this.logger.log(`Updated ${this.getEntityName()}: ${id}`);
      return entity;
    } catch (error) {
      this.logger.error(`Error updating ${this.getEntityName()}: ${error.message}`);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.repository.softDelete(id);
      this.logger.log(`Removed ${this.getEntityName()}: ${id}`);
    } catch (error) {
      this.logger.error(`Error removing ${this.getEntityName()}: ${error.message}`);
      throw error;
    }
  }

  async hardRemove(id: string): Promise<void> {
    try {
      await this.repository.hardDelete(id);
      this.logger.log(`Hard removed ${this.getEntityName()}: ${id}`);
    } catch (error) {
      this.logger.error(`Error hard removing ${this.getEntityName()}: ${error.message}`);
      throw error;
    }
  }

  async restore(id: string): Promise<T> {
    try {
      const entity = await this.repository.restore(id);
      this.logger.log(`Restored ${this.getEntityName()}: ${id}`);
      return entity;
    } catch (error) {
      this.logger.error(`Error restoring ${this.getEntityName()}: ${error.message}`);
      throw error;
    }
  }

  async exists(where: any): Promise<boolean> {
    try {
      return await this.repository.exists(where);
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.getEntityName()}: ${error.message}`);
      throw error;
    }
  }

  async count(where?: any): Promise<number> {
    try {
      return await this.repository.count(where);
    } catch (error) {
      this.logger.error(`Error counting ${this.getEntityName()}s: ${error.message}`);
      throw error;
    }
  }

  protected getEntityName(): string {
    return this.constructor.name.replace('Service', '');
  }
}