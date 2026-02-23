import dotenv from 'dotenv';
import path from 'path';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const fallbackCompany = 'Ark Marketing';

export const env = {
  port: Number(process.env.PORT || 3000),
  companyName: process.env.COMPANY_NAME || fallbackCompany,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || '',
};
