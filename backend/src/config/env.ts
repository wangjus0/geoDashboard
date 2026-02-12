import dotenv from 'dotenv';

dotenv.config();

const fallbackCompany = 'Ark Marketing';

export const env = {
  port: Number(process.env.PORT || 3000),
  companyName: process.env.COMPANY_NAME || fallbackCompany,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};
