import { describe, expect, it } from 'vitest';
import {
  SAMPLE_TEMPLATE_VARS,
  escapeHtml,
  renderOutreachTemplate,
} from './outreach-templates';

const vars = {
  ...SAMPLE_TEMPLATE_VARS,
  name: 'Alex <script>alert(1)</script>',
  company: 'A & B "IT"',
};

describe('renderOutreachTemplate (spec §9)', () => {
  it('substitutes variables in subject and body', () => {
    const out = renderOutreachTemplate(
      {
        subjectTemplate: '{{domain}} scored {{score}}/100',
        bodyFormat: 'text',
        bodyTemplate: 'Hi {{name}},\n\nYour site {{domain}} is at {{score}} ({{grade}}).\n\nSee {{report_url}}',
      },
      SAMPLE_TEMPLATE_VARS,
      'https://x.com/px'
    );
    expect(out.subject).toBe('acme-it.example scored 61/100');
    expect(out.html).toContain('Hi Alex,');
    expect(out.html).toContain('61 (D)');
    expect(out.html).toContain('https://getgeopulse.com/results/sample');
  });

  it('escapes variable values in both text and html formats', () => {
    for (const bodyFormat of ['text', 'html'] as const) {
      const out = renderOutreachTemplate(
        { subjectTemplate: 's', bodyFormat, bodyTemplate: 'Hello {{name}} from {{company}}' },
        vars,
        'https://x.com/px'
      );
      expect(out.html).not.toContain('<script>alert(1)</script>');
      expect(out.html).toContain('&lt;script&gt;');
      expect(out.html).toContain('A &amp; B &quot;IT&quot;');
    }
  });

  it('escapes admin text bodies but keeps admin html bodies as-is', () => {
    const textOut = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'text', bodyTemplate: 'A <b>bold</b> claim' },
      SAMPLE_TEMPLATE_VARS,
      'px'
    );
    expect(textOut.html).toContain('A &lt;b&gt;bold&lt;/b&gt; claim');

    const htmlOut = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'html', bodyTemplate: '<h1>Custom {{domain}}</h1>' },
      SAMPLE_TEMPLATE_VARS,
      'px'
    );
    expect(htmlOut.html).toContain('<h1>Custom acme-it.example</h1>');
  });

  it('renders top_issues as structured HTML with escaped content', () => {
    const out = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'text', bodyTemplate: '{{top_issues}}' },
      SAMPLE_TEMPLATE_VARS,
      'px'
    );
    expect(out.html).toContain('<ul');
    expect(out.html).toContain('AI retrieval agent access');
  });

  it('always wraps in the brand shell with the tracking pixel', () => {
    const out = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'text', bodyTemplate: 'x' },
      SAMPLE_TEMPLATE_VARS,
      'https://x.com/api/outreach/open/abc'
    );
    expect(out.html).toContain('GEO-PULSE');
    expect(out.html).toContain('https://x.com/api/outreach/open/abc');
  });

  it('carries the CASL unsubscribe link and sender identification in every templated send (issue #97)', () => {
    const out = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'html', bodyTemplate: '<h1>fully custom</h1>' },
      SAMPLE_TEMPLATE_VARS,
      'px',
      'https://x.com/api/outreach/unsubscribe/p-1'
    );
    expect(out.html).toContain('https://x.com/api/outreach/unsubscribe/p-1');
    expect(out.html).toContain('Unsubscribe');
    expect(out.html).toContain('Montréal, Québec, Canada');
  });

  it('paragraphizes plain-text bodies on blank lines', () => {
    const out = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'text', bodyTemplate: 'One.\n\nTwo.\nStill two.' },
      SAMPLE_TEMPLATE_VARS,
      'px'
    );
    expect(out.html).toContain('<p>One.</p>');
    expect(out.html).toContain('<p>Two.<br/>Still two.</p>');
  });
});

describe('escapeHtml', () => {
  it('escapes the five specials', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});
