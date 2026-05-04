import crypto from 'crypto';
import type { Request } from 'express';
import { env } from '../config/env.js';

const SESSION_COOKIE_NAME = 'ark_dashboard_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  id: string;
  name: string;
  role?: 'admin' | 'viewer';
  picture?: string;
  email?: string;
  exp: number;
};

export type AuthenticatedUser = {
  id: string;
  name: string;
  role?: 'admin' | 'viewer';
  email?: string;
  picture?: string;
};

const toBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

const fromBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const createSignature = (payload: string) => {
  return crypto.createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');
};

export const serializeSessionCookie = (user: AuthenticatedUser) => {
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    picture: user.picture,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

const parseCookieHeader = (cookieHeader?: string) => {
  if (!cookieHeader) {
    return {} as Record<string, string>;
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((accumulator, piece) => {
    const [name, ...rest] = piece.trim().split('=');
    if (!name || rest.length === 0) {
      return accumulator;
    }

    accumulator[name] = decodeURIComponent(rest.join('='));
    return accumulator;
  }, {});
};

export const readSessionFromRequest = (req: Request): AuthenticatedUser | null => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawSession = cookies[SESSION_COOKIE_NAME];

  if (!rawSession) {
    return null;
  }

  const [encodedPayload, signature] = rawSession.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createSignature(encodedPayload);
  const providedSignatureBuffer = Buffer.from(signature, 'base64url');
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'base64url');

  if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    return null;
  }

  if (!payload.id || !payload.name || !payload.exp) {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    role: payload.role,
    email: payload.email,
    picture: payload.picture,
  };
};

export const getSessionCookieName = () => SESSION_COOKIE_NAME;

export const getSessionDurationSeconds = () => SESSION_DURATION_SECONDS;
