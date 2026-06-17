import { ChevronRight, ShieldCheck, AlertCircle } from 'lucide-react';
import type { PortalRole } from '@modules/portal/api/portal-api';

interface ProductRoleSelectProps {
  productName: string;
  roles: PortalRole[];
  isLoading: boolean;
  isError: boolean;
  onSelect: (role: PortalRole) => void;
}

/**
 * Konten modal untuk pemilihan jabatan/role saat user masuk sebuah produk
 * (non-superadmin). Role terpilih menentukan menu yang tampil.
 *
 * Desain sengaja simpel & profesional: daftar baris satu kolom yang mudah
 * dipindai, hover halus, dan menyesuaikan dark/light mode lewat token tema.
 */
export function ProductRoleSelect({
  productName,
  roles,
  isLoading,
  isError,
  onSelect,
}: ProductRoleSelectProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        Pilih jabatan yang akan Anda gunakan untuk masuk ke{' '}
        <span className="font-semibold text-slate-800 dark:text-slate-100">{productName}</span>.
      </p>

      {/* Loading — skeleton baris agar layout tidak melompat */}
      {isLoading && (
        <div className="space-y-2.5" aria-busy="true" aria-label="Memuat daftar jabatan">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3.5"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
              <div className="h-3.5 w-32 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-4 py-4">
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Gagal memuat daftar jabatan</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-1">Coba muat ulang halaman atau hubungi administrator.</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && roles.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-4">
          <AlertCircle className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Tidak ada jabatan tersedia</p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
              Akun Anda belum memiliki jabatan untuk produk ini. Hubungi administrator untuk mendapatkan akses.
            </p>
          </div>
        </div>
      )}

      {/* Daftar jabatan — satu kolom, rapi & mudah dipindai */}
      {!isLoading && !isError && roles.length > 0 && (
        <ul className="space-y-2.5 max-h-[50vh] overflow-y-auto -mr-1 pr-1 custom-scrollbar">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="group w-full flex items-center gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-3.5 text-left transition-all duration-200 hover:border-primary-400 hover:bg-primary-50/60 dark:hover:border-primary-500/50 dark:hover:bg-primary-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 shrink-0 transition-colors duration-200 group-hover:bg-primary-200 dark:group-hover:bg-primary-500/25">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {r.nama_role}
                </span>
                <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0 transition-all duration-200 group-hover:text-primary-500 group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
