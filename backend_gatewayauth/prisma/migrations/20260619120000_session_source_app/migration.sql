-- source_app: aplikasi sumber (client_id) tempat sesi dibuat.
-- Nullable agar row sesi lama tetap valid; sesi baru selalu terisi saat login.
ALTER TABLE "gateway_auth"."sessions" ADD COLUMN "source_app" TEXT;
