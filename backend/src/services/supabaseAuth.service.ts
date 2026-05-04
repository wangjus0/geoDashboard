import { env } from '../config/env.js';

type SupabaseErrorPayload = {
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

type SupabaseUserPayload = {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type SupabaseAuthUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
};

const normalizeSupabaseUrl = () => env.supabaseUrl.replace(/\/+$/, '');

const getMetadataString = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
};

const getSupabaseErrorMessage = async (response: Response, fallback: string) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null) as SupabaseErrorPayload | null;
    return payload?.error_description || payload?.message || payload?.msg || payload?.error || fallback;
  }

  const text = await response.text().catch(() => '');
  return text || fallback;
};

export const isSupabaseAuthConfigured = () => Boolean(env.supabaseUrl && env.supabasePublishableKey);

export const requestSupabaseMagicLink = async (email: string, redirectTo: string): Promise<void> => {
  if (!isSupabaseAuthConfigured()) {
    throw new Error('Supabase Auth is not configured.');
  }

  const endpoint = new URL(`${normalizeSupabaseUrl()}/auth/v1/otp`);
  endpoint.searchParams.set('redirect_to', redirectTo);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: env.supabasePublishableKey,
      Authorization: `Bearer ${env.supabasePublishableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      create_user: true,
    }),
  });

  if (!response.ok) {
    const message = await getSupabaseErrorMessage(response, 'Unable to send magic link.');
    throw new Error(message);
  }
};

export const getSupabaseAzureAuthorizeUrl = (redirectTo: string) => {
  if (!isSupabaseAuthConfigured()) {
    throw new Error('Supabase Auth is not configured.');
  }

  const endpoint = new URL(`${normalizeSupabaseUrl()}/auth/v1/authorize`);
  endpoint.searchParams.set('provider', 'azure');
  endpoint.searchParams.set('redirect_to', redirectTo);
  endpoint.searchParams.set('scopes', 'email');
  return endpoint.toString();
};

export const getSupabaseUserFromAccessToken = async (accessToken: string): Promise<SupabaseAuthUser> => {
  if (!isSupabaseAuthConfigured()) {
    throw new Error('Supabase Auth is not configured.');
  }

  const response = await fetch(`${normalizeSupabaseUrl()}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: env.supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const message = await getSupabaseErrorMessage(response, 'Supabase session is invalid or expired.');
    throw new Error(message);
  }

  const payload = await response.json() as SupabaseUserPayload;
  const email = payload.email?.trim().toLowerCase();
  if (!payload.id || !email) {
    throw new Error('Supabase session is missing a verified email.');
  }

  const name =
    getMetadataString(payload.user_metadata, 'full_name')
    || getMetadataString(payload.user_metadata, 'name')
    || email;
  const picture =
    getMetadataString(payload.user_metadata, 'avatar_url')
    || getMetadataString(payload.user_metadata, 'picture')
    || undefined;

  return {
    id: payload.id,
    email,
    name,
    picture,
  };
};
