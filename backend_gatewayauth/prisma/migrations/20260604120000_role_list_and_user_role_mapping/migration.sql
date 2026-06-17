-- Rename mst_produk.user_type_list -> role_list.
-- Catatan: nilai lama berisi kode user_type (mis. "1;2"); seed akan
-- meng-upsert ulang role_list ke daftar role_id yang benar.
ALTER TABLE "gateway_auth"."mst_produk" RENAME COLUMN "user_type_list" TO "role_list";

-- CreateTable map_user_role (many-to-many user <-> role)
CREATE TABLE "gateway_auth"."map_user_role" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_user_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "map_user_role_user_id_idx" ON "gateway_auth"."map_user_role"("user_id");
CREATE INDEX "map_user_role_role_id_idx" ON "gateway_auth"."map_user_role"("role_id");
CREATE UNIQUE INDEX "map_user_role_user_id_role_id_key" ON "gateway_auth"."map_user_role"("user_id", "role_id");

-- AddForeignKey
ALTER TABLE "gateway_auth"."map_user_role" ADD CONSTRAINT "map_user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "gateway_auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gateway_auth"."map_user_role" ADD CONSTRAINT "map_user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "gateway_auth"."mst_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: pindahkan role tunggal lama (users.role_id) ke map_user_role
-- sebelum kolomnya di-drop, supaya mapping existing tidak hilang.
INSERT INTO "gateway_auth"."map_user_role" ("id", "user_id", "role_id", "created_at")
SELECT gen_random_uuid(), "id", "role_id", CURRENT_TIMESTAMP
FROM "gateway_auth"."users"
WHERE "role_id" IS NOT NULL;

-- Drop kolom & index/constraint lama users.role_id
DROP INDEX IF EXISTS "gateway_auth"."users_role_id_idx";
ALTER TABLE "gateway_auth"."users" DROP CONSTRAINT IF EXISTS "users_role_id_fkey";
ALTER TABLE "gateway_auth"."users" DROP COLUMN "role_id";
