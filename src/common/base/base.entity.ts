import { Exclude } from 'class-transformer';

export abstract class BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  
  @Exclude()
  deletedAt?: Date | null;

  constructor(partial: Partial<BaseEntity>) {
    Object.assign(this, partial);
  }

  abstract toJSON(): Record<string, any>;
}