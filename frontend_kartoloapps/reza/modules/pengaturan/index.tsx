import { Navigate } from 'react-router-dom';
import { PengaturanPage } from './pages/PengaturanPage';
import type { ModuleManifest } from '@/shared/types/module';

export const pengaturanModule: ModuleManifest = {
  name: 'pengaturan',
  owner: 'reza',
  routes: [
    { path: '/pengaturan', element: <PengaturanPage />, access: 'protected' },
    // Backward-compat untuk bookmark lama /profile.
    {
      path: '/profile',
      element: <Navigate to="/pengaturan?section=profile" replace />,
      access: 'protected',
    },
  ],
};
