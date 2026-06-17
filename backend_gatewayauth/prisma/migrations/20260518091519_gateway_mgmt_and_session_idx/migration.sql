-- CreateTable
CREATE TABLE "gateway_auth"."cfg_client" (
    "client_id" TEXT NOT NULL,
    "client_key" TEXT NOT NULL,
    "client_description" TEXT NOT NULL,
    "ip_list" TEXT NOT NULL,
    "timestamp_flag" BOOLEAN NOT NULL DEFAULT true,
    "signature_flag" BOOLEAN NOT NULL DEFAULT true,
    "endpoint_flag" BOOLEAN NOT NULL DEFAULT true,
    "active_flag" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfg_client_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "gateway_auth"."mst_endpoint" (
    "id" SERIAL NOT NULL,
    "endpoint_url" TEXT NOT NULL,
    "endpoint_name" TEXT NOT NULL,
    "endpoint_description" TEXT NOT NULL,
    "endpoint_method" TEXT NOT NULL,
    "auth_flag" BOOLEAN NOT NULL DEFAULT true,
    "active_flag" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mst_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_auth"."map_client_endpoint" (
    "client_id" TEXT NOT NULL,
    "endpoint_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_client_endpoint_pkey" PRIMARY KEY ("client_id","endpoint_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mst_endpoint_endpoint_url_endpoint_method_key" ON "gateway_auth"."mst_endpoint"("endpoint_url", "endpoint_method");

-- CreateIndex
CREATE INDEX "map_client_endpoint_endpoint_id_idx" ON "gateway_auth"."map_client_endpoint"("endpoint_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_expires_at_idx" ON "gateway_auth"."sessions"("user_id", "revoked_at", "expires_at");

-- AddForeignKey
ALTER TABLE "gateway_auth"."map_client_endpoint" ADD CONSTRAINT "map_client_endpoint_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "gateway_auth"."cfg_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_auth"."map_client_endpoint" ADD CONSTRAINT "map_client_endpoint_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "gateway_auth"."mst_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
