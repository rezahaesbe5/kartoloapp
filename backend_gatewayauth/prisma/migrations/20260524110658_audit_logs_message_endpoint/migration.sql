-- AlterTable
ALTER TABLE "gateway_auth"."audit_logs" ADD COLUMN     "endpoint" TEXT,
ADD COLUMN     "message" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_endpoint_idx" ON "gateway_auth"."audit_logs"("endpoint");
