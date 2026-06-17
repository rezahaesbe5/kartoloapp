import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { cn } from '@/shared/lib/cn';

export interface HeaderAction {
  label: string;
  icon: LucideIcon;
  /** Aksi navigasi (react-router). Salah satu dari `to` / `onClick`. */
  to?: string;
  onClick?: () => void;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
}

interface AppHeaderProps {
  brand: { icon: ReactNode; title: string; subtitle?: string };
  actions: HeaderAction[];
  /** Slot kiri sebelum brand — mis. tombol hamburger side menu. */
  leading?: ReactNode;
}

function ActionContent({ action }: { action: HeaderAction }) {
  const Icon = action.icon;
  if (action.loading) {
    return (
      <>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span className="truncate">{action.loadingLabel ?? action.label}</span>
      </>
    );
  }
  return (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{action.label}</span>
    </>
  );
}

/** Aksi inline untuk tampilan desktop (>= md). */
function InlineAction({ action }: { action: HeaderAction }) {
  if (action.to) {
    return (
      <Link to={action.to} className="btn-ghost text-sm">
        <ActionContent action={action} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      className="btn-ghost text-sm disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <ActionContent action={action} />
    </button>
  );
}

/** Baris aksi di dalam dropdown (< md). */
function DropdownItem({
  action,
  onSelect,
}: {
  action: HeaderAction;
  onSelect: () => void;
}) {
  const className =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-primary-50 dark:hover:bg-primary-950/40 disabled:opacity-60 disabled:cursor-not-allowed';

  if (action.to) {
    return (
      <Link to={action.to} role="menuitem" className={className} onClick={onSelect}>
        <ActionContent action={action} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={action.disabled || action.loading}
      onClick={() => {
        onSelect();
        action.onClick?.();
      }}
      className={className}
    >
      <ActionContent action={action} />
    </button>
  );
}

/**
 * Header aplikasi yang responsif. >= md menampilkan aksi inline; < md aksi
 * runtuh menjadi dropdown agar navbar tetap rapi di tablet & ponsel.
 */
export function AppHeader({ brand, actions, leading }: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Tutup dropdown saat pindah halaman.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Tutup saat klik di luar atau tekan Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700/50 transition-colors duration-300">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {leading}
          <div className="h-9 w-9 rounded-xl bg-gradient-primary text-white font-bold flex items-center justify-center shrink-0">
            {brand.icon}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-ink dark:text-slate-100 leading-tight truncate transition-colors duration-300">
              {brand.title}
            </p>
            {brand.subtitle && (
              <p className="text-xs text-muted dark:text-slate-400 leading-tight truncate transition-colors duration-300">
                {brand.subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />

          {/* Desktop: aksi inline */}
          <div className="hidden md:flex items-center gap-2">
            {actions.map((action) => (
              <InlineAction key={action.label} action={action} />
            ))}
          </div>

          {/* Mobile/tablet: aksi runtuh jadi dropdown */}
          <div className="relative md:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="Menu navigasi"
              className={cn(
                'h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-400',
                open
                  ? 'bg-primary-600 text-white shadow-lg'
                  : 'bg-primary-100 dark:bg-slate-700 text-primary-700 dark:text-primary-400 hover:scale-105 hover:shadow-lg',
              )}
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl glass-card p-1.5 animate-pop-in z-40"
              >
                {actions.map((action) => (
                  <DropdownItem
                    key={action.label}
                    action={action}
                    onSelect={() => setOpen(false)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
