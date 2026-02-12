import { env } from '../config/env';
import { ModelScanResult, SupportedModel, supportedModels } from '../types/models';
import { queryModel } from './aiProviders.service';

const extractRank = (text: string, companyName: string): number | null => {
  const normalized = text.toLowerCase();
  if (!normalized.includes(companyName.toLowerCase())) return null;

  const hashRankMatch = text.match(/#\s?(\d{1,2})/);
  if (hashRankMatch?.[1]) return Number(hashRankMatch[1]);

  const orderedMatch = text.match(/(?:^|\n|\s)(\d{1,2})[.)]\s+[^\n]*?/);
  if (orderedMatch?.[1]) return Number(orderedMatch[1]);

  return 1;
};

const toSnippet = (text: string): string | null => {
  if (!text) return null;
  return text.slice(0, 240);
};

const runSingleModelScan = async (
  model: SupportedModel,
  query: string,
): Promise<ModelScanResult> => {
  try {
    const rawText = await queryModel(model, query);
    const mentioned = rawText.toLowerCase().includes(env.companyName.toLowerCase());

    return {
      model,
      mentioned,
      rank: extractRank(rawText, env.companyName),
      snippet: toSnippet(rawText),
      rawText,
    };
  } catch (error) {
    return {
      model,
      mentioned: false,
      rank: null,
      snippet: null,
      rawText: '',
      error: error instanceof Error ? error.message : 'Unexpected model error',
    };
  }
};

export const runModelScan = async (
  query: string,
  models?: SupportedModel[],
): Promise<ModelScanResult[]> => {
  const selectedModels = models?.length
    ? models.filter((model): model is SupportedModel => supportedModels.includes(model))
    : [...supportedModels];

  const results = await Promise.all(selectedModels.map((model) => runSingleModelScan(model, query)));
  return results;
};
