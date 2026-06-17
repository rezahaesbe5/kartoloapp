// E2E verifikasi Pub/Sub cache invalidation lintas-backend.
// Flow: gateway portal cache (miss→hit) → admin write produk → PUBLISH →
//       gateway SUBSCRIBE → invalidate portal cache.
// Jalankan: node scripts/verify-pubsub.mjs
import { execSync } from 'node:child_process';
import { loginSuperadmin, api } from './auth-helper.js';

const GW_PREFIX = 'kartolo:portal:';
const AD_PREFIX = 'kartolo:ad:';
let pass = 0, fail = 0;
const ok = (m) => { console.log(`  \x1b[32m✓\x1b[0m ${m}`); pass++; };
const no = (m) => { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redisKeys(pattern) {
  const out = execSync(
    `docker exec kartolo-redis redis-cli --scan --pattern '${pattern}'`,
    { encoding: 'utf8' },
  ).trim();
  return out ? out.split('\n').filter(Boolean) : [];
}

// Panggil endpoint gateway portal via auth-helper (signed GET, Bearer token).
async function gwGet(path, token) {
  return api('GET', path, null, token);
}

async function main() {
  console.log('== Login superadmin (gateway) ==');
  const { token } = await loginSuperadmin();
  ok('login berhasil, dapat access token');

  // ---- TEST 1: gateway portal cache miss → hit ----
  console.log('\n== TEST 1: gateway /portal/products cache miss → hit ==');
  // Bersihkan portal cache dulu.
  execSync(`docker exec kartolo-redis redis-cli --scan --pattern '${GW_PREFIX}*' | xargs -r docker exec kartolo-redis redis-cli del >/dev/null 2>&1 || true`);
  redisKeys(`${GW_PREFIX}*`).length === 0 ? ok('portal cache kosong (start bersih)') : no('portal cache tidak kosong');

  const p1 = await gwGet('v1/portal/products', token);
  p1.rc === '00' ? ok(`/portal/products call-1 sukses (${p1.data?.products?.length} produk)`) : no(`call-1 gagal rc=${p1.rc}`);
  await sleep(150);
  const afterMiss = redisKeys(`${GW_PREFIX}products:*`);
  afterMiss.length === 1 ? ok('cache portal:products TERBUAT setelah call-1') : no(`harusnya 1 key, ada ${afterMiss.length}`);

  const p2 = await gwGet('v1/portal/products', token);
  JSON.stringify(p1.data?.products) === JSON.stringify(p2.data?.products) ? ok('call-2 (cache HIT) data identik') : no('data call-2 beda');

  // ---- TEST 2: admin update produk → PUBLISH → gateway invalidate ----
  console.log('\n== TEST 2: admin write → Pub/Sub → gateway portal cache invalidated ==');
  const beforeWrite = redisKeys(`${GW_PREFIX}*`);
  beforeWrite.length >= 1 ? ok(`ada ${beforeWrite.length} portal cache key sebelum admin write`) : no('portal cache harusnya ada');

  // Buat produk baru via admin (memicu invalidateCache('produk') → publish).
  const uniq = `pubsub_${Date.now().toString(36)}`;
  const cr = await api('POST', 'v1/administration/produk/create', { nama_produk: `PubSub Test ${uniq}`, url_produk: uniq, active_flag: true }, token);
  cr.rc === '00' ? ok(`admin create produk sukses (id=${cr.data?.id})`) : no(`create gagal rc=${cr.rc} ${cr.message}`);
  const newId = cr.data?.id;

  // Beri waktu Pub/Sub propagate (biasanya < 50ms, kasih 500ms buffer).
  await sleep(500);
  const afterPublish = redisKeys(`${GW_PREFIX}*`);
  afterPublish.length === 0
    ? ok('gateway portal cache TERHAPUS via Pub/Sub (broadcast invalidation OK)')
    : no(`portal cache harusnya 0 setelah publish, ada ${afterPublish.length}: ${afterPublish.join(', ')}`);

  // ---- TEST 3: admin cache juga ter-invalidate (local) ----
  console.log('\n== TEST 3: admin local cache ikut invalidate ==');
  const adProdukList = redisKeys(`${AD_PREFIX}produk:list:*`);
  adProdukList.length === 0 ? ok('admin produk:list cache bersih (local invalidate)') : no(`ada ${adProdukList.length} admin list cache`);

  // ---- TEST 4: gateway re-fetch → data fresh (produk baru muncul) ----
  console.log('\n== TEST 4: gateway re-fetch tampilkan produk baru (tidak stale) ==');
  const p3 = await gwGet('v1/portal/products', token);
  const found = p3.data?.products?.some((x) => x.id === newId);
  found ? ok('produk baru MUNCUL di /portal/products (cache fresh, bukan stale)') : no('produk baru tidak muncul — cache stale!');

  // ---- TEST 5: verify cross-module — role write juga invalidate portal ----
  console.log('\n== TEST 5: admin role write → gateway portal invalidate ==');
  await gwGet('v1/portal/products', token); // warm cache lagi
  await sleep(150);
  redisKeys(`${GW_PREFIX}*`).length >= 1 ? ok('portal cache warm lagi') : no('gagal warm cache');
  const rc = await api('POST', 'v1/administration/role/create', { nama_role: `PubSubRole ${uniq}` }, token);
  rc.rc === '00' ? ok(`admin create role sukses (id=${rc.data?.id})`) : no(`role create gagal rc=${rc.rc}`);
  await sleep(500);
  redisKeys(`${GW_PREFIX}*`).length === 0 ? ok('portal cache ter-invalidate oleh role write (cross-module Pub/Sub)') : no('portal cache tidak ter-invalidate oleh role write');

  // ---- Cleanup ----
  console.log('\n== Cleanup ==');
  if (newId) await api('POST', 'v1/administration/produk/delete', { id: newId }, token);
  if (rc.data?.id) await api('POST', 'v1/administration/role/delete', { id: rc.data.id }, token);
  ok('cleanup produk & role test selesai');

  console.log(`\n========================================`);
  console.log(`  HASIL: ${pass} PASS, ${fail} FAIL`);
  console.log(`========================================`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
