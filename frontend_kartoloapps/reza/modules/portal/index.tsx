import { PortalPage } from './pages/PortalPage';
import type { ModuleManifest } from '@/shared/types/module';

export const portalModule: ModuleManifest = {
  name: 'portal',
  owner: 'reza',
  routes: [
    { path: '/portal', element: <PortalPage />, access: 'protected' },
  ],
};
