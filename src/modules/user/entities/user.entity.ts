import { UserRole, UserStatus, AuthProvider } from '../../../generated/prisma';
import { Exclude, Expose } from 'class-transformer';

export class UserEntity {
  id: string;
  email: string;
  
  @Exclude()
  password?: string;
  
  fullName: string;
  avatar?: string | null;
  role: UserRole;
  status: UserStatus;
  provider: AuthProvider;
  providerId?: string | null;
  
  @Exclude()
  twoFactorEnabled: boolean;
  
  @Exclude()
  twoFactorSecret?: string | null;
  
  emailVerified: boolean;
  emailVerifiedAt?: Date | null;
  
  @Exclude()
  lastLoginAt?: Date | null;
  
  @Exclude()
  lastLoginIP?: string | null;
  
  createdAt: Date;
  updatedAt: Date;
  
  @Exclude()
  deletedAt?: Date | null;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }

  @Expose()
  get isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  @Expose()
  get isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  @Expose()
  get profile(): Partial<UserEntity> {
    return {
      id: this.id,
      email: this.email,
      fullName: this.fullName,
      avatar: this.avatar,
      role: this.role,
      emailVerified: this.emailVerified,
      createdAt: this.createdAt,
    };
  }
}