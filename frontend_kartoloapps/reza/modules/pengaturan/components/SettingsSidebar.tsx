import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export type SettingsSection = 'profile' | 'privasi';

export interface SettingsTab {
  id: SettingsSection;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface SettingsSidebarProps {
  tabs: SettingsTab[];
  active: SettingsSection;
  onSelect: (id: SettingsSection) => void;
}

/**
 * Navigasi section halaman Pengaturan.
 *  - Desktop ≥ md: sidebar kiri vertikal, sticky di bawah header (top-[64px]).
 *  - Mobile  < md: bar horizontal scrollable di atas konten (pill chips).
 */
export function SettingsSidebar({ tabs, active, onSelect }: SettingsSidebarProps) {
  return (
    <>
      {/* Mobile: horizontal pill tabs */}
      <div
        role="tablist"
        aria-label="Bagian pengaturan"
        className="md:hidden sticky top-[64px] z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700/50 transition-colors duration-300"
      >
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(tab.id)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-gradient-primary text-white shadow-soft'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <aside
        role="tablist"
        aria-label="Bagian pengaturan"
        className="hidden md:flex md:flex-col gap-1.5 md:w-64 lg:w-72 shrink-0 md:sticky md:top-[80px] md:self-start"
      >
        <p className="px-3 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5">
          Pengaturan Akun
        </p>
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.id)}
              className={cn(
                'group relative w-full flex items-start gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-200',
                isActive
                  ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-800 dark:text-primary-200 shadow-sm'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-gradient-primary" />
              )}
              <span
                className={cn(
                  'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300',
                  isActive
                    ? 'bg-gradient-primary text-white shadow-soft'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-white dark:group-hover:bg-slate-700',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{tab.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {tab.description}
                </span>
              </span>
            </button>
          );
        })}
      </aside>
    </>
  );
}
