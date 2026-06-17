import { useAuthStore } from '@/shared/stores/auth-store';

// Salam menyesuaikan jam lokal pengguna.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

/** Halaman Beranda produk Administration — kartu sambutan sederhana. */
export function BerandaPage() {
  const user = useAuthStore((s) => s.user);
  const fullName = user?.full_name ?? 'Pengguna';

  return (
    <section className="glass-card rounded-3xl p-7 sm:p-10 animate-fade-in-up">
      <p className="text-sm font-medium text-muted dark:text-slate-400 transition-colors duration-300">
        {greeting()}
      </p>
      <h1 className="mt-1.5 text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-ink dark:text-slate-50 transition-colors duration-300">
        Welcome,{' '}
        <span className="text-primary-600 dark:text-primary-400">{fullName}</span>
      </h1>
    </section>
  );
}
