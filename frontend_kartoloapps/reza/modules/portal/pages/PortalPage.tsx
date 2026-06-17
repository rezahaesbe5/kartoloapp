import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldCheck, Clock, Loader2, Settings, ArrowRight, LayoutGrid, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useProductRoleStore } from '@/shared/stores/product-role-store';
import { setAccessToken } from '@/shared/lib/api-client';
import { useSession } from '@/shared/hooks/useSession';
import { logout } from '@modules/auth/api/auth-api';
import { getProducts, getProductRoles, type PortalProduct } from '@modules/portal/api/portal-api';
import { AppHeader } from '@/shared/components/layout/AppHeader';
import { Modal } from '@/shared/components/Modal';
import { ProductRoleSelect } from '@/shared/components/layout/ProductRoleSelect';

// Metadata presentasi per produk (icon + deskripsi kartu). Route produk
// diambil dari mst_produk.url_produk (data-driven), bukan dari sini. Produk
// tanpa entry meta tetap tampil dengan icon & deskripsi default.
interface ProductMeta {
  icon: typeof Settings;
  description: string;
}

const PRODUCT_META: Record<string, ProductMeta> = {
  administration: {
    icon: Settings,
    description: 'Kelola user, client gateway, dan endpoint registry.',
  },
};

function formatTime(iso?: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function PortalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { me } = useSession();

  // Role picker modal state
  const [selectedProductForRole, setSelectedProductForRole] = useState<PortalProduct | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const setSelectedRole = useProductRoleStore((s) => s.setSelectedRole);
  const clearSelectedRole = useProductRoleStore((s) => s.clearSelectedRole);
  const isSuperadmin = user?.user_type === 'superadmin';

  // Bersihkan role saat component mount (cleanup dari produk sebelumnya).
  // CATATAN: clearSelectedRole() dipanggil di sini (di PortalPage) bukan di
  // ProductShell unmount, untuk menghindari React StrictMode bug: mount→unmount→remount
  // akan trigger cleanup unmount SEBELUM ProductShell bisa baca role yang baru dipilih.
  useEffect(() => {
    clearSelectedRole();
  }, []);

  // Efek navigasi setelah role tersimpan — memastikan store ter-propagate
  // sebelum ProductShell mount dan baca nilai activeRole.
  useEffect(() => {
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
  }, [pendingNavigation, navigate]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearSession();
      setAccessToken(null);
      queryClient.removeQueries({ queryKey: ['auth.me'] });
      navigate('/login', { replace: true });
    },
  });

  // List produk diambil dari backend (mst_produk). Backend sudah filter
  // berdasarkan user_type session, jadi FE cukup render apa adanya.
  const productsQuery = useQuery({
    queryKey: ['portal.products'],
    queryFn: getProducts,
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const products = productsQuery.data ?? [];

  // Fetch role untuk produk yang dipilih (non-superadmin flow)
  const rolesQuery = useQuery({
    queryKey: ['portal.roles', selectedProductForRole?.id],
    queryFn: () => getProductRoles(selectedProductForRole!.id),
    enabled: selectedProductForRole != null && !isSuperadmin,
    staleTime: 60_000,
  });

  const handleProductClick = (p: PortalProduct) => {
    // Superadmin: langsung ke produk (no role picker)
    if (isSuperadmin) {
      navigate(`/${p.url_produk}`);
      return;
    }
    // Non-superadmin: buka role picker modal
    setSelectedProductForRole(p);
  };

  const handleRoleSelected = (role: { id: number; nama_role: string }) => {
    const product = selectedProductForRole;
    if (!product?.url_produk) {
      return;
    }
    // 1. Simpan role ke store (synchronous zustand update)
    setSelectedRole(product.url_produk, role);
    setSelectedProductForRole(null);
    // 2. Queue navigation (deferred via useEffect, memastikan store propagate)
    setPendingNavigation(`/${product.url_produk}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300">
      {/* Modal pemilihan jabatan — tampil di atas product grid */}
      <Modal
        open={selectedProductForRole != null}
        onClose={() => setSelectedProductForRole(null)}
        title="Pilih Jabatan"
        description={selectedProductForRole ? `Untuk ${selectedProductForRole.nama_produk}` : ''}
        icon={<ShieldCheck className="h-6 w-6" />}
      >
        {selectedProductForRole && (
          <ProductRoleSelect
            productName={selectedProductForRole.nama_produk}
            roles={rolesQuery.data ?? []}
            isLoading={rolesQuery.isLoading}
            isError={rolesQuery.isError}
            onSelect={handleRoleSelected}
          />
        )}
      </Modal>

      <AppHeader
        brand={{ icon: 'K', title: 'Kartolo Portal', subtitle: user?.email }}
        actions={[
          { label: 'Pengaturan', icon: Settings, to: '/pengaturan' },
          {
            label: 'Keluar',
            icon: LogOut,
            onClick: () => logoutMutation.mutate(),
            loading: logoutMutation.isPending,
            loadingLabel: 'Keluar...',
          },
        ]}
      />

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 transition-colors duration-300">
          Halo, {user?.full_name ?? 'pengguna'} 👋
        </h1>

        <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="glass-card rounded-3xl p-5 flex items-start gap-4 hover:shadow-xl transition-shadow duration-300">
            <span className="h-11 w-11 rounded-2xl bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 flex items-center justify-center shrink-0 transition-colors duration-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-50 text-sm transition-colors duration-300">Tipe akun</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 capitalize transition-colors duration-300">{user?.user_type ?? '-'}</p>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5 flex items-start gap-4 hover:shadow-xl transition-shadow duration-300">
            <span className="h-11 w-11 rounded-2xl bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 flex items-center justify-center shrink-0 transition-colors duration-300">
              <Clock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-slate-50 text-sm transition-colors duration-300">Sesi berakhir</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 truncate transition-colors duration-300">
                {formatTime(me?.session.expires_at)}
              </p>
            </div>
          </div>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 transition-colors duration-300">Produk Anda</h2>
          <p className="text-base text-slate-600 dark:text-slate-300 mt-2 transition-colors duration-300">Pilih produk untuk masuk ke modul terkait.</p>

          {productsQuery.isLoading && (
            <div className="mt-6 flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Memuat produk...</span>
            </div>
          )}

          {productsQuery.isError && (
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">Gagal memuat daftar produk. Coba muat ulang halaman.</p>
            </div>
          )}

          {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 && (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              Belum ada produk yang tersedia untuk akun Anda.
            </p>
          )}

          {products.length > 0 && (
            <div className="mt-6 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => {
                const meta = PRODUCT_META[p.nama_produk.toLowerCase()];
                const Icon = meta?.icon ?? LayoutGrid;
                const description = meta?.description ?? 'Produk Kartolo SuperApps.';
                // Route produk dari mst_produk.url_produk (data-driven). Produk
                // tanpa url_produk tampil sebagai kartu non-klik.
                const hasUrl = p.url_produk != null;

                const inner = (
                  <>
                    <div className="flex items-start justify-between">
                      <span className="h-16 w-16 rounded-2xl bg-gradient-primary text-white flex items-center justify-center shrink-0 shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary-500/50">
                        <Icon className="h-8 w-8" />
                      </span>
                      {hasUrl && (
                        <ArrowRight className="h-6 w-6 text-primary-600 dark:text-primary-400 transition-all duration-300 group-hover:translate-x-1 opacity-60 group-hover:opacity-100" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 dark:text-slate-50 text-lg transition-colors duration-300">
                        {p.nama_produk}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed transition-colors duration-300">
                        {description}
                      </p>
                    </div>
                  </>
                );

                if (!hasUrl) {
                  return (
                    <div
                      key={p.id}
                      className="group glass-card rounded-3xl p-8 flex flex-col gap-5 opacity-80"
                    >
                      {inner}
                    </div>
                  );
                }

                // Superadmin: langsung Link. Non-superadmin: button → role modal.
                if (isSuperadmin) {
                  return (
                    <Link
                      key={p.id}
                      to={`/${p.url_produk}`}
                      className="group glass-card rounded-3xl p-8 flex flex-col gap-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary-500/20 dark:hover:shadow-primary-500/30 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {inner}
                    </Link>
                  );
                }

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProductClick(p)}
                    className="group glass-card rounded-3xl p-8 flex flex-col gap-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary-500/20 dark:hover:shadow-primary-500/30 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
