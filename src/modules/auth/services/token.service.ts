import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../../shared/redis/redis.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TokenPayload, TokenResponse } from '../interfaces/token-payload.interface';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTokenExpiry: number;
  private readonly refreshTokenExpiry: number;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private prisma: PrismaService,
  ) {
    // Convert string expiry to seconds
    this.accessTokenExpiry = this.parseExpiry(this.configService.get('jwt.expiresIn', '15m'));
    this.refreshTokenExpiry = this.parseExpiry(this.configService.get('jwt.refreshExpiresIn', '7d'));
  }

  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return parseInt(expiry, 10) || 900; // default 15 minutes
    }
  }

  async generateTokens(user: any, deviceInfo?: string, ipAddress?: string): Promise<TokenResponse> {
    const jti = uuidv4();
    const tokenId = uuidv4();

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };

    // Generate tokens
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(
        { ...payload, tokenId },
        {
          secret: this.configService.get('jwt.refreshSecret'),
          expiresIn: this.configService.get('jwt.refreshExpiresIn'),
        },
      ),
    ]);

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + this.refreshTokenExpiry * 1000),
        deviceInfo,
        ipAddress,
      },
    });

    // Store in Redis for quick lookup/blacklist
    await this.redisService.setWithExpiry(
      `access_token:${jti}`,
      { userId: user.id, jti },
      this.accessTokenExpiry,
    );

    this.logger.debug(`Tokens generated for user: ${user.id}`);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiry,
    };
  }

  async refreshTokens(refreshToken: string, deviceInfo?: string, ipAddress?: string): Promise<TokenResponse> {
    // Verify refresh token
    const payload = await this.verifyRefreshToken(refreshToken);
    
    // Get user
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Revoke old refresh token
    await this.revokeRefreshToken(refreshToken, payload.tokenId);

    // Generate new tokens
    return this.generateTokens(user, deviceInfo, ipAddress);
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      
      // Check if token is blacklisted
      const isBlacklisted = await this.redisService.get(`blacklist:${payload.jti}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async verifyRefreshToken(token: string): Promise<any> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('jwt.refreshSecret'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async revokeRefreshToken(token: string, tokenId?: string): Promise<void> {
    // If tokenId not provided, extract from token
    if (!tokenId) {
      try {
        const payload = await this.jwtService.decode(token) as any;
        tokenId = payload?.tokenId;
      } catch (error) {
        this.logger.error('Failed to decode refresh token', error);
      }
    }

    // Update in database
    await this.prisma.refreshToken.updateMany({
      where: { token },
      data: { revokedAt: new Date() },
    });

    // Add to blacklist in Redis
    if (tokenId) {
      await this.redisService.setWithExpiry(
        `blacklist:refresh:${tokenId}`,
        'revoked',
        this.refreshTokenExpiry,
      );
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    // Revoke all refresh tokens in database
    await this.prisma.refreshToken.updateMany({
      where: { 
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    // Note: Access tokens will expire naturally, but we could add them to blacklist
    // This would require storing all jti's, which might be heavy
    // Instead, we can rely on short-lived access tokens
  }

  async logout(accessToken: string, refreshToken: string): Promise<void> {
    try {
      // Decode tokens to get jti and tokenId
      const accessPayload = this.jwtService.decode(accessToken) as TokenPayload;
      const refreshPayload = this.jwtService.decode(refreshToken) as any;

      // Blacklist access token
      if (accessPayload?.jti) {
        const expiresIn = accessPayload.exp ? accessPayload.exp - Math.floor(Date.now() / 1000) : this.accessTokenExpiry;
        if (expiresIn > 0) {
          await this.redisService.setWithExpiry(
            `blacklist:${accessPayload.jti}`,
            'revoked',
            expiresIn,
          );
        }
      }

      // Revoke refresh token
      if (refreshPayload?.tokenId) {
        await this.revokeRefreshToken(refreshToken, refreshPayload.tokenId);
      }

      // Remove from Redis
      await this.redisService.del(`refresh_token:${refreshPayload?.sub}`);
    } catch (error) {
      this.logger.error('Logout failed', error);
    }
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redisService.get(`blacklist:${jti}`);
    return !!result;
  }
}