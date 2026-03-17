import { UserRole, UserStatus, AuthProvider } from '../../../generated/prisma';
export interface IUser {
  id: string;
  email: string;
  fullName: string;
  avatar?: string | null;
  role: UserRole;
  status: UserStatus;
  provider: AuthProvider;
  emailVerified: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserCreate {
  email: string;
  password?: string;
  fullName: string;
  avatar?: string;
  provider?: AuthProvider;
  providerId?: string;
  emailVerified?: boolean;
}

export interface IUserUpdate {
  fullName?: string;
  avatar?: string;
  emailVerified?: boolean;
  status?: UserStatus;
  role?: UserRole;
  lastLoginAt?: Date;
  lastLoginIP?: string;
}