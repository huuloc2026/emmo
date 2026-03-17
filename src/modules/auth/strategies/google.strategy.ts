import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { AuthProvider } from '../../../generated/prisma'; 

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    // const clientID = configService.get<string>('google.clientId');
    // const clientSecret = configService.get<string>('google.clientSecret');
    // const callbackURL = configService.get<string>('google.callbackUrl');
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = configService.get<string>('GOOGLE_CALLBACK_URL');

    if (!clientID || !clientSecret) {
      throw new Error('Google OAuth credentials missing in configuration');
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { name, emails, photos, id } = profile;

      // 1. Safety check for emails (Google profiles usually have them, but better safe)
      if (!emails || emails.length === 0) {
        return done(new InternalServerErrorException('No email found in Google profile'), false);
      }

      // 2. Format the user data for your AuthService
      const oauthUser = {
        email: emails[0].value,
        fullName: `${name?.givenName || ''} ${name?.familyName || ''}`.trim() || 'Google User',
        avatar: photos?.[0]?.value,
        providerId: id,
        emailVerified: emails[0].verified === true || true,
      };

      // 3. Use the generated Enum for 'GOOGLE'
      const user = await this.authService.validateOrCreateOAuthUser(
        oauthUser,
        AuthProvider.GOOGLE,
      );

      done(null, user);
    } catch (err) {
      done(err, false);
    }
  }
}