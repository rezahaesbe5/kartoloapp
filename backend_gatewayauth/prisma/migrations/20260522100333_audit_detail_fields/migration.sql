-- Perkaya audit_logs: korelasi trace_id, asal app, dan isi request/response.
-- metadata -> user_data dibuat RENAME (tipe sama jsonb) supaya data lama tidak hilang.

-- RenameColumn
ALTER TABLE "gateway_auth"."audit_logs" RENAME COLUMN "metadata" TO "user_data";

-- AlterTable
ALTER TABLE "gateway_auth"."audit_logs" ADD COLUMN     "trace_id" TEXT;
ALTER TABLE "gateway_auth"."audit_logs" ADD COLUMN     "source_app" TEXT;
ALTER TABLE "gateway_auth"."audit_logs" ADD COLUMN     "method" TEXT;
ALTER TABLE "gateway_auth"."audit_logs" ADD COLUMN     "request_header" JSONB;
ALTER TABLE "gateway_auth"."audit_logs" ADD COLUMN     "request_body" JSONB;
ALTER TABLE "gateway_auth"."audit_logs" ADD COLUMN     "response_body" JSONB;

-- CreateIndex
CREATE INDEX "audit_logs_trace_id_idx" ON "gateway_auth"."audit_logs"("trace_id");
