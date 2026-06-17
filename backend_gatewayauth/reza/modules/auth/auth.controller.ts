import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { successEnvelope } from '../../../src/shared/errors/envelope.js';
import { issueCaptcha } from '../../../src/shared/lib/captcha-store.js';
import { destroyAllSessionsForUser } from '../../../src/shared/lib/session-store.js';
import { authRequired } from '../../../src/shared/middleware/auth-required.js';
import { writeAudit } from '../logging/audit.service.js';
import { LoginInputSchema, MfaCodeSchema, MfaVerifyLoginSchema } from './auth.schema.js';
import { loginService, logoutService, mfaVerifyLoginService } from './auth.service.js';
import {
  changePasswordService,
  getProfileService,
  updateProfileService,
} from './profile.service.js';
import {
  beginEnrollment,
  confirmEnrollment,
  disableMfa,
  getMfaStatus,
  getRecoveryCodesSummary,
  regenerateRecoveryCodes,
} from './mfa.service.js';
import { listMySessions } from './sessions.service.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---- Public ----------------------------------------------------------
  app.get('/captcha', async (req, reply) => {
    const issued = await issueCaptcha();
    return reply.status(200).send(
      successEnvelope(req.id as string, issued, 'Captcha diterbitkan'),
    );
  });

  app.post('/login', async (req, reply) => {
    const input = LoginInputSchema.parse(req.body);
    const result = await loginService(app, req, input);
    return reply.status(200).send(
      successEnvelope(req.id as string, result, 'Login berhasil'),
    );
  });

  // ---- Protected -------------------------------------------------------
  app.get('/me', { preHandler: [authRequired] }, async (req, reply) => {
    const s = req.session!;
    return reply.status(200).send(
      successEnvelope(
        req.id as string,
        {
          user: {
            id: s.user_id,
            email: s.email,
            full_name: s.full_name,
            user_type: s.user_type,
            status: s.status,
          },
          session: {
            id: s.session_id,
            created_at: s.created_at,
            expires_at: s.expires_at,
            ip: s.ip,
            user_agent: s.user_agent,
          },
        },
        'OK',
      ),
    );
  });

  app.post('/logout', { preHandler: [authRequired] }, async (req, reply) => {
    const session = req.session!;
    const result = await logoutService(session.session_id);
    writeAudit(req, {
      action: 'auth.logout',
      userId: session.user_id,
    });
    return reply.status(200).send(
      successEnvelope(req.id as string, result, 'Logout berhasil'),
    );
  });

  // ---- Profile ---------------------------------------------------------
  app.get('/profile', { preHandler: [authRequired] }, async (req, reply) => {
    const profile = await getProfileService(req.session!.user_id);
    return reply.status(200).send(
      successEnvelope(req.id as string, { profile }, 'OK'),
    );
  });

  app.patch('/profile', { preHandler: [authRequired] }, async (req, reply) => {
    const profile = await updateProfileService(
      req.session!.user_id,
      req.session!.session_id,
      req.body,
    );
    return reply.status(200).send(
      successEnvelope(req.id as string, { profile }, 'Profil berhasil diperbarui'),
    );
  });

  app.post('/change-password', { preHandler: [authRequired] }, async (req, reply) => {
    const clientKey = req.gwClient?.clientKey;
    if (!clientKey) {
      throw new AppError('header_unauthorized', {
        message: 'Konteks client gateway tidak terdeteksi.',
        code: 'CLIENT_CONTEXT_MISSING',
      });
    }
    const result = await changePasswordService(req.session!.user_id, clientKey, req.body);
    writeAudit(req, {
      action: 'auth.password.change',
      userId: req.session!.user_id,
    });
    return reply.status(200).send(
      successEnvelope(req.id as string, result, 'Password berhasil diganti'),
    );
  });

  // ---- Sessions (current user) -----------------------------------------
  app.get('/sessions', { preHandler: [authRequired] }, async (req, reply) => {
    const s = req.session!;
    const result = await listMySessions(s.user_id, s.session_id);
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });

  // ---- MFA: status + enrollment + disable ------------------------------
  app.get('/mfa/status', { preHandler: [authRequired] }, async (req, reply) => {
    const result = await getMfaStatus(req.session!.user_id);
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });

  app.post('/mfa/enroll/begin', { preHandler: [authRequired] }, async (req, reply) => {
    const s = req.session!;
    const label = s.email; // email user dipakai sebagai account label di authenticator
    const result = await beginEnrollment(s.user_id, label);
    writeAudit(req, { action: 'auth.mfa.enroll_begin', userId: s.user_id });
    return reply.status(200).send(
      successEnvelope(req.id as string, result, 'Pendaftaran MFA dimulai'),
    );
  });

  app.post('/mfa/enroll/confirm', { preHandler: [authRequired] }, async (req, reply) => {
    const parsed = MfaCodeSchema.parse(req.body);
    const result = await confirmEnrollment(req.session!.user_id, parsed.code);
    writeAudit(req, {
      action: 'auth.mfa.enroll_success',
      userId: req.session!.user_id,
    });
    return reply.status(200).send(
      successEnvelope(req.id as string, result, 'MFA berhasil diaktifkan'),
    );
  });

  app.post('/mfa/disable', { preHandler: [authRequired] }, async (req, reply) => {
    const parsed = MfaCodeSchema.parse(req.body);
    const result = await disableMfa(req.session!.user_id, parsed.code);
    writeAudit(req, {
      action: 'auth.mfa.disabled',
      userId: req.session!.user_id,
    });
    return reply.status(200).send(
      successEnvelope(req.id as string, result, 'MFA berhasil dinonaktifkan'),
    );
  });

  // ---- MFA: verify login challenge (public, signed seperti /login) ----
  // Body: { mfa_token, code? | recovery_code? } — exact one.
  app.post('/mfa/verify', async (req, reply) => {
    const parsed = MfaVerifyLoginSchema.parse(req.body);
    const result = await mfaVerifyLoginService(app, req, {
      mfaToken: parsed.mfa_token,
      code: parsed.code,
      recoveryCode: parsed.recovery_code,
    });
    return reply.status(200).send(
      successEnvelope(req.id as string, { mfa_required: false, ...result }, 'Login berhasil'),
    );
  });

  // ---- MFA: recovery codes ----------------------------------------------
  app.get('/mfa/recovery-codes/summary', { preHandler: [authRequired] }, async (req, reply) => {
    const result = await getRecoveryCodesSummary(req.session!.user_id);
    return reply.status(200).send(successEnvelope(req.id as string, result, 'OK'));
  });

  app.post('/mfa/recovery-codes/regenerate', { preHandler: [authRequired] }, async (req, reply) => {
    const parsed = MfaCodeSchema.parse(req.body);
    const result = await regenerateRecoveryCodes(req.session!.user_id, parsed.code);
    writeAudit(req, {
      action: 'auth.mfa.recovery_codes_regenerated',
      userId: req.session!.user_id,
    });
    return reply.status(200).send(
      successEnvelope(req.id as string, result, 'Recovery codes baru di-generate'),
    );
  });

  // ---- Admin: revoke all sessions of a user (remote logout) -----------
  app.post<{ Params: { userId: string } }>(
    '/admin/sessions/:userId/revoke',
    { preHandler: [authRequired] },
    async (req, reply) => {
      const requester = req.session!;
      if (requester.user_type !== 'superadmin' && requester.user_type !== 'admin') {
        throw new AppError('header_unauthorized', {
          message: 'Hanya admin/superadmin yang boleh revoke session user lain.',
          code: 'FORBIDDEN',
        });
      }
      const revoked = await destroyAllSessionsForUser(req.params.userId);
      writeAudit(req, {
        action: 'auth.admin.revoke_sessions',
        userId: requester.user_id,
      });
      return reply.status(200).send(
        successEnvelope(
          req.id as string,
          { revoked_count: revoked, user_id: req.params.userId },
          `${revoked} sesi user dicabut`,
        ),
      );
    },
  );
};
