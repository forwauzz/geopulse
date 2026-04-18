import { describe, expect, it } from 'vitest';
import { buildTextSample } from './parse-signals';

describe('buildTextSample', () => {
  it('strips script and style noise from the extracted text sample', () => {
    const html = `
      <html>
        <body>
          <style>.hero{font-size:48px}</style>
          <script>window.__BOOT__ = {"foo":"bar"}</script>
          <main>
            <h1>Linear</h1>
            <p>The system for product development.</p>
          </main>
        </body>
      </html>
    `;

    expect(buildTextSample(html)).toBe('Linear The system for product development.');
  });

  it('strips comments, noscript, template, and svg blocks from the extracted text sample', () => {
    const html = `
      <html>
        <body>
          <!-- tracking -->
          <noscript>Fallback tracking pixel</noscript>
          <template><div>Hidden template content</div></template>
          <svg><text>Icon label</text></svg>
          <section>
            <h2>About</h2>
            <p>Modern software teams use this platform to plan and ship work.</p>
          </section>
        </body>
      </html>
    `;

    expect(buildTextSample(html)).toBe(
      'About Modern software teams use this platform to plan and ship work.'
    );
  });
});
