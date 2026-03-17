import { applyDecorators, UsePipes } from '@nestjs/common';

import { ZodSchema } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

export function Validate(schema: ZodSchema) {
  return applyDecorators(
    UsePipes(new ZodValidationPipe(schema)),
  );
}