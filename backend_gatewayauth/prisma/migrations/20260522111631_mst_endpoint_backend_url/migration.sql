-- Kolom backend_url di mst_endpoint: bila terisi, gateway meneruskan request
-- ke base URL backend tujuan; bila null, endpoint dilayani route lokal.

-- AlterTable
ALTER TABLE "gateway_auth"."mst_endpoint" ADD COLUMN "backend_url" TEXT;
