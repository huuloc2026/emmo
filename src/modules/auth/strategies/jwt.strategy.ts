import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from '../services/token.service';
import { UserService } from '../../user/services/user.service';
import { TokenPayload } from '../interfaces/token-payload.interface';
// Import the actual Enum from your generated Prisma folder
import { UserStatus } from '../../../generated/prisma'; 

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private tokenService: TokenService,
    private userService: UserService,
  ) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT Secret not found in configuration');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true, // Note: This changes the validate() signature
    });
  }

  /**
   * When passReqToCallback is true, 'request' is the FIRST argument.
   */
  async validate(request: any, payload: TokenPayload) {
    // 1. Check if token is blacklisted in Redis
    if (payload.jti) {
      const isBlacklisted = await this.tokenService.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    // 2. Get user from database
    const user = await this.userService.findOne(payload.sub);
    
    // 3. Check status using the proper Enum (avoiding string magic)
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // 4. Attach token metadata to request for potential use in Logout
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    request.accessToken = token;

    // This return value becomes 'req.user' in your controllers
    return user;
  }
}