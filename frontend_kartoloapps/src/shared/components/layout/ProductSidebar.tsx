import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useUiStore } from '@/shared/stores/ui-store';
import { cn } from '@/shared/lib/cn';
import { ProductSideMenu } from './ProductSideMenu';
import type { ProductMenu } from '@modules/portal/api/portal-api';

interface ProductSidebarProps {
  menus: ProductMenu[];
  productUrl: string;
  isLoading: boolean;
  isError: boolean;
  /** State drawer untuk layar < md. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

/** Isi side menu: state loading / kosong / daftar menu. */
function MenuBody({
  menus,
  productUrl,
  isLoading,
  isError,
  collapsed,
  onNavigate,
}: {
  menus: ProductMenu[];
  productUrl: string;
  isLoading: boolean;
  isError: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-slate-500 dark:text-slate-400',
          collapsed && 'justify-center px-0',
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        {!collapsed && <span className="text-sm">Memuat menu...</span>}
      </div>
    );
  }
  if (isError) return null;
  if (menus.length === 0) {
    if (collapsed) return null;
    return (
      <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
        Belum ada menu untuk akun Anda.
      </p>
    );
  }
  return (
    <ProductSideMenu
      menus={menus}
      productUrl={productUrl}
      collapsed={collapsed}
      onNavigate={onNavigate}
    />
  );
}

/**
 * Side menu produk dengan dua wajah:
 * - Desktop (>= md): aside statik, bisa di-collapse jadi rail icon-only.
 * - Mobile/tablet (< md): drawer off-canvas yang tersembunyi default.
 */
export function ProductSidebar({
  menus,
  productUrl,
  isLoading,
  isError,
  mobileOpen,
  onMobileClose,
}: ProductSidebarProps) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const { pathname } = useLocation();

  // Tutup drawer otomatis saat pindah halaman.
  useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Saat drawer terbuka: kunci scroll body & dukung Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onMobileClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop: aside statik dengan mode collapse */}
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 dark:border-slate-700 dark:bg-slate-800 min-h-[calc(100vh-69px)]',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex items-center p-3',
            collapsed ? 'justify-center' : 'justify-end',
          )}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Perlebar menu' : 'Perkecil menu'}
            title={collapsed ? 'Perlebar menu' : 'Perkecil menu'}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-600 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-primary-400"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>
        <div className={cn('flex-1', collapsed ? 'px-2 pb-4' : 'px-3 pb-4')}>
          <MenuBody
            menus={menus}
            productUrl={productUrl}
            isLoading={isLoading}
            isError={isError}
            collapsed={collapsed}
          />
        </div>
      </aside>

      {/* Mobile/tablet: drawer off-canvas */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[82vw] flex-col bg-white shadow-2xl animate-slide-in-left dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary font-bold text-white">
                  K
                </div>
                <p className="font-bold text-ink dark:text-slate-100">Menu</p>
              </div>
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Tutup menu"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-500 dark:text-slate-400 dark:hover:bg-slate-700/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <MenuBody
                menus={menus}
                productUrl={productUrl}
                isLoading={isLoading}
                isError={isError}
                collapsed={false}
                onNavigate={onMobileClose}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
