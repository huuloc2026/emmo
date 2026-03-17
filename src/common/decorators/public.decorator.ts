import { SetMetadata } from '@nestjs/common';

/**
 * Key used to store the "isPublic" metadata in the reflector.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark a route as public, bypassing the global JwtAuthGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);