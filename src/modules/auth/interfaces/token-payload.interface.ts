export interface TokenPayload {
  sub: string;        // user id
  email: string;
  role: string;
  jti?: string;       // JWT ID for token tracking
  iat?: number;       // issued at
  exp?: number;       // expires at
}

export interface RefreshTokenPayload extends TokenPayload {
  tokenId: string;    // refresh token id
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}