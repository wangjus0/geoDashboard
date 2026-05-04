import { Router, type Request, type RequestHandler, type Response } from 'express';
import { env } from '../config/env.js';
import {
  type AuthenticatedUser,
  getSessionCookieName,
  getSessionDurationSeconds,
  readSessionFromRequest,
  serializeSessionCookie,
} from '../utils/auth.js';
import {
  deactivateAccessUser,
  getAccessUserByEmail,
  hasAnyAccessUsers,
  listAccessUsers,
  upsertAccessUser,
  type DashboardAccessRole,
} from '../services/accessControl.service.js';
import { createLoginCode, isEmailDeliveryConfigured, verifyLoginCode } from '../services/emailAuth.service.js';
import {
  getSupabaseAzureAuthorizeUrl,
  getSupabaseUserFromAccessToken,
  isSupabaseAuthConfigured,
  requestSupabaseMagicLink,
} from '../services/supabaseAuth.service.js';

const router = Router();

const isSecureCookie = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

const setSessionCookie = (res: Response, user: AuthenticatedUser) => {
  const cookieValue = serializeSessionCookie(user);
  res.cookie(getSessionCookieName(), cookieValue, {
    httpOnly: true,
    secure: isSecureCookie,
    sameSite: 'lax',
    maxAge: getSessionDurationSeconds() * 1000,
    path: '/',
  });
};

const getMagicLinkRedirectUrl = (_req: Request) => {
  const redirectUrl = env.publicAppUrl || 'http://localhost:5173';
  return redirectUrl.endsWith('/') ? redirectUrl : `${redirectUrl}/`;
};

const requireAdmin: RequestHandler = (req, res, next) => {
  const user = readSessionFromRequest(req);

  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }

  next();
};

router.get('/session', (req, res) => {
  const user = readSessionFromRequest(req);

  if (!user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  res.status(200).json({ user });
});

router.get('/config', async (_req, res) => {
  const supabaseConfigured = isSupabaseAuthConfigured();
  res.status(200).json({
    authMethod: env.authMethod,
    azureConfigured: supabaseConfigured,
    emailConfigured: env.authMethod === 'supabase_magic_link'
      ? supabaseConfigured
      : isEmailDeliveryConfigured() || (!process.env.VERCEL && process.env.NODE_ENV !== 'production'),
    supabaseConfigured,
    domainConfigured: await hasAnyAccessUsers(),
  });
});

router.get('/azure/start', async (req, res) => {
  if (!isSupabaseAuthConfigured()) {
    res.status(500).json({ error: 'Supabase Auth is not configured.' });
    return;
  }

  if (!(await hasAnyAccessUsers())) {
    res.status(500).json({ error: 'Dashboard email domain access is not configured.' });
    return;
  }

  res.redirect(302, getSupabaseAzureAuthorizeUrl(getMagicLinkRedirectUrl(req)));
});

router.post('/email/request-code', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const accessUser = await getAccessUserByEmail(email);
  if (!accessUser) {
    res.status(200).json({ sent: true });
    return;
  }

  try {
    const result = await createLoginCode(accessUser.email);
    res.status(200).json({
      sent: true,
      developmentCode: result.developmentCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send access code.';
    res.status(500).json({ error: message });
  }
});

router.post('/email/verify-code', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

  if (!email || !code) {
    res.status(400).json({ error: 'Email and code are required.' });
    return;
  }

  const accessUser = await getAccessUserByEmail(email);
  if (!accessUser) {
    res.status(403).json({ error: 'Access code is invalid or expired.' });
    return;
  }

  const isValid = await verifyLoginCode(accessUser.email, code);
  if (!isValid) {
    res.status(403).json({ error: 'Access code is invalid or expired.' });
    return;
  }

  const user: AuthenticatedUser = {
    id: accessUser.id,
    name: accessUser.displayName || accessUser.email,
    email: accessUser.email,
    role: accessUser.role,
  };
  setSessionCookie(res, user);
  res.status(200).json({ user });
});

router.post('/supabase/request-link', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  if (!isSupabaseAuthConfigured()) {
    res.status(500).json({ error: 'Supabase Auth is not configured.' });
    return;
  }

  const accessUser = await getAccessUserByEmail(email);
  if (!accessUser) {
    res.status(200).json({ sent: true });
    return;
  }

  try {
    await requestSupabaseMagicLink(accessUser.email, getMagicLinkRedirectUrl(req));
    res.status(200).json({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send magic link.';
    res.status(500).json({ error: message });
  }
});

router.post('/supabase/session', async (req, res) => {
  const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';

  if (!accessToken) {
    res.status(400).json({ error: 'Missing Supabase access token.' });
    return;
  }

  try {
    const supabaseUser = await getSupabaseUserFromAccessToken(accessToken);
    const accessUser = await getAccessUserByEmail(supabaseUser.email);
    if (!accessUser) {
      res.status(403).json({ error: 'This email is not approved for dashboard access.' });
      return;
    }

    const user: AuthenticatedUser = {
      id: accessUser.id,
      name: accessUser.displayName || supabaseUser.name,
      email: accessUser.email,
      picture: supabaseUser.picture,
      role: accessUser.role,
    };
    setSessionCookie(res, user);
    res.status(200).json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify Supabase session.';
    res.status(403).json({ error: message });
  }
});

router.get('/access-users', requireAdmin, async (_req, res) => {
  const users = await listAccessUsers();
  res.status(200).json({ users });
});

router.post('/access-users', requireAdmin, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
  const role = req.body?.role === 'admin' ? 'admin' : 'viewer';

  try {
    const user = await upsertAccessUser(email, displayName, role as DashboardAccessRole);
    res.status(200).json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to add access user.';
    res.status(400).json({ error: message });
  }
});

router.delete('/access-users/:id', requireAdmin, async (req, res) => {
  await deactivateAccessUser(req.params.id);
  res.status(204).send();
});

router.post('/logout', (_req, res) => {
  res.clearCookie(getSessionCookieName(), {
    httpOnly: true,
    secure: isSecureCookie,
    sameSite: 'lax',
    path: '/',
  });
  res.status(204).send();
});

export default router;
