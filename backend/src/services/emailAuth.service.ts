import crypto from 'crypto';
import type { Tables } from '../types/database.types.js';
import { env } from '../config/env.js';
import { getPool } from './queryStore.service.js';

type LoginCodeRow = Pick<Tables<'dashboard_login_codes'>, 'id' | 'code_hash' | 'attempts'>;

const CODE_ATTEMPT_LIMIT = 5;
const CODE_WINDOW_MINUTES = 15;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hashCode = (email: string, code: string) =>
  crypto.createHmac('sha256', env.sessionSecret).update(`${normalizeEmail(email)}:${code}`).digest('hex');

const compareHash = (expected: string, actual: string) => {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

const generateCode = () => crypto.randomInt(100000, 1000000).toString();

export const isEmailDeliveryConfigured = () => Boolean(env.resendApiKey && env.accessEmailFrom);

const sendEmailCode = async (email: string, code: string): Promise<void> => {
  if (!isEmailDeliveryConfigured()) {
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
      return;
    }
    throw new Error('Email delivery is not configured.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.accessEmailFrom,
      to: email,
      subject: 'Your Geo Dashboard access code',
      text: `Your Geo Dashboard access code is ${code}. It expires in ${env.loginCodeTtlMinutes} minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
          <p>Your Geo Dashboard access code is:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
          <p>This code expires in ${env.loginCodeTtlMinutes} minutes.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error('Unable to send access code email.');
  }
};

export const createLoginCode = async (email: string): Promise<{ sent: boolean; developmentCode?: string }> => {
  const normalizedEmail = normalizeEmail(email);
  const db = getPool();

  const recentCodes = await db.query<{ count: string }>(
    `
      select count(*)::text as count
      from public.dashboard_login_codes
      where email = $1
        and created_at > now() - ($2::text || ' minutes')::interval
    `,
    [normalizedEmail, CODE_WINDOW_MINUTES],
  );

  if (Number(recentCodes.rows[0]?.count || 0) >= CODE_ATTEMPT_LIMIT) {
    throw new Error('Too many access code requests. Try again later.');
  }

  const code = generateCode();
  const codeHash = hashCode(normalizedEmail, code);
  const ttl = Number.isFinite(env.loginCodeTtlMinutes) && env.loginCodeTtlMinutes > 0
    ? Math.min(env.loginCodeTtlMinutes, 60)
    : 10;

  await db.query(
    `
      update public.dashboard_login_codes
      set consumed_at = now()
      where email = $1
        and consumed_at is null
    `,
    [normalizedEmail],
  );

  await db.query(
    `
      insert into public.dashboard_login_codes (email, code_hash, expires_at)
      values ($1, $2, now() + ($3::text || ' minutes')::interval)
    `,
    [normalizedEmail, codeHash, ttl],
  );

  await sendEmailCode(normalizedEmail, code);

  return {
    sent: isEmailDeliveryConfigured(),
    developmentCode: isEmailDeliveryConfigured() ? undefined : code,
  };
};

export const verifyLoginCode = async (email: string, code: string): Promise<boolean> => {
  const normalizedEmail = normalizeEmail(email);
  const db = getPool();
  const result = await db.query<LoginCodeRow>(
    `
      select id, code_hash, attempts
      from public.dashboard_login_codes
      where email = $1
        and consumed_at is null
        and expires_at > now()
      order by created_at desc
      limit 1
    `,
    [normalizedEmail],
  );

  const row = result.rows[0];
  if (!row || row.attempts >= CODE_ATTEMPT_LIMIT) {
    return false;
  }

  const providedHash = hashCode(normalizedEmail, code.trim());
  const isValid = compareHash(row.code_hash, providedHash);

  if (isValid) {
    await db.query(
      `
        update public.dashboard_login_codes
        set consumed_at = now()
        where id = $1
      `,
      [row.id],
    );
    return true;
  }

  await db.query(
    `
      update public.dashboard_login_codes
      set attempts = attempts + 1
      where id = $1
    `,
    [row.id],
  );

  return false;
};
