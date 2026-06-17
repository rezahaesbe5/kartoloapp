-- CreateEnum
CREATE TYPE "gateway_auth"."UserType" AS ENUM ('superadmin', 'admin', 'member');

-- CreateEnum
CREATE TYPE "gateway_auth"."UserStatus" AS ENUM ('active', 'inactive', 'pending');

-- CreateTable
CREATE TABLE "gateway_auth"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "user_type" "gateway_auth"."UserType" NOT NULL,
    "status" "gateway_auth"."UserStatus" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMP(3),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret_encrypted" TEXT,
    "last_login_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_auth"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "gateway_auth"."users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "gateway_auth"."users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "gateway_auth"."users"("status");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "gateway_auth"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "gateway_auth"."sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "gateway_auth"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "gateway_auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
