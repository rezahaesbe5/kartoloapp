-- AlterTable
ALTER TABLE "gateway_auth"."users" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "gateway_auth"."users"("username");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "gateway_auth"."users"("username");
