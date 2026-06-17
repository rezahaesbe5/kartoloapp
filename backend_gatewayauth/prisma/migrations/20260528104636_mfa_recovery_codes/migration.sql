-- CreateTable
CREATE TABLE "gateway_auth"."mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_user_id_used_at_idx" ON "gateway_auth"."mfa_recovery_codes"("user_id", "used_at");

-- AddForeignKey
ALTER TABLE "gateway_auth"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "gateway_auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
