import type { Tables } from '../types/database.types.js';
import { env } from '../config/env.js';
import { getPool } from './queryStore.service.js';

export type DashboardAccessRole = 'admin' | 'viewer';

export type DashboardAccessUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: DashboardAccessRole;
  isActive: boolean;
  source: 'database' | 'environment';
  createdAt: string | null;
};

type DashboardAccessUserRow = Pick<
  Tables<'dashboard_access_users'>,
  'id' | 'email' | 'display_name' | 'role' | 'is_active' | 'created_at'
>;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getEmailDomain = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

export const isAllowedDashboardEmail = (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return false;
  }

  const domain = getEmailDomain(normalizedEmail);
  return env.allowedEmailDomains.includes(domain);
};

const getEnvAccessEntries = (): DashboardAccessUser[] => {
  return env.dashboardAccessWhitelist
    .map((entry): DashboardAccessUser | null => {
      const withEmail = entry.match(/^(.*?)\s*<([^>]+)>$/);
      const rawName = withEmail?.[1]?.trim() || '';
      const email = normalizeEmail(withEmail?.[2] || (entry.includes('@') ? entry : ''));

      if (!isAllowedDashboardEmail(email)) {
        return null;
      }

      return {
        id: `env-${email.replace(/[^a-z0-9]+/g, '-')}`,
        email,
        displayName: rawName || null,
        role: env.dashboardAdminEmails.includes(email) ? 'admin' : 'viewer',
        isActive: true,
        source: 'environment',
        createdAt: null,
      };
    })
    .filter((user): user is DashboardAccessUser => Boolean(user));
};

const mapAccessUserRow = (row: DashboardAccessUserRow): DashboardAccessUser => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role as DashboardAccessRole,
  isActive: row.is_active,
  source: 'database',
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
});

const getAccessUserFromDatabase = async (email: string): Promise<DashboardAccessUser | null> => {
  const db = getPool();
  const result = await db.query<DashboardAccessUserRow>(
    `
      select id, email, display_name, role, is_active, created_at
      from public.dashboard_access_users
      where email = $1
        and is_active = true
      limit 1
    `,
    [normalizeEmail(email)],
  );

  return result.rows[0] ? mapAccessUserRow(result.rows[0]) : null;
};

export const getAccessUserByEmail = async (email: string): Promise<DashboardAccessUser | null> => {
  const normalizedEmail = normalizeEmail(email);
  if (!isAllowedDashboardEmail(normalizedEmail)) {
    return null;
  }

  const databaseUser = await getAccessUserFromDatabase(normalizedEmail);
  if (databaseUser) {
    return databaseUser;
  }

  const environmentUser = getEnvAccessEntries().find((user) => user.email === normalizedEmail);
  if (environmentUser) {
    return environmentUser;
  }

  return {
    id: normalizedEmail,
    email: normalizedEmail,
    displayName: null,
    role: env.dashboardAdminEmails.includes(normalizedEmail) ? 'admin' : 'viewer',
    isActive: true,
    source: 'environment',
    createdAt: null,
  };
};

export const hasAnyAccessUsers = async (): Promise<boolean> => {
  if (env.allowedEmailDomains.length > 0) {
    return true;
  }

  const db = getPool();
  const result = await db.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from public.dashboard_access_users
        where is_active = true
        limit 1
      ) as exists
    `,
  );

  return Boolean(result.rows[0]?.exists) || getEnvAccessEntries().length > 0;
};

export const listAccessUsers = async (): Promise<DashboardAccessUser[]> => {
  const db = getPool();
  const result = await db.query<DashboardAccessUserRow>(
    `
      select id, email, display_name, role, is_active, created_at
      from public.dashboard_access_users
      where is_active = true
      order by created_at desc, email asc
    `,
  );

  const databaseUsers = result.rows.map(mapAccessUserRow);
  const databaseEmails = new Set(databaseUsers.map((user) => user.email));
  const envUsers = getEnvAccessEntries().filter((user) => !databaseEmails.has(user.email));
  return [...databaseUsers, ...envUsers];
};

export const upsertAccessUser = async (
  email: string,
  displayName: string,
  role: DashboardAccessRole,
): Promise<DashboardAccessUser> => {
  const normalizedEmail = normalizeEmail(email);
  if (!isAllowedDashboardEmail(normalizedEmail)) {
    throw new Error('Enter an approved company email address.');
  }

  const db = getPool();
  const result = await db.query<DashboardAccessUserRow>(
    `
      insert into public.dashboard_access_users (email, display_name, role, is_active, updated_at)
      values ($1, nullif($2, ''), $3, true, now())
      on conflict (email) do update
      set
        display_name = excluded.display_name,
        role = excluded.role,
        is_active = true,
        updated_at = now()
      returning id, email, display_name, role, is_active, created_at
    `,
    [normalizedEmail, displayName.trim(), role],
  );

  return mapAccessUserRow(result.rows[0]);
};

export const deactivateAccessUser = async (id: string): Promise<void> => {
  const db = getPool();
  await db.query(
    `
      update public.dashboard_access_users
      set is_active = false, updated_at = now()
      where id = $1
    `,
    [id],
  );
};
