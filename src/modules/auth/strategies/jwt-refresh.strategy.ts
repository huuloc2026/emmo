import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { TokenPayload } from '../interfaces/token-payload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private configService: ConfigService) {
    const refreshSecret = configService.get<string>('jwt.refreshSecret');
    
    if (!refreshSecret) {
      throw new Error('JWT Refresh Secret not found in configuration');
    }

    super({
      // 1. Ensure we are looking in the body for 'refreshToken'
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: refreshSecret,
      // 2. We need the request to extract the raw token for database/redis validation
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: TokenPayload) {
    const refreshToken = request.body?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing from request body');
    }

    // 3. We return the payload + the raw token
    // This will be accessible in your controller as 'req.user'
    return {
      ...payload,
      refreshToken,
    };
  }
}