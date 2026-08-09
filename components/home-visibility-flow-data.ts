import type { AiEngineKey } from '@/components/ai-engines';

export const HOME_ENGINE_LABELS: Record<AiEngineKey, string> = {
  chatgpt: 'ChatGPT',
  google: 'Google',
  claude: 'Claude',
  copilot: 'Bing Copilot',
  perplexity: 'Perplexity',
};

export const HOME_EXAMPLE_SCORES: Record<AiEngineKey, number> = {
  chatgpt: 78,
  google: 68,
  claude: 71,
  copilot: 64,
  perplexity: 64,
};

export const HOME_EXAMPLE_LABEL = 'Example data';
export const HOME_EXAMPLE_FINDING = 'Their service pages answer the buyer question more directly.';
export const HOME_EXAMPLE_ACTION = 'Next: improve 3 priority pages \u00B7 verify on the next run';
