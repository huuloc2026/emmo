import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../../user/services/user.service';
import { TokenService } from './token.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from '../dto/auth.zod';
import { UserEntity } from '../../user/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxLoginAttempts = 5;
  private readonly lockoutTime = 15 * 60; // 15 minutes in seconds

  constructor(
    private userService: UserService,
    private tokenService: TokenService,
    private redisService: RedisService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto, deviceInfo?: string, ipAddress?: string) {
    // Check if user exists
    const existingUser = await this.userService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user
    const user = await this.userService.create({
      ...registerDto,
      emailVerified: false,
    });

    // Generate email verification token
    const verificationToken = await this.createEmailVerificationToken(user.id);

    // TODO: Send verification email
    this.logger.log(`User registered: ${user.id}, verification token: ${verificationToken}`);

    // Generate tokens
    const tokens = await this.tokenService.generateTokens(user, deviceInfo, ipAddress);

    return {
      user: user.profile,
      ...tokens,
      requiresEmailVerification: true,
    };
  }

  async login(loginDto: LoginDto, deviceInfo?: string, ipAddress?: string) {
    // Check for too many attempts
    await this.checkLoginAttempts(loginDto.email);

    // Find user
    const user = await this.userService.findByEmail(loginDto.email);
    if (!user) {
      await this.recordFailedAttempt(loginDto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Validate password
    const isValidPassword = await this.userService.validatePassword(user, loginDto.password);
    if (!isValidPassword) {
      await this.recordFailedAttempt(loginDto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failed attempts
    await this.clearLoginAttempts(loginDto.email);

    // Update last login
    await this.userService.updateLastLogin(user.id, ipAddress);

    // Generate tokens
    const tokens = await this.tokenService.generateTokens(user, deviceInfo, ipAddress);

    this.logger.log(`User logged in: ${user.id}`);

    return {
      user: user.profile,
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string, deviceInfo?: string, ipAddress?: string) {
    return this.tokenService.refreshTokens(refreshToken, deviceInfo, ipAddress);
  }

  async logout(accessToken: string, refreshToken: string) {
    await this.tokenService.logout(accessToken, refreshToken);
    this.logger.log('User logged out');
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.userService.findByEmail(forgotPasswordDto.email);
    
    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If your email exists, you will receive a reset link' };
    }

    // Generate reset token
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt,
      },
    });

    // Store in Redis for rate limiting
    await this.redisService.setWithExpiry(
      `password_reset:${user.id}`,
      resetToken,
      3600,
    );

    // TODO: Send reset email
    this.logger.log(`Password reset requested for: ${user.id}, token: ${resetToken}`);

    return { message: 'If your email exists, you will receive a reset link' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    // Find valid reset token
    const resetRequest = await this.prisma.passwordReset.findFirst({
      where: {
        token: resetPasswordDto.token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRequest) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    // Get user
    const user = await this.userService.findOne(resetRequest.userId);

    // Hash new password
    const hashedPassword = await bcrypt.hash(resetPasswordDto.password, 10);

    // Update user password
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Mark reset token as used
    await this.prisma.passwordReset.update({
      where: { id: resetRequest.id },
      data: { usedAt: new Date() },
    });

    // Revoke all tokens
    await this.tokenService.revokeAllUserTokens(user.id);

    // Clear Redis
    await this.redisService.del(`password_reset:${user.id}`);

    this.logger.log(`Password reset completed for: ${user.id}`);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.userService.findOne(userId);

    // Verify current password
    const isValid = await this.userService.validatePassword(user, changePasswordDto.currentPassword);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Revoke all tokens (force re-login)
    await this.tokenService.revokeAllUserTokens(userId);

    this.logger.log(`Password changed for: ${userId}`);
  }

  async verifyEmail(token: string) {
    const verification = await this.prisma.emailVerification.findFirst({
      where: {
        token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!verification) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    // Update user
    await this.prisma.user.update({
      where: { id: verification.userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    // Mark token as used
    await this.prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });

    this.logger.log(`Email verified for: ${verification.userId}`);
  }

  async validateOrCreateOAuthUser(profile: any, provider: string) {
    // Try to find existing user by email
    let user = await this.userService.findByEmail(profile.email);

    if (user) {
      // If user exists but with different provider, link the account
      if (user.provider !== provider) {
        // TODO: Handle account linking
        this.logger.warn(`User ${user.id} trying to login with different provider`);
      }
      return user;
    }

    // Create new user
    const newUser = await this.userService.create({
      email: profile.email,
      fullName: profile.fullName,
      avatar: profile.avatar,
      provider: provider as any,
      providerId: profile.id,
      emailVerified: profile.emailVerified || true,
    });

    this.logger.log(`OAuth user created: ${newUser.id} via ${provider}`);

    return newUser;
  }

  private async createEmailVerificationToken(userId: string): Promise<string> {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 3600000); // 24 hours

    await this.prisma.emailVerification.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return token;
  }

  private async checkLoginAttempts(email: string): Promise<void> {
    const attempts = await this.redisService.get(`login_attempts:${email}`);
    if (attempts && parseInt(attempts) >= this.maxLoginAttempts) {
      const ttl = await this.redisService.ttl(`login_attempts:${email}`);
      throw new UnauthorizedException(`Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes`);
    }
  }

  private async recordFailedAttempt(email: string, ipAddress?: string): Promise<void> {
    const key = `login_attempts:${email}`;
    await this.redisService.incr(key);
    await this.redisService.expire(key, this.lockoutTime);

    // Record in database
    await this.prisma.loginHistory.create({
      data: {
        userId: email, // We don't have user id yet
        ipAddress,
        success: false,
        failureReason: 'Invalid credentials',
      },
    });
  }

  private async clearLoginAttempts(email: string): Promise<void> {
    await this.redisService.del(`login_attempts:${email}`);
  }
}