import { ShieldCheck, Users, Zap } from 'lucide-react';
import { LogoMark } from './LogoMark';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Auth Terpusat',
    desc: 'Satu login untuk semua produk Kartolo.',
  },
  {
    icon: Users,
    title: 'RBAC Fleksibel',
    desc: 'Akses berbasis tipe, peran, dan unit organisasi.',
  },
  {
    icon: Zap,
    title: 'SSO Ready',
    desc: 'Integrasi seamless ke seluruh sub-aplikasi.',
  },
];

export function BrandPanel() {
  return (
    <div className="relative h-full overflow-hidden bg-gradient-hero text-white">
      {/* Decorative blobs */}
      <div className="blob bg-white/15 h-72 w-72 -top-16 -left-16 animate-float-slow" />
      <div className="blob bg-primary-200/40 h-80 w-80 bottom-0 -right-10 animate-pulse-soft" />
      <div className="blob bg-white/10 h-44 w-44 top-1/2 left-1/3 animate-float-slow" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative h-full flex flex-col justify-between p-10 xl:p-14">
        {/* Top — logo + brand */}
        <div className="flex items-center gap-3 animate-fade-in">
          <LogoMark size="md" variant="white" />
          <div>
            <p className="font-bold text-lg leading-tight">Kartolo</p>
            <p className="text-xs text-white/70 leading-tight">SuperApps Portal</p>
          </div>
        </div>

        {/* Middle — headline */}
        <div className="max-w-md animate-fade-in-up">
          <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight">
            Selamat datang di
            <br />
            <span className="text-white">ekosistem digital Anda.</span>
          </h1>
          <p className="mt-4 text-white/80 text-base leading-relaxed">
            Satu pintu masuk untuk seluruh produk Kartolo. Aman, cepat, dan dirancang untuk produktivitas tim Anda.
          </p>
        </div>

        {/* Bottom — features */}
        <ul className="grid gap-3 max-w-md animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="flex items-start gap-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 px-4 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                <f.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-xs text-white/70">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
