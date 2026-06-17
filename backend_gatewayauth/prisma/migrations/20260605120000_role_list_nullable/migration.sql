-- role_list boleh NULL — produk boleh tidak punya batasan role
ALTER TABLE "gateway_auth"."mst_produk" ALTER COLUMN "role_list" DROP NOT NULL;