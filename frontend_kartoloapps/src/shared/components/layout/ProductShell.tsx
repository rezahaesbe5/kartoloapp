import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, LayoutGrid, Loader2, LogOut, Menu, Settings, ShieldCheck } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useProductRoleStore } from '@/shared/stores/product-role-store';
import { setAccessToken } from '@/shared/lib/api-client';
import { logout } from '@modules/auth/api/auth-api';
import { getProductMenus, getProductRoles, getProducts } from '@modules/portal/api/portal-api';
import type { PortalRole } from '@modules/portal/api/portal-api';
import { NotFoundPage } from '@/shared/components/NotFoundPage';
import { Modal } from '@/shared/components/Modal';
import { AppHeader, type HeaderAction } from './AppHeader';
import { ProductSidebar } from './ProductSidebar';
import { ProductRoleSelect } from './ProductRoleSelect';

interface ProductShellProps {
  /** Segmen URL produk (mst_produk.url_produk), mis. "admin". */
  productUrl: string;
  /**
   * Halaman per menu: key = url_name menu, value = elemen halaman.
   * url_name yang tidak terdaftar di sini akan menampilkan 404 (graceful).
   */
  pages?: Record<string, ReactNode>;
}

/**
 * Shell sebuah produk: header + side menu (sesuai role terpilih) + area konten.
 *
 * Flow role:
 * - superadmin: bypass role picker (akses semua menu; menu di-fetch tanpa role_id).
 * - non-superadmin: role picker dikelola di PortalPage sebelum navigasi. Jika
 *   user langsung akses URL produk tanpa role (refresh/bookmark), redirect ke
 *   /portal untuk pilih role via modal di sana.
 */
export function ProductShell({ productUrl, pages }: ProductShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showRolePickerModal, setShowRolePickerModal] = useState(false);

  const isSuperadmin = user?.user_type === 'superadmin';

  const selectedProductUrl = useProductRoleStore((s) => s.productUrl);
  const selectedRole = useProductRoleStore((s) => s.role);
  const setSelectedRole = useProductRoleStore((s) => s.setSelectedRole);
  const clearSelectedRole = useProductRoleStore((s) => s.clearSelectedRole);

  // Role yang berlaku hanya kalau cocok dengan produk yang sedang dibuka.
  const activeRole = selectedProductUrl === productUrl ? selectedRole : null;

  // PENTING: role TIDAK di-clear di unmount shell ProductShell.
  // Alasan: React StrictMode men-trigger mount→unmount→remount, sehingga cleanup
  // unmount akan langsung clear role yang baru dipilih → activeRole = null → redirect
  // balik ke portal (bug). Role akan di-clear saat user tiba di PortalPage (on-entry).

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearSelectedRole();
      clearSession();
      setAccessToken(null);
      queryClient.removeQueries({ queryKey: ['auth.me'] });
      navigate('/login', { replace: true });
    },
  });

  const productsQuery = useQuery({
    queryKey: ['portal.products'],
    queryFn: getProducts,
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const product = useMemo(
    () => (productsQuery.data ?? []).find((p) => p.url_produk === productUrl) ?? null,
    [productsQuery.data, productUrl],
  );

  // Safety: non-superadmin tanpa role → redirect ke portal untuk pilih role via modal.
  // Ini terjadi kalau user refresh/bookmark product URL (store non-persist → role hilang).
  const needRoleButMissing = product != null && !isSuperadmin && activeRole == null;

  // Fetch roles untuk modal ganti role (ketika user klik tombol Role di navbar)
  const rolesQuery = useQuery({
    queryKey: ['portal.roles', product?.id],
    queryFn: () => getProductRoles(product!.id),
    enabled: showRolePickerModal && product != null,
    staleTime: 60_000,
  });

  // Menu di-fetch setelah role beres: superadmin langsung; selain itu butuh role.
  const menusEnabled = product != null && (isSuperadmin || activeRole != null);
  const menusQuery = useQuery({
    queryKey: ['portal.menus', product?.id, isSuperadmin ? 'all' : activeRole?.id],
    queryFn: () => getProductMenus(product!.id, isSuperadmin ? null : activeRole!.id),
    enabled: menusEnabled,
    staleTime: 60_000,
  });
  const menus = menusQuery.data ?? [];
  const firstMenu = menus.find((m) => m.url_name != null) ?? null;

  const isLoading =
    productsQuery.isLoading || (menusEnabled && menusQuery.isLoading);
  const notFound = !productsQuery.isLoading && !productsQuery.isError && product == null;
  const isError = productsQuery.isError || menusQuery.isError || notFound;

  const handleRoleSelected = (role: PortalRole) => {
    setSelectedRole(productUrl, role);
    setShowRolePickerModal(false);
    // Setelah ganti role, query menu akan auto-refetch karena activeRole berubah
  };

  // Header actions
  const actions: HeaderAction[] = [
    // Ganti role: buka modal role picker (non-superadmin).
    ...(!isSuperadmin && activeRole != null
      ? [{ label: `Role: ${activeRole.nama_role}`, icon: ShieldCheck, onClick: () => setShowRolePickerModal(true) }]
      : []),
    { label: 'Pengaturan', icon: Settings, to: '/pengaturan' },
    { label: 'Portal', icon: ArrowLeft, to: '/portal' },
    {
      label: 'Keluar',
      icon: LogOut,
      onClick: () => logoutMutation.mutate(),
      loading: logoutMutation.isPending,
      loadingLabel: 'Keluar...',
    },
  ];

  return (
    <div className="min-h-screen bg-surface transition-colors duration-300">
      {/* Safety redirect: non-superadmin tanpa role dipilih → kembali ke portal */}
      {needRoleButMissing && <Navigate to="/portal" replace />}

      {/* Modal ganti role (ketika user klik tombol Role di navbar) */}
      <Modal
        open={showRolePickerModal}
        onClose={() => setShowRolePickerModal(false)}
        title="Ganti Jabatan"
        description={product ? `Untuk ${product.nama_produk}` : ''}
        icon={<ShieldCheck className="h-6 w-6" />}
      >
        {product && (
          <ProductRoleSelect
            productName={product.nama_produk}
            roles={rolesQuery.data ?? []}
            isLoading={rolesQuery.isLoading}
            isError={rolesQuery.isError}
            onSelect={handleRoleSelected}
          />
        )}
      </Modal>

      <AppHeader
        brand={{
          icon: <LayoutGrid className="h-5 w-5" />,
          title: product?.nama_produk ?? 'Produk',
          subtitle: user?.email,
        }}
        actions={actions}
        leading={
          isError ? undefined : (
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu"
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700 transition-all duration-300 hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-slate-700 dark:text-primary-400"
            >
              <Menu className="h-5 w-5" />
            </button>
          )
        }
      />

      <div className="flex w-full">
        {!isError && (
          <ProductSidebar
            menus={menus}
            productUrl={productUrl}
            isLoading={isLoading}
            isError={isError}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />
        )}

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8">
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Memuat...</span>
            </div>
          )}

          {!isLoading && isError && (
            <div className="flex items-center gap-2 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">
                {notFound
                  ? 'Produk tidak ditemukan atau tidak dapat diakses akun Anda.'
                  : 'Gagal memuat produk. Coba muat ulang halaman.'}
              </p>
            </div>
          )}

          {!isLoading && !isError && (
            <Routes>
              <Route
                index
                element={
                  firstMenu ? (
                    <Navigate to={`/${productUrl}/${firstMenu.url_name}`} replace />
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Belum ada menu untuk role ini.
                    </p>
                  )
                }
              />
              {pages &&
                Object.entries(pages).map(([urlName, element]) => (
                  <Route key={urlName} path={urlName} element={element} />
                ))}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}
