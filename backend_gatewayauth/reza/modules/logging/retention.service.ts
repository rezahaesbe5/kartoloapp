import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../src/shared/config/env.js';

export function purgeOldLogs(): void {
  if (!env.LOG_RETENTION_DAYS || env.LOG_RETENTION_DAYS <= 0) return;

  const retentionDays = env.LOG_RETENTION_DAYS;
  const now = new Date();
  
  [env.LOG_DIR, env.FRONTEND_LOG_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    
    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      const ageMs = now.getTime() - stats.mtime.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      
      if (ageDays > retentionDays) {
        fs.unlinkSync(filePath);
      }
    });
  });
}
