// E2E verifikasi Redis cache layer di backend_administration.
// Menguji: cache miss→hit, invalidation on create/update/delete, detail endpoint.
// Jalankan: node scripts/verify-cache.mjs
import { execSync } from 'node:child_process';
import { loginSuperadmin, api } from './auth-helper.js';

const PREFIX = 'kartolo:ad:';
let pass = 0, fail = 0;
const ok = (m) => { console.log(`  \x1b[32m✓\x1b[0m ${m}`); pass++; };
const no = (m) => { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); fail++; };

// Hitung jumlah key Redis match pattern (via redis-cli di container).
function redisKeys(pattern) {
  const out = execSync(
    `docker exec kartolo-redis redis-cli --scan --pattern '${pattern}'`,
    { encoding: 'utf8' },
  ).trim();
  return out ? out.split('\n').filter(Boolean) : [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('== Login superadmin ==');
  const { token } = await loginSuperadmin();
  ok('login berhasil');

  // ---- TEST 1: produk list — cache MISS lalu HIT ----
  console.log('\n== TEST 1: produk/list cache miss → hit ==');
  execSync(`docker exec kartolo-redis redis-cli --scan --pattern '${PREFIX}produk:list:*' | xargs -r docker exec kartolo-redis redis-cli del >/dev/null 2>&1 || true`);
  const before = redisKeys(`${PREFIX}produk:list:*`);
  before.length === 0 ? ok('cache produk:list kosong (start bersih)') : no(`harusnya 0 key, ada ${before.length}`);

  const r1 = await api('POST', 'v1/administration/produk/list', { page: 1, page_size: 5 }, token);
  r1.rc === '00' ? ok('produk/list call-1 sukses (DB query)') : no(`call-1 gagal rc=${r1.rc}`);
  await sleep(100);
  const afterMiss = redisKeys(`${PREFIX}produk:list:*`);
  afterMiss.length === 1 ? ok('cache key TERBUAT setelah call-1 (1 key)') : no(`harusnya 1 key, ada ${afterMiss.length}`);

  const r2 = await api('POST', 'v1/administration/produk/list', { page: 1, page_size: 5 }, token);
  // Bandingkan items (trace_id dalam pagination berbeda tiap request).
  JSON.stringify(r1.data?.items) === JSON.stringify(r2.data?.items) ? ok('call-2 (cache HIT) items identik dgn call-1') : no(`items call-2 beda: ${JSON.stringify(r2.data?.items?.slice(0,1))}`);

  // ---- TEST 2: create produk → invalidate list ----
  console.log('\n== TEST 2: produk/create → invalidate list ==');
  const keysBeforeCreate = redisKeys(`${PREFIX}produk:list:*`);
  keysBeforeCreate.length >= 1 ? ok(`ada ${keysBeforeCreate.length} cache list sebelum create`) : no('cache list harusnya ada');
  const uniq = `verifcache_${Date.now().toString(36)}`;
  const cr = await api('POST', 'v1/administration/produk/create', { nama_produk: `VerifCache ${uniq}`, url_produk: uniq, active_flag: true }, token);
  cr.rc === '00' ? ok(`create produk sukses (id=${cr.data?.id})`) : no(`create gagal rc=${cr.rc} ${cr.message}`);
  const newId = cr.data?.id;
  await sleep(150);
  const afterCreate = redisKeys(`${PREFIX}produk:list:*`);
  afterCreate.length === 0 ? ok('cache produk:list TERHAPUS setelah create (invalidation OK)') : no(`harusnya 0, ada ${afterCreate.length}`);

  // ---- TEST 3: detail endpoint + item cache ----
  console.log('\n== TEST 3: produk/detail → item cache ==');
  const d1 = await api('POST', 'v1/administration/produk/detail', { id: newId }, token);
  d1.rc === '00' && d1.data?.id === newId ? ok('produk/detail sukses (endpoint baru)') : no(`detail gagal rc=${d1.rc}`);
  await sleep(100);
  const itemKeys = redisKeys(`${PREFIX}produk:item:${newId}`);
  itemKeys.length === 1 ? ok('cache produk:item TERBUAT setelah detail') : no(`harusnya 1 item key, ada ${itemKeys.length}`);

  // ---- TEST 4: update → invalidate list + item ----
  console.log('\n== TEST 4: produk/update → invalidate list + item ==');
  await api('POST', 'v1/administration/produk/list', { page: 1, page_size: 5 }, token); // warm list
  await sleep(100);
  const up = await api('POST', 'v1/administration/produk/update', { id: newId, nama_produk: `VerifCache ${uniq} EDIT`, url_produk: uniq, active_flag: true }, token);
  up.rc === '00' ? ok('update produk sukses') : no(`update gagal rc=${up.rc} ${up.message}`);
  await sleep(150);
  const listAfterUpdate = redisKeys(`${PREFIX}produk:list:*`);
  const itemAfterUpdate = redisKeys(`${PREFIX}produk:item:${newId}`);
  listAfterUpdate.length === 0 ? ok('cache list TERHAPUS setelah update') : no(`list harusnya 0, ada ${listAfterUpdate.length}`);
  itemAfterUpdate.length === 0 ? ok('cache item TERHAPUS setelah update') : no(`item harusnya 0, ada ${itemAfterUpdate.length}`);

  // detail lagi → data ter-update (bukan stale). Cek nama_produk terbaru.
  const d2 = await api('POST', 'v1/administration/produk/detail', { id: newId }, token);
  d2.data?.nama_produk?.endsWith('EDIT') ? ok('detail setelah update tampilkan data BARU (tidak stale)') : no(`stale: nama_produk=${d2.data?.nama_produk}`);

  // ---- TEST 5: delete → invalidate ----
  console.log('\n== TEST 5: produk/delete → invalidate ==');
  const del = await api('POST', 'v1/administration/produk/delete', { id: newId }, token);
  del.rc === '00' ? ok('delete produk sukses (cleanup)') : no(`delete gagal rc=${del.rc} ${del.message}`);
  await sleep(150);
  const itemAfterDelete = redisKeys(`${PREFIX}produk:item:${newId}`);
  itemAfterDelete.length === 0 ? ok('cache item bersih setelah delete') : no(`item harusnya 0, ada ${itemAfterDelete.length}`);

  // ---- TEST 6: role & user list juga ter-cache ----
  console.log('\n== TEST 6: role/list & user/list ter-cache ==');
  await api('POST', 'v1/administration/role/list', { page: 1, page_size: 5 }, token);
  await api('POST', 'v1/administration/user/list', { page: 1, page_size: 5, user_type: 'admin' }, token);
  await sleep(150);
  redisKeys(`${PREFIX}role:list:*`).length >= 1 ? ok('role:list ter-cache') : no('role:list tidak ter-cache');
  redisKeys(`${PREFIX}user:list:*`).length >= 1 ? ok('user:list ter-cache') : no('user:list tidak ter-cache');

  console.log(`\n========================================`);
  console.log(`  HASIL: ${pass} PASS, ${fail} FAIL`);
  console.log(`========================================`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
