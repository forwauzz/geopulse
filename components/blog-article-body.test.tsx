import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlogArticleBody } from './blog-article-body';

describe('BlogArticleBody', () => {
  it('downgrades markdown headings so articles do not introduce a second h1', () => {
    const html = renderToStaticMarkup(<BlogArticleBody markdown={'# Intro\n\n## Details'} />);

    expect(html).not.toContain('<h1');
    expect(html).toContain('<h2 id="intro">Intro</h2>');
    expect(html).toContain('<h3 id="details">Details</h3>');
  });
});
