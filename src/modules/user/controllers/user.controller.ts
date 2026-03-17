import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query, 
  UseGuards,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserService } from '../services/user.service';
import { CreateUserSchema, UpdateUserSchema, UserFilterSchema, UserIdSchema } from '../dto/user.zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../generated/prisma';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'User created successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'User already exists' })
  async create(
    @Body(new ZodValidationPipe(CreateUserSchema)) createUserDto: any,
  ) {
    const user = await this.userService.create(createUserDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'User created successfully',
      data: user.profile,
    };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Get all users with filters' })
  async findAll(
    @Query(new ZodValidationPipe(UserFilterSchema)) filters: any,
  ) {
    const result = await this.userService.findAll(filters);
    return {
      statusCode: HttpStatus.OK,
      message: 'Users retrieved successfully',
      ...result,
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: any) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Profile retrieved successfully',
      data: user.profile,
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(
    @Param('id', new ZodValidationPipe(UserIdSchema)) params: any,
  ) {
    const user = await this.userService.findOne(params.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'User retrieved successfully',
      data: user.profile,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user' })
  async update(
    @Param('id', new ZodValidationPipe(UserIdSchema)) params: any,
    @Body(new ZodValidationPipe(UpdateUserSchema)) updateUserDto: any,
  ) {
    const user = await this.userService.update(params.id, updateUserDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'User updated successfully',
      data: user.profile,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete user (soft delete)' })
  async remove(
    @Param('id', new ZodValidationPipe(UserIdSchema)) params: any,
  ) {
    await this.userService.remove(params.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'User deleted successfully',
    };
  }
}