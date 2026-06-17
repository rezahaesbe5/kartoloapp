import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LogOut, ShieldCheck, UserCircle2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';
import { setAccessToken } from '@/shared/lib/api-client';
import { AppHeader } from '@/shared/components/layout/AppHeader';
import { logout } from '@modules/auth/api/auth-api';
import { SettingsSidebar, type SettingsSection, type SettingsTab } from '../components/SettingsSidebar';
import { ProfileSection } from '../sections/ProfileSection';
import { PrivasiSection } from '../sections/PrivasiSection';

const TABS: SettingsTab[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Identitas akun & edit profil',
    icon: UserCircle2,
  },
  {
    id: 'privasi',
    label: 'Privasi',
    description: 'Session, password, MFA',
    icon: ShieldCheck,
  },
];

const VALID_SECTIONS: SettingsSection[] = ['profile', 'privasi'];

function isValidSection(value: string | null): value is SettingsSection {
  return value != null && (VALID_SECTIONS as string[]).includes(value);
}

export function PengaturanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const active: SettingsSection = useMemo(
    () => (isValidSection(sectionParam) ? sectionParam : 'profile'),
    [sectionParam],
  );

  const setActive = (id: SettingsSection) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', id);
    setSearchParams(next, { replace: true });
  };

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearSession();
      setAccessToken(null);
      queryClient.removeQueries({ queryKey: ['auth.me'] });
      navigate('/login', { replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300">
      <AppHeader
        brand={{ icon: 'K', title: 'Pengaturan', subtitle: user?.email }}
        actions={[
          { label: 'Portal', icon: ArrowLeft, to: '/portal' },
          {
            label: 'Keluar',
            icon: LogOut,
            onClick: () => logoutMutation.mutate(),
            loading: logoutMutation.isPending,
            loadingLabel: 'Keluar...',
          },
        ]}
      />

      {/* Full-width container. Tidak ada max-w clamp — section card di dalamnya
          mengatur readable width sendiri lewat layout grid. */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
          <SettingsSidebar tabs={TABS} active={active} onSelect={setActive} />

          <div className="flex-1 min-w-0">
            {active === 'profile' && <ProfileSection />}
            {active === 'privasi' && <PrivasiSection />}
          </div>
        </div>
      </main>
    </div>
  );
}
