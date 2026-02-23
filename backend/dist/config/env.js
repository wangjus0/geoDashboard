"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const fallbackCompany = 'Ark Marketing';
exports.env = {
    port: Number(process.env.PORT || 3000),
    companyName: process.env.COMPANY_NAME || fallbackCompany,
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    databaseUrl: process.env.DATABASE_URL || '',
};
