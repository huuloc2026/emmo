import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  RegisterSchema,
  LoginSchema,
  
  
} from '../dto/auth.zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { IsPublic } from '@/common/decorators/public.decorator';

@ApiTags('auth') // Nhóm các endpoint vào group 'auth' trên Swagger
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @IsPublic()
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công.' })
  @ApiResponse({ status: 409, description: 'Email đã tồn tại.' })
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  async register(@Body() registerDto: RegisterDto, @Req() req: FastifyRequest) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.register(registerDto, userAgent, ip);
  }

  @Post('login')
  @IsPublic()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập hệ thống' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về bộ tokens.' })
  @ApiResponse({ status: 401, description: 'Sai thông tin hoặc tài khoản bị khóa.' })
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() loginDto: LoginDto, @Req() req: FastifyRequest) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(loginDto, userAgent, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token bằng Refresh Token' })
  @ApiHeader({
    name: 'x-refresh-token',
    description: 'Refresh token nhận được từ lúc login',
    required: true,
  })
  async refresh(@Req() req: FastifyRequest) {
    const refreshToken = req.headers['x-refresh-token'] as string;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.refreshTokens(refreshToken, userAgent, ip);
  }

  @Post('logout')
  @ApiBearerAuth('JWT-auth') // Yêu cầu JWT token trên Swagger
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất và vô hiệu hóa tokens' })
  async logout(@Req() req: FastifyRequest) {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.split(' ')[1];
    const refreshToken = req.headers['x-refresh-token'] as string;
    
    if (accessToken && refreshToken) {
      await this.authService.logout(accessToken, refreshToken);
    }
    return { success: true, message: 'Logged out successfully' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu gửi link reset mật khẩu qua email' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu mới bằng token từ email' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('change-password')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Thay đổi mật khẩu khi đang đăng nhập' })
  async changePassword(
    @Req() req: any, // req.user sẽ được gán bởi JwtAuthGuard
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    // Lưu ý: Endpoint này cần có JwtAuthGuard để lấy userId
    return this.authService.changePassword(req.user.id, changePasswordDto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực email bằng token' })
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }
}