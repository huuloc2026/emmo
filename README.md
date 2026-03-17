# 1. Clone và cài dependencies
npm install

# 2. Copy environment variables
cp .env.example .env.development
cp .env.example .env.test

# 3. Start Docker services
npm run docker:up

# 4. Generate Prisma client
npm run prisma:generate

# 5. Run database migrations
npm run prisma:migrate

# 6. Seed database (optional)
npm run prisma:seed

# 7. Start development server
npm run start:dev


Auth endpoints (/api/v1/auth)
POST /register - Đăng ký user mới

POST /login - Đăng nhập

POST /refresh - Refresh token

POST /logout - Đăng xuất

POST /forgot-password - Quên mật khẩu

POST /reset-password - Reset mật khẩu

POST /change-password - Đổi mật khẩu (authenticated)

GET /verify-email - Xác thực email

GET /google - Google OAuth login

GET /google/callback - Google OAuth callback

User endpoints (/api/v1/users)
GET /profile - Lấy profile user hiện tại

GET / - Lấy danh sách users (admin)

GET /:id - Lấy user theo ID (admin)

POST / - Tạo user mới (admin)

PATCH /:id - Cập nhật user (admin)

DELETE /:id - Xóa user (admin)

🎯 Features Implemented
✅ Clean Architecture - Tách biệt Controllers, Services, Repositories
✅ Modular Structure - Auth, User, Config modules riêng biệt
✅ Type Safety - TypeScript strict mode + Zod validation
✅ Authentication - JWT, Google OAuth2, Refresh tokens
✅ Authorization - Roles & Permissions (RBAC)
✅ Database - Prisma ORM với PostgreSQL
✅ Caching - Redis integration
✅ Security - Helmet, CORS, Rate limiting
✅ Logging - Pino logger với request tracking
✅ Validation - Zod pipes với detailed errors
✅ Error Handling - Global exception filter
✅ Interceptors - Logging & Response transformation
✅ Configuration - Centralized config với validation
✅ Docker - PostgreSQL, Redis, PGAdmin, Redis Commander
✅ API Documentation - Swagger/OpenAPI
✅ Soft Delete - Implemented at Prisma level
✅ Token Management - JWT blacklist, refresh token rotation
✅ Login Attempts - Rate limiting với Redis
✅ Email Verification - Token-based verification
✅ Password Reset - Secure reset flow
✅ Health Check - Basic health endpoint