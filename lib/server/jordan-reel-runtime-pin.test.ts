import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const runtime = 'hyperframes@0.7.107';

describe('Jordan Reel production runtime pin', () => {
  it('uses the same verified HyperFrames version in the composition, renderer, and CI browser', () => {
    const files = [
      'reels/jordan-kinetic/package.json',
      'scripts/render-jordan-reel.mjs',
      '.github/workflows/jordan-reels.yml',
    ];

    for (const file of files) {
      expect(readFileSync(resolve(file), 'utf8'), file).toContain(runtime);
    }
  });

  it('pins the production reviewer to the current multimodal model', () => {
    expect(readFileSync(resolve('wrangler.jsonc'), 'utf8')).toContain(
      '"JORDAN_REEL_REVIEW_MODEL": "gemini-3.5-flash"'
    );
  });
});
