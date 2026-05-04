"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const envPaths = [
    path_1.default.resolve(process.cwd(), '.env'),
    path_1.default.resolve(process.cwd(), 'backend/.env'),
];
for (const envPath of envPaths) {
    dotenv_1.default.config({ path: envPath });
}
const fallbackCompany = 'Ark Marketing';
const fallbackSessionSecret = 'dev-insecure-session-secret-change-me';
const parseCsv = (value) => (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
const queryStoreDriver = process.env.QUERY_STORE_DRIVER === 'local' ? 'local' : 'postgres';
const modelScanMode = process.env.MODEL_SCAN_MODE === 'mock' ? 'mock' : 'live';
const authMethod = ['azure_oauth', 'email_code', 'supabase_magic_link'].includes(process.env.AUTH_METHOD || '')
    ? process.env.AUTH_METHOD
    : 'azure_oauth';
const allowedEmailDomains = parseCsv(process.env.ALLOWED_EMAIL_DOMAINS || process.env.ALLOWED_EMAIL_DOMAIN)
    .map((domain) => domain.toLowerCase().replace(/^@/, ''));
exports.env = {
    port: Number(process.env.PORT || 3000),
    companyName: process.env.COMPANY_NAME || fallbackCompany,
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    databaseUrl: process.env.DATABASE_URL || '',
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY
        || process.env.SUPABASE_ANON_KEY
        || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
        || process.env.VITE_SUPABASE_ANON_KEY
        || '',
    sessionSecret: process.env.SESSION_SECRET || fallbackSessionSecret,
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    authMethod,
    allowedEmailDomains,
    dashboardAccessWhitelist: parseCsv(process.env.DASHBOARD_ACCESS_WHITELIST),
    dashboardAdminEmails: parseCsv(process.env.DASHBOARD_ADMIN_EMAILS).map((email) => email.toLowerCase()),
    resendApiKey: process.env.RESEND_API_KEY || '',
    accessEmailFrom: process.env.ACCESS_EMAIL_FROM || '',
    publicAppUrl: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
    loginCodeTtlMinutes: Number(process.env.LOGIN_CODE_TTL_MINUTES || 10),
    queryStoreDriver,
    modelScanMode,
    cronSecret: process.env.CRON_SECRET || '',
    dailyTrackingPromptLimit: Number(process.env.DAILY_TRACKING_PROMPT_LIMIT || 25),
};
