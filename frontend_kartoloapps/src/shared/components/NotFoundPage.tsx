import { FileQuestion } from 'lucide-react';

/**
 * Halaman 404 untuk area konten produk. Ditampilkan saat menu menunjuk ke
 * url_name yang belum punya halaman — supaya navigasi tidak error.
 */
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center transition-colors duration-300">
        <FileQuestion className="h-8 w-8" />
      </span>
      <p className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 transition-colors duration-300">
        404
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-700 dark:text-slate-200 transition-colors duration-300">
        Halaman Tidak Ditemukan
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
        Halaman yang Anda tuju belum tersedia.
      </p>
    </div>
  );
}
