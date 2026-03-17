import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Lonxon MMO API')
    .setDescription('The core API documentation for Lonxon MMO project')
    .setVersion('1.0')
    // Cấu hình Bearer Auth để test các API cần Login
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // Tên tham chiếu để dùng trong @ApiBearerAuth('JWT-auth')
    )
    .addTag('auth', 'Authentication System')
    .addTag('users', 'User Profiles & Stats')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Giữ token khi F5 lại trang docs
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none', // Không tự động bung các endpoint ra
    },
    useGlobalPrefix: false,
  });
}