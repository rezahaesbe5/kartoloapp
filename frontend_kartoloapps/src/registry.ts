import { authModule } from '@modules/auth';
import { portalModule } from '@modules/portal';
import { administrationModule } from '@modules/administration';
import { pengaturanModule } from '@modules/pengaturan';
import type { ModuleManifest } from './shared/types/module';

export const modules: ModuleManifest[] = [
  authModule,
  portalModule,
  administrationModule,
  pengaturanModule,
];
