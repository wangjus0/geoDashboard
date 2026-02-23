export const supportedModels = ['chatgpt', 'claude', 'gemini'] as const;

export type SupportedModel = (typeof supportedModels)[number];

export interface ModelScanResult {
  model: SupportedModel;
  mentioned: boolean;
  rank: number | null;
  snippet: string | null;
  rawText: string;
  error?: string;
}

export interface ScanRequestBody {
  query: string;
  models?: SupportedModel[];
}

export interface RecentQuery {
  id: string;
  text: string;
  timestamp: string;
  models: SupportedModel[];
  results: ModelScanResult[];
}

export interface QueryStore {
  recentQueries: RecentQuery[];
}

export interface ModelOverallProgress {
  model: SupportedModel;
  totalScans: number;
  mentionRate: number;
  rankedRate: number;
  averageRank: number | null;
}

export interface OverallProgressSummary {
  totalQueries: number;
  updatedAt: string | null;
  models: ModelOverallProgress[];
}
