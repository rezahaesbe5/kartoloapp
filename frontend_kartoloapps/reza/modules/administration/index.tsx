import { ProductShell } from '@/shared/components/layout/ProductShell';
import type { ModuleManifest } from '@/shared/types/module';
import { AuditLogPage } from './pages/AuditLogPage';
import { BerandaPage } from './pages/BerandaPage';
import { ProdukPage } from './pages/ProdukPage';
import { RoleUserPage } from './pages/RoleUserPage';
import { UserAdminPage } from './pages/UserAdminPage';
import { UserMemberPage } from './pages/UserMemberPage';

export const administrationModule: ModuleManifest = {
  name: 'administration',
  owner: 'reza',
  routes: [
    // Wildcard: ProductShell menangani routing internal (side menu + konten).
    // `pages` memetakan url_name menu → komponen halaman.
    {
      path: '/admin/*',
      element: (
        <ProductShell
          productUrl="admin"
          pages={{ beranda: <BerandaPage />, auditlog: <AuditLogPage />, role: <RoleUserPage />, useradmin: <UserAdminPage />, usermember: <UserMemberPage />, produk: <ProdukPage /> }}
        />
      ),
      access: 'protected',
    },
  ],
};
