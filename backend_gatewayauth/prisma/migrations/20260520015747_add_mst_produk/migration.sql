-- CreateTable
CREATE TABLE "gateway_auth"."mst_produk" (
    "id" SERIAL NOT NULL,
    "nama_produk" TEXT NOT NULL,
    "user_type_list" TEXT NOT NULL,
    "active_flag" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mst_produk_pkey" PRIMARY KEY ("id")
);
