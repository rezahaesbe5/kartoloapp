import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { ProductMenu } from '@modules/portal/api/portal-api';
import { cn } from '@/shared/lib/cn';

interface ProductSideMenuProps {
  menus: ProductMenu[];
  productUrl: string;
  /** Mode rail (icon-only) untuk side menu desktop yang di-collapse. */
  collapsed?: boolean;
  /** Dipanggil setiap kali sebuah item dinavigasi — mis. menutup drawer mobile. */
  onNavigate?: () => void;
}

const linkBase =
  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200';

// Render kelas icon FontAwesome 5/6 (mis. "fas fa-home"). Menu anak biasanya
// tidak punya icon (null) — dirender sebagai spacer agar label tetap sejajar.
function MenuIcon({ icon }: { icon: string | null }) {
  if (!icon) return <span className="w-5 shrink-0" aria-hidden="true" />;
  return <i className={`${icon} w-5 shrink-0 text-center text-base`} aria-hidden="true" />;
}

// Icon untuk mode rail — induk umumnya punya icon; jika tidak, pakai inisial.
function RailIcon({ icon, fallback }: { icon: string | null; fallback: string }) {
  if (icon) return <i className={`${icon} text-lg`} aria-hidden="true" />;
  return (
    <span className="text-sm font-bold" aria-hidden="true">
      {fallback}
    </span>
  );
}

// Tooltip label yang muncul saat hover item rail.
function RailTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-slate-700">
      {label}
    </span>
  );
}

/* ------------------------------- Mode penuh ------------------------------- */

function MenuLink({
  menu,
  productUrl,
  nested,
  onNavigate,
}: {
  menu: ProductMenu;
  productUrl: string;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={`/${productUrl}/${menu.url_name}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          linkBase,
          nested && 'pl-11',
          isActive
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50',
        )
      }
    >
      <MenuIcon icon={menu.icon} />
      <span className="truncate">{menu.menu_name}</span>
    </NavLink>
  );
}

function MenuGroup({
  menu,
  items,
  productUrl,
  onNavigate,
}: {
  menu: ProductMenu;
  items: ProductMenu[];
  productUrl: string;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const hasActiveChild = items.some(
    (c) => pathname === `/${productUrl}/${c.url_name}`,
  );
  // Default tertutup — hanya terbuka jika salah satu child sedang aktif.
  const [open, setOpen] = useState(hasActiveChild);

  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          linkBase,
          'w-full',
          hasActiveChild
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50',
        )}
      >
        <MenuIcon icon={menu.icon} />
        <span className="flex-1 truncate text-left">{menu.menu_name}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200',
            !open && '-rotate-90',
          )}
        />
      </button>
      {open && items.length > 0 && (
        <div className="mt-1 space-y-1 animate-fade-in">
          {items.map((child) => (
            <MenuLink
              key={child.id}
              menu={child}
              productUrl={productUrl}
              nested
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------- Mode rail (collapsed) ------------------------- */

const railItemBase =
  'group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200';

function RailLink({
  menu,
  productUrl,
  onNavigate,
}: {
  menu: ProductMenu;
  productUrl: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={`/${productUrl}/${menu.url_name}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          railItemBase,
          isActive
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50',
        )
      }
    >
      <RailIcon icon={menu.icon} fallback={menu.menu_name.charAt(0).toUpperCase()} />
      <RailTooltip label={menu.menu_name} />
    </NavLink>
  );
}

function RailFlyout({
  anchorRef,
  menu,
  items,
  productUrl,
  onClose,
  onNavigate,
}: {
  anchorRef: RefObject<HTMLButtonElement>;
  menu: ProductMenu;
  items: ProductMenu[];
  productUrl: string;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Posisikan flyout di samping kanan tombol, di-clamp agar tetap di viewport.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const el = ref.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const gap = 8;
    const height = el.offsetHeight;
    let top = a.top;
    if (top + height > window.innerHeight - gap) {
      top = window.innerHeight - height - gap;
    }
    if (top < gap) top = gap;
    setPos({ top, left: a.right + gap });
  }, [anchorRef]);

  // Tutup saat klik di luar atau tekan Escape.
  useEffect(() => {
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="fixed z-50 w-56 rounded-2xl glass-card p-2 animate-pop-in"
    >
      <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {menu.menu_name}
      </p>
      <div className="space-y-1">
        {items.map((child) => (
          <NavLink
            key={child.id}
            to={`/${productUrl}/${child.url_name}`}
            role="menuitem"
            onClick={() => {
              onClose();
              onNavigate?.();
            }}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50',
              )
            }
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
            <span className="truncate">{child.menu_name}</span>
          </NavLink>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function RailGroup({
  menu,
  items,
  productUrl,
  open,
  onToggle,
  onClose,
  onNavigate,
}: {
  menu: ProductMenu;
  items: ProductMenu[];
  productUrl: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasActiveChild = items.some(
    (c) => pathname === `/${productUrl}/${c.url_name}`,
  );
  const highlighted = open || hasActiveChild;

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          railItemBase,
          highlighted
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50',
        )}
      >
        <RailIcon icon={menu.icon} fallback={menu.menu_name.charAt(0).toUpperCase()} />
        {/* Penanda bahwa menu ini punya child. */}
        <span
          className={cn(
            'absolute right-1 top-1 h-1.5 w-1.5 rounded-full',
            highlighted ? 'bg-white/80' : 'bg-primary-400',
          )}
        />
        {!open && <RailTooltip label={menu.menu_name} />}
      </button>
      {open && (
        <RailFlyout
          anchorRef={btnRef}
          menu={menu}
          items={items}
          productUrl={productUrl}
          onClose={onClose}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

/* -------------------------------- Root nav -------------------------------- */

export function ProductSideMenu({
  menus,
  productUrl,
  collapsed = false,
  onNavigate,
}: ProductSideMenuProps) {
  // Menu induk = main_menu_id 0; anak = main_menu_id menunjuk id induk.
  const parents = menus.filter((m) => m.main_menu_id === 0);
  const [openFlyout, setOpenFlyout] = useState<number | null>(null);
  const { pathname } = useLocation();

  // Tutup flyout saat keluar mode rail atau saat pindah halaman.
  useEffect(() => {
    if (!collapsed) setOpenFlyout(null);
  }, [collapsed]);
  useEffect(() => {
    setOpenFlyout(null);
  }, [pathname]);

  return (
    <nav className={cn('space-y-1', collapsed && 'flex flex-col items-center')}>
      {parents.map((menu) => {
        // Menu single — leaf langsung punya url.
        if (menu.url_name != null) {
          return collapsed ? (
            <RailLink
              key={menu.id}
              menu={menu}
              productUrl={productUrl}
              onNavigate={onNavigate}
            />
          ) : (
            <MenuLink
              key={menu.id}
              menu={menu}
              productUrl={productUrl}
              onNavigate={onNavigate}
            />
          );
        }

        // Menu grup — induk tanpa url, menampung anak.
        const children = menus.filter((m) => m.main_menu_id === menu.id);
        return collapsed ? (
          <RailGroup
            key={menu.id}
            menu={menu}
            items={children}
            productUrl={productUrl}
            open={openFlyout === menu.id}
            onToggle={() =>
              setOpenFlyout((id) => (id === menu.id ? null : menu.id))
            }
            onClose={() => setOpenFlyout(null)}
            onNavigate={onNavigate}
          />
        ) : (
          <MenuGroup
            key={menu.id}
            menu={menu}
            items={children}
            productUrl={productUrl}
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}
