import { Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module';
import { RedisModule } from '../../shared/redis/redis.module';
import { UserController } from '../user/controllers/user.controller';
import { UserService } from '../user/services/user.service';
import { UserRepository } from '../user/repositories/user.repository';

@Module({
  imports: [
    
    RedisModule,
  ],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}