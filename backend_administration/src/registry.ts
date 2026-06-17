import type { FastifyInstance } from 'fastify';
import { auditModule } from '../reza/modules/audit/index.js';
import { loggingModule } from '../reza/modules/logging/index.js';
import { logsModule } from '../reza/modules/logs/index.js';
import { produkModule } from '../reza/modules/produk/index.js';
import { roleModule } from '../reza/modules/role/index.js';
import { userModule } from '../reza/modules/user/index.js';

interface BackendModule {
  name: string;
  owner: string;
  register: (app: FastifyInstance) => Promise<void>;
}

// logging didaftarkan PERTAMA supaya hook onRequest/onSend menangkap juga
// request ke endpoint modul lain.
export const modules: BackendModule[] = [loggingModule, auditModule, logsModule, produkModule, roleModule, userModule];

export async function registerAllModules(app: FastifyInstance): Promise<void> {
  for (const m of modules) {
    await m.register(app);
    app.log.info({ module: m.name, owner: m.owner }, 'Module registered');
  }
}
