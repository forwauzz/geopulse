import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlogArticleBody } from './blog-article-body';

describe('BlogArticleBody', () => {
  it('keeps article section headings as h2 beneath the page h1', () => {
    const html = renderToStaticMarkup(<BlogArticleBody markdown={'## What the audit checks\n\n### Crawl access'} />);

    expect(html).not.toContain('<h1');
    expect(html).toContain('<h2 id="what-the-audit-checks">What the audit checks</h2>');
    expect(html).toContain('<h3 id="crawl-access">Crawl access</h3>');
  });

  it('keeps internal conversion links in the same tab and isolates external sources', () => {
    const html = renderToStaticMarkup(
      <BlogArticleBody
        markdown={
          '[Run the free audit](/ai-visibility-audit) and read [Google guidance](https://developers.google.com/search/docs/appearance/ai-features).'
        }
      />
    );

    expect(html).toContain('<a href="/ai-visibility-audit">Run the free audit</a>');
    expect(html).toContain(
      '<a href="https://developers.google.com/search/docs/appearance/ai-features" target="_blank" rel="noreferrer">Google guidance</a>'
    );
  });
});
