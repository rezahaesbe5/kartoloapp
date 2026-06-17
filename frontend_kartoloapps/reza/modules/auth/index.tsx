import { LoginPage } from './pages/LoginPage';
import { LoginMfaPage } from './pages/LoginMfaPage';
import { ForceChangePasswordPage } from './pages/ForceChangePasswordPage';
import type { ModuleManifest } from '@/shared/types/module';

export const authModule: ModuleManifest = {
  name: 'auth',
  owner: 'reza',
  routes: [
    { path: '/login', element: <LoginPage />, access: 'public-only' },
    { path: '/login/mfa', element: <LoginMfaPage />, access: 'public-only' },
    { path: '/auth/force-change-password', element: <ForceChangePasswordPage />, access: 'public' },
  ],
};
