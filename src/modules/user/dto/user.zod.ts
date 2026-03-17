import { z } from 'zod';
import { UserRole, UserStatus, AuthProvider } from '../../../generated/prisma';

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .optional(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  avatar: z.string().url().optional(),
  provider: z.nativeEnum(AuthProvider).default(AuthProvider.LOCAL),
  providerId: z.string().optional(),
  emailVerified: z.boolean().default(false),
});

export const UpdateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .optional(),
  fullName: z.string().min(2).optional(),
  avatar: z.string().url().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
}).strict();

export const UserFilterSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  sortBy: z.enum(['createdAt', 'email', 'fullName']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const UserIdSchema = z.object({
  id: z.string().uuid({ message: 'Invalid user ID format' }),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type UserFilterDto = z.infer<typeof UserFilterSchema>;