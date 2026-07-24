import { describe, expect, it } from 'vitest';
import { parsePromptCsv } from './prompt-csv';

describe('parsePromptCsv', () => {
  it('imports the supplied Stability-style Prompt column', () => {
    const csv = [
      'No,Prompt,Avg. rank,Visibility',
      '1,vestibular therapy Vancouver,3.75,66.67',
      '2,"clinic for chronic dizziness, Vancouver",1,80',
    ].join('\n');
    expect(parsePromptCsv(csv)).toEqual([
      'vestibular therapy Vancouver',
      'clinic for chronic dizziness, Vancouver',
    ]);
  });

  it('also accepts a simple one-question-per-line file', () => {
    expect(parsePromptCsv('best dentist Toronto\nbest dentist Toronto\nemergency dentist Toronto')).toEqual([
      'best dentist Toronto',
      'emergency dentist Toronto',
    ]);
  });
});
