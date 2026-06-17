import type { FastifyInstance } from 'fastify';
import { authModule } from '../reza/modules/auth/index.js';
import { gatewayProxyModule } from '../reza/modules/gateway/index.js';
import { loggingModule } from '../reza/modules/logging/index.js';
import { portalModule } from '../reza/modules/portal/index.js';

interface BackendModule {
  name: string;
  owner: string;
  register: (app: FastifyInstance) => Promise<void>;
}

// loggingModule didaftarkan pertama: memasang hook global onRequest/onSend
// sehingga transaksi semua modul lain ikut tercatat.
// gatewayProxyModule terakhir: catch-all route untuk forwarding ke backend lain.
export const modules: BackendModule[] = [loggingModule, authModule, portalModule, gatewayProxyModule];

export async function registerAllModules(app: FastifyInstance): Promise<void> {
  for (const m of modules) {
    await m.register(app);
    app.log.info({ module: m.name, owner: m.owner }, 'Module registered');
  }
}
