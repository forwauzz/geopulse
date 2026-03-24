/**
 * LLM provider abstraction — scan engine uses the interface, not Gemini (SOLID / D).
 */

export type LLMConfidence = 'high' | 'medium' | 'low';

export interface LLMResult {
  passed: boolean;
  reasoning: string;
  confidence: LLMConfidence;
}

export interface LLMProvider {
  analyze(prompt: string, context: string): Promise<LLMResult>;
}
