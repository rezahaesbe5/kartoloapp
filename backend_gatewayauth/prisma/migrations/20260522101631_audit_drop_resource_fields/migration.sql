-- Hapus kolom resource_type & resource_id dari audit_logs.
-- Konteks resource (mis. user yang sesinya direvoke) tetap terlihat di
-- response_body / endpoint transaction log yang ter-korelasi via trace_id.

-- AlterTable
ALTER TABLE "gateway_auth"."audit_logs" DROP COLUMN "resource_type";
ALTER TABLE "gateway_auth"."audit_logs" DROP COLUMN "resource_id";
