-- AlterTable
ALTER TABLE "gateway_auth"."mst_produk" ADD COLUMN     "url_produk" TEXT;

-- AlterTable
ALTER TABLE "gateway_auth"."users" ADD COLUMN     "role_id" INTEGER;

-- CreateTable
CREATE TABLE "gateway_auth"."mst_role" (
    "id" SERIAL NOT NULL,
    "nama_role" TEXT NOT NULL,

    CONSTRAINT "mst_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_auth"."map_menu_produk" (
    "id" SERIAL NOT NULL,
    "menu_name" TEXT NOT NULL,
    "url_name" TEXT,
    "main_menu_id" INTEGER NOT NULL DEFAULT 0,
    "single_menu_flag" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "produk_id" INTEGER NOT NULL,
    "role_id_list" TEXT NOT NULL,
    "active_flag" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "map_menu_produk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mst_role_nama_role_key" ON "gateway_auth"."mst_role"("nama_role");

-- CreateIndex
CREATE INDEX "map_menu_produk_produk_id_idx" ON "gateway_auth"."map_menu_produk"("produk_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "gateway_auth"."users"("role_id");

-- AddForeignKey
ALTER TABLE "gateway_auth"."users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "gateway_auth"."mst_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_auth"."map_menu_produk" ADD CONSTRAINT "map_menu_produk_produk_id_fkey" FOREIGN KEY ("produk_id") REFERENCES "gateway_auth"."mst_produk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
