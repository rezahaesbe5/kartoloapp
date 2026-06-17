import 'dotenv/config';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FRONTEND_CLIENT_ID = 'kartolo-web-frontend';
const ADMIN_BACKEND_URL = process.env.SEED_ADMIN_BACKEND_URL ?? 'http://localhost:3001';

// Daftar endpoint yang sudah ada di backend saat ini.
// Sumber: backend_gatewayauth/reza/modules/auth/auth.controller.ts
// Format endpoint_url: tanpa prefix "/api/" (strip dari req.url saat lookup).
const FRONTEND_ENDPOINTS: Array<{
  endpointUrl: string;
  endpointMethod: string;
  endpointName: string;
  endpointDescription: string;
  authFlag: boolean;
  // Bila diisi: gateway meneruskan request ke base URL ini (endpoint backend lain).
  backendUrl?: string;
}> = [
  {
    endpointUrl: 'v1/auth/captcha',
    endpointMethod: 'GET',
    endpointName: 'Auth: Issue Captcha',
    endpointDescription: 'Generate captcha SVG untuk login form',
    authFlag: false,
  },
  {
    endpointUrl: 'v1/auth/login',
    endpointMethod: 'POST',
    endpointName: 'Auth: Login',
    endpointDescription: 'Login dengan email + password + captcha',
    authFlag: false,
  },
  {
    endpointUrl: 'v1/auth/me',
    endpointMethod: 'GET',
    endpointName: 'Auth: Current User',
    endpointDescription: 'Ambil profil user dari session token',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/logout',
    endpointMethod: 'POST',
    endpointName: 'Auth: Logout',
    endpointDescription: 'Revoke session saat ini',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/admin/sessions/:userId/revoke',
    endpointMethod: 'POST',
    endpointName: 'Admin: Revoke User Sessions',
    endpointDescription: 'Paksa logout semua sesi user (admin/superadmin only)',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/portal/products',
    endpointMethod: 'GET',
    endpointName: 'Portal: List Produk',
    endpointDescription: 'Daftar produk yang bisa diakses user (filter by user_type)',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/portal/menus',
    endpointMethod: 'GET',
    endpointName: 'Portal: List Menu Produk',
    endpointDescription: 'Daftar menu navigasi sebuah produk sesuai role user',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/profile',
    endpointMethod: 'GET',
    endpointName: 'Profile: Get Detail',
    endpointDescription: 'Ambil detail profil user yang sedang login',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/profile',
    endpointMethod: 'PATCH',
    endpointName: 'Profile: Update',
    endpointDescription: 'Edit email & nama lengkap user yang sedang login',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/change-password',
    endpointMethod: 'POST',
    endpointName: 'Profile: Change Password',
    endpointDescription: 'Ganti password user yang sedang login',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/sessions',
    endpointMethod: 'GET',
    endpointName: 'Sessions: List Mine',
    endpointDescription: 'List session aktif & riwayat login user yang sedang login',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/mfa/status',
    endpointMethod: 'GET',
    endpointName: 'MFA: Status',
    endpointDescription: 'Cek status MFA user yang sedang login (enabled + enrolled_at)',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/mfa/enroll/begin',
    endpointMethod: 'POST',
    endpointName: 'MFA: Begin Enrollment',
    endpointDescription: 'Generate TOTP secret + otpauth URL untuk scan QR',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/mfa/enroll/confirm',
    endpointMethod: 'POST',
    endpointName: 'MFA: Confirm Enrollment',
    endpointDescription: 'Verifikasi kode 6-digit & commit MFA aktif',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/mfa/disable',
    endpointMethod: 'POST',
    endpointName: 'MFA: Disable',
    endpointDescription: 'Nonaktifkan MFA setelah verifikasi kode TOTP terakhir',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/mfa/verify',
    endpointMethod: 'POST',
    endpointName: 'MFA: Verify Login Challenge',
    endpointDescription:
      'Tukar mfa_token + kode TOTP atau recovery_code dengan session penuh (public, signed)',
    authFlag: false,
  },
  {
    endpointUrl: 'v1/auth/mfa/recovery-codes/summary',
    endpointMethod: 'GET',
    endpointName: 'MFA: Recovery Codes Summary',
    endpointDescription: 'Ringkasan recovery codes user (remaining/total/generated_at)',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/auth/mfa/recovery-codes/regenerate',
    endpointMethod: 'POST',
    endpointName: 'MFA: Regenerate Recovery Codes',
    endpointDescription:
      'Replace batch recovery codes (butuh konfirmasi TOTP). Sekali tampil di response.',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/logs/client',
    endpointMethod: 'POST',
    endpointName: 'Logs: Ingest Client',
    endpointDescription: 'Terima batch log dari frontend (tanpa auth, tetap signed)',
    authFlag: false,
  },
  {
    endpointUrl: 'v1/logs/search',
    endpointMethod: 'POST',
    endpointName: 'Logs: Search',
    endpointDescription:
      'Cari log via Loki dgn filter Navicat-like (body JSON) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/logs/ws-ticket',
    endpointMethod: 'POST',
    endpointName: 'Logs: Issue WebSocket Ticket',
    endpointDescription:
      'Terbitkan ticket short-lived (Redis) untuk handshake WS live tail — admin only',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/logs/loki-link',
    endpointMethod: 'POST',
    endpointName: 'Logs: Trigger Loki Link',
    endpointDescription: 'Hardlink file log tanggal tertentu ke logloki/ — superadmin only',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/logs/sources',
    endpointMethod: 'GET',
    endpointName: 'Logs: List Sources',
    endpointDescription:
      'Daftar source_app + tanggal log file yang tersedia — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/logs/access',
    endpointMethod: 'POST',
    endpointName: 'Logs: Access (Link)',
    endpointDescription:
      'Hardlink 1 file log (source_app + date) ke logloki/ — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/logs/access/close',
    endpointMethod: 'POST',
    endpointName: 'Logs: Access Close (Unlink)',
    endpointDescription:
      'Unlink file dari logloki/ — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/logs/access/close-all',
    endpointMethod: 'POST',
    endpointName: 'Logs: Access Close All (Wipe)',
    endpointDescription:
      'Unlink SEMUA file di logloki/ — dipakai saat modal Akses Log File ditutup; diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/logs/audit',
    endpointMethod: 'GET',
    endpointName: 'Logs: Audit Search',
    endpointDescription: 'Cari audit log aksi sensitif dari database — admin only',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/logs/health',
    endpointMethod: 'GET',
    endpointName: 'Logs: Pipeline Health',
    endpointDescription: 'Status pipeline log (konektivitas Loki) — admin only',
    authFlag: true,
  },
  {
    endpointUrl: 'v1/administration/audit/list',
    endpointMethod: 'POST',
    endpointName: 'Administration: List Audit Log',
    endpointDescription:
      'List data audit log (paging/search/filter, body JSON) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/audit/detail',
    endpointMethod: 'POST',
    endpointName: 'Administration: Detail Audit Log',
    endpointDescription:
      'Detail 1 baris audit log (14 kolom, by id) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/role/list',
    endpointMethod: 'POST',
    endpointName: 'Administration: List Roles',
    endpointDescription:
      'List data user role (paging/search, body JSON) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/role/detail',
    endpointMethod: 'POST',
    endpointName: 'Administration: Get Role Detail',
    endpointDescription: 'Ambil satu role by id (cache-aside) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/role/create',
    endpointMethod: 'POST',
    endpointName: 'Administration: Create Role',
    endpointDescription: 'Buat role baru — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/role/update',
    endpointMethod: 'POST',
    endpointName: 'Administration: Update Role',
    endpointDescription: 'Edit role by id — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/role/delete',
    endpointMethod: 'POST',
    endpointName: 'Administration: Delete Role',
    endpointDescription: 'Hapus role by id — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/produk/list',
    endpointMethod: 'POST',
    endpointName: 'Administration: List Produk',
    endpointDescription:
      'List data produk (paging/search/sort, body JSON) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/produk/detail',
    endpointMethod: 'POST',
    endpointName: 'Administration: Get Produk Detail',
    endpointDescription: 'Ambil satu produk by id (cache-aside) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/produk/create',
    endpointMethod: 'POST',
    endpointName: 'Administration: Create Produk',
    endpointDescription:
      'Buat produk baru (validasi url_produk unik) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/produk/update',
    endpointMethod: 'POST',
    endpointName: 'Administration: Update Produk',
    endpointDescription:
      'Edit produk by id (validasi url_produk unik) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/produk/delete',
    endpointMethod: 'POST',
    endpointName: 'Administration: Delete Produk',
    endpointDescription:
      'Hapus produk by id (cek tidak dipakai menu) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/produk/set-role-mappings',
    endpointMethod: 'POST',
    endpointName: 'Administration: Set Produk Role Mappings',
    endpointDescription:
      'Replace-all mapping role produk (id, role_ids) → mst_produk.role_list — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/list',
    endpointMethod: 'POST',
    endpointName: 'Administration: List Users',
    endpointDescription:
      'List data user (paging/search/sort, body JSON) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/detail',
    endpointMethod: 'POST',
    endpointName: 'Administration: Get User Detail',
    endpointDescription: 'Ambil satu user by id (cache-aside) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/create',
    endpointMethod: 'POST',
    endpointName: 'Administration: Create User',
    endpointDescription: 'Buat user admin baru — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/update',
    endpointMethod: 'POST',
    endpointName: 'Administration: Update User',
    endpointDescription: 'Edit user by id — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/delete',
    endpointMethod: 'POST',
    endpointName: 'Administration: Delete User',
    endpointDescription: 'Hapus user by id — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/reset-password',
    endpointMethod: 'POST',
    endpointName: 'Administration: Reset User Password',
    endpointDescription:
      'Reset password user (status active) → password sementara + force_change_password — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/update-status',
    endpointMethod: 'POST',
    endpointName: 'Administration: Update User Status',
    endpointDescription:
      'Ubah status user (active/inactive/blocked) + reset kunci login — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/reset-block',
    endpointMethod: 'POST',
    endpointName: 'Administration: Reset User Block',
    endpointDescription:
      'Lepas blokir sementara user (reset failed attempts & locked_until) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/disable-mfa',
    endpointMethod: 'POST',
    endpointName: 'Administration: Disable User MFA',
    endpointDescription:
      'Nonaktifkan MFA user (admin override): clear secret/enrolled_at/flag + hapus recovery codes — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/products-with-roles',
    endpointMethod: 'POST',
    endpointName: 'Administration: List Products With Roles',
    endpointDescription:
      'Daftar produk aktif + role di role_list (untuk modal Mapping Role User) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/role-mappings',
    endpointMethod: 'POST',
    endpointName: 'Administration: List User Role Mappings',
    endpointDescription:
      'Daftar role_id yang dimapping ke user (prefill modal) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/administration/user/set-role-mappings',
    endpointMethod: 'POST',
    endpointName: 'Administration: Set User Role Mappings',
    endpointDescription:
      'Replace-all mapping role user (user_id, role_ids) — diteruskan ke backend_administration',
    authFlag: true,
    backendUrl: ADMIN_BACKEND_URL,
  },
  {
    endpointUrl: 'v1/portal/roles',
    endpointMethod: 'GET',
    endpointName: 'Portal: List Roles For Product',
    endpointDescription:
      'Daftar role yang bisa dipilih user saat masuk produk (role picker) — irisan role user dgn role_list produk',
    authFlag: true,
  },
];

// Role awal mst_role.
const ROLES: string[] = ['Admin General'];

// Produk awal mst_produk. role_list: daftar NAMA role yang boleh akses produk
// (di-resolve ke role_id ";"-separated saat seed). superadmin bypass (akses semua).
// url_produk: segmen URL produk, dipakai untuk routing side menu.
const PRODUCTS: Array<{ namaProduk: string; roleNames: string[]; urlProduk: string }> = [
  { namaProduk: 'Administration', roleNames: ['Admin General'], urlProduk: 'admin' },
];

async function seedSuperadmin(): Promise<void> {
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@kartolo.local';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'Superadmin#2026';
  const fullName = process.env.SEED_SUPERADMIN_NAME ?? 'Super Admin';

  // username = local-part email (mis. superadmin@kartolo.local → superadmin).
  const username = email.toLowerCase().split('@')[0] ?? email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    if (!existing.username) {
      await prisma.user.update({ where: { id: existing.id }, data: { username } });
      console.log(`✓ Superadmin sudah ada (${email}). Username di-backfill: ${username}`);
    } else {
      console.log(`✓ Superadmin sudah ada (${email}). Skip.`);
    }
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username,
      passwordHash,
      fullName,
      userType: 'superadmin',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
  });

  console.log('✅ Superadmin berhasil dibuat:');
  console.log(`   id       : ${user.id}`);
  console.log(`   email    : ${user.email}`);
  console.log(`   password : ${password}`);
  console.log('   ⚠️  GANTI password ini setelah login pertama.');
}

async function seedFrontendClient(): Promise<string | null> {
  // Idempotent: kalau client sudah ada, jangan regenerate client_key (akan invalidate FE config).
  const existing = await prisma.cfgClient.findUnique({
    where: { clientId: FRONTEND_CLIENT_ID },
  });
  if (existing) {
    console.log(`✓ Client "${FRONTEND_CLIENT_ID}" sudah ada. Skip generate key.`);
    return null;
  }

  const clientKey = randomBytes(32).toString('base64');
  await prisma.cfgClient.create({
    data: {
      clientId: FRONTEND_CLIENT_ID,
      clientKey,
      clientDescription: 'Kartolo SuperApps Web Frontend (Vite/React)',
      ipList: '*',
      timestampFlag: true,
      signatureFlag: true,
      endpointFlag: true,
      activeFlag: true,
    },
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`✅ Client baru dibuat: ${FRONTEND_CLIENT_ID}`);
  console.log('   Copy 2 baris berikut ke frontend_kartoloapps/.env :');
  console.log('');
  console.log(`     VITE_CLIENT_ID=${FRONTEND_CLIENT_ID}`);
  console.log(`     VITE_CLIENT_KEY=${clientKey}`);
  console.log('');
  console.log('   ⚠️  client_key ini hanya ditampilkan SEKARANG. Simpan baik-baik.');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  return clientKey;
}

// Hapus row legacy yang tidak lagi dipakai (mis. v1/logs/search GET dipindah jadi POST,
// /logs/stream SSE diganti WS). Idempoten — silent kalau tidak ada.
const LEGACY_ENDPOINTS: Array<{ url: string; method: string }> = [
  { url: 'v1/logs/search', method: 'GET' },
  { url: 'v1/logs/stream', method: 'GET' },
];

async function pruneLegacyEndpoints(): Promise<void> {
  for (const e of LEGACY_ENDPOINTS) {
    const ep = await prisma.mstEndpoint.findUnique({
      where: { endpointUrl_endpointMethod: { endpointUrl: e.url, endpointMethod: e.method } },
    });
    if (!ep) continue;
    await prisma.mapClientEndpoint.deleteMany({ where: { endpointId: ep.id } });
    await prisma.mstEndpoint.delete({ where: { id: ep.id } });
    console.log(`✓ Endpoint legacy dihapus: ${e.method} ${e.url}`);
  }
}

async function seedEndpoints(): Promise<void> {
  for (const ep of FRONTEND_ENDPOINTS) {
    await prisma.mstEndpoint.upsert({
      where: {
        endpointUrl_endpointMethod: {
          endpointUrl: ep.endpointUrl,
          endpointMethod: ep.endpointMethod,
        },
      },
      update: {
        endpointName: ep.endpointName,
        endpointDescription: ep.endpointDescription,
        authFlag: ep.authFlag,
        backendUrl: ep.backendUrl ?? null,
        activeFlag: true,
      },
      create: {
        endpointUrl: ep.endpointUrl,
        endpointMethod: ep.endpointMethod,
        endpointName: ep.endpointName,
        endpointDescription: ep.endpointDescription,
        authFlag: ep.authFlag,
        backendUrl: ep.backendUrl ?? null,
        activeFlag: true,
      },
    });
  }
  console.log(`✓ ${FRONTEND_ENDPOINTS.length} endpoint ter-upsert ke mst_endpoint.`);
}

async function seedClientEndpointMap(): Promise<void> {
  const clientExists = await prisma.cfgClient.findUnique({
    where: { clientId: FRONTEND_CLIENT_ID },
  });
  if (!clientExists) {
    console.log(`× Client "${FRONTEND_CLIENT_ID}" tidak ada — skip mapping.`);
    return;
  }
  const endpoints = await prisma.mstEndpoint.findMany({
    where: {
      OR: FRONTEND_ENDPOINTS.map((ep) => ({
        endpointUrl: ep.endpointUrl,
        endpointMethod: ep.endpointMethod,
      })),
    },
    select: { id: true, endpointUrl: true, endpointMethod: true },
  });

  let created = 0;
  for (const ep of endpoints) {
    const res = await prisma.mapClientEndpoint.upsert({
      where: {
        clientId_endpointId: {
          clientId: FRONTEND_CLIENT_ID,
          endpointId: ep.id,
        },
      },
      update: {},
      create: {
        clientId: FRONTEND_CLIENT_ID,
        endpointId: ep.id,
      },
    });
    if (res) created++;
  }
  console.log(`✓ ${created} mapping client↔endpoint ter-upsert untuk ${FRONTEND_CLIENT_ID}.`);
}

async function seedRoles(): Promise<void> {
  for (const namaRole of ROLES) {
    await prisma.mstRole.upsert({
      where: { namaRole },
      update: {},
      create: { namaRole },
    });
  }
  console.log(`✓ ${ROLES.length} role ter-upsert ke mst_role.`);
}

// Resolve daftar nama role → string role_id ";"-separated (mis. "1;3").
// Role yang tidak ditemukan dilewati (warning).
async function resolveRoleList(roleNames: string[]): Promise<string> {
  const ids: number[] = [];
  for (const name of roleNames) {
    const role = await prisma.mstRole.findFirst({ where: { namaRole: name } });
    if (role) ids.push(role.id);
    else console.log(`  × role "${name}" tidak ditemukan — dilewati di role_list.`);
  }
  return ids.join(';');
}

async function seedProducts(): Promise<void> {
  // Idempotent: mst_produk tidak punya unique constraint pada nama_produk,
  // jadi cek manual by nama sebelum create supaya seed bisa di-run berulang.
  let created = 0;
  for (const p of PRODUCTS) {
    const roleList = await resolveRoleList(p.roleNames);
    const existing = await prisma.mstProduk.findFirst({
      where: { namaProduk: p.namaProduk },
    });
    if (existing) {
      // Backfill url_produk & role_list pada row lama.
      if (existing.urlProduk !== p.urlProduk || existing.roleList !== roleList) {
        await prisma.mstProduk.update({
          where: { id: existing.id },
          data: { urlProduk: p.urlProduk, roleList },
        });
        console.log(`✓ Produk "${p.namaProduk}" di-update (url_produk=${p.urlProduk}, role_list=${roleList}).`);
      }
      continue;
    }
    await prisma.mstProduk.create({
      data: {
        namaProduk: p.namaProduk,
        roleList,
        urlProduk: p.urlProduk,
        activeFlag: true,
      },
    });
    created++;
  }
  console.log(`✓ ${created} produk baru ter-insert ke mst_produk (${PRODUCTS.length} total).`);
}

async function seedMenus(): Promise<void> {
  const produk = await prisma.mstProduk.findFirst({
    where: { namaProduk: 'Administration' },
  });
  const role = await prisma.mstRole.findFirst({
    where: { namaRole: 'Admin General' },
  });
  if (!produk || !role) {
    console.log('× Produk Administration / role Admin General belum ada — skip seed menu.');
    return;
  }
  const produkId = produk.id;
  const roleIdList = String(role.id);

  // Idempotent: cek by (menu_name, produk_id) sebelum create.
  async function upsertMenu(input: {
    menuName: string;
    urlName: string | null;
    mainMenuId: number;
    singleMenuFlag: boolean;
    icon: string | null;
  }): Promise<number> {
    const existing = await prisma.mapMenuProduk.findFirst({
      where: { menuName: input.menuName, produkId },
    });
    if (existing) return existing.id;
    const row = await prisma.mapMenuProduk.create({
      data: {
        menuName: input.menuName,
        urlName: input.urlName,
        mainMenuId: input.mainMenuId,
        singleMenuFlag: input.singleMenuFlag,
        icon: input.icon,
        produkId,
        roleIdList,
        activeFlag: true,
      },
    });
    return row.id;
  }

  await upsertMenu({
    menuName: 'Beranda',
    urlName: 'beranda',
    mainMenuId: 0,
    singleMenuFlag: true,
    icon: 'fas fa-home',
  });
  const historyId = await upsertMenu({
    menuName: 'History',
    urlName: null,
    mainMenuId: 0,
    singleMenuFlag: false,
    icon: 'fas fa-clipboard-list',
  });
  await upsertMenu({
    menuName: 'Audit Log',
    urlName: 'auditlog',
    mainMenuId: historyId,
    singleMenuFlag: false,
    icon: null,
  });

  const iamId = await upsertMenu({
    menuName: 'IAM',
    urlName: null,
    mainMenuId: 0,
    singleMenuFlag: false,
    icon: 'fas fa-user-shield',
  });
  await upsertMenu({
    menuName: 'Role User',
    urlName: 'role',
    mainMenuId: iamId,
    singleMenuFlag: false,
    icon: null,
  });
  await upsertMenu({
    menuName: 'User Admin',
    urlName: 'useradmin',
    mainMenuId: iamId,
    singleMenuFlag: false,
    icon: null,
  });
  await upsertMenu({
    menuName: 'User Member',
    urlName: 'usermember',
    mainMenuId: iamId,
    singleMenuFlag: false,
    icon: null,
  });
  await upsertMenu({
    menuName: 'Produk',
    urlName: 'produk',
    mainMenuId: iamId,
    singleMenuFlag: false,
    icon: null,
  });

  console.log('✓ Menu Administration ter-seed (Beranda, History, Audit Log, IAM, Role User, User Admin, User Member, Produk).');
}

async function main() {
  await seedSuperadmin();
  await seedRoles();
  await seedFrontendClient();
  await pruneLegacyEndpoints();
  await seedEndpoints();
  await seedClientEndpointMap();
  await seedProducts();
  await seedMenus();
}

main()
  .catch((err) => {
    console.error('Seed gagal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
