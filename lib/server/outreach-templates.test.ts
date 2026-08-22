import { describe, expect, it } from 'vitest';
import {
  PRESET_OUTREACH_TEMPLATES,
  SAMPLE_TEMPLATE_VARS,
  escapeHtml,
  renderOutreachTemplate,
} from './outreach-templates';

describe('MSP baseline offer', () => {
  it('does not claim a scan or require scan-only merge fields before one exists', () => {
    const preset = PRESET_OUTREACH_TEMPLATES.find((template) => template.key === 'msp-evidence-first');
    expect(preset).toBeDefined();
    const copy = `${preset?.subject ?? ''}\n${preset?.body ?? ''}`;
    expect(copy).not.toMatch(/\{\{(?:score|grade|top_issues|report_url)\}\}/);
    expect(copy).not.toMatch(/we (?:ran|audited)|site scored/i);
    expect(copy).toContain('not a promise of rankings or citations');
    expect(copy).toContain('{{walkthrough_url}}');
  });
});

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

  it('resolves and embeds the configured inbox preview line', () => {
    const out = renderOutreachTemplate(
      {
        subjectTemplate: 'Your scan',
        previewText: 'A real public-site scan for {{domain}}—no PDF attached.',
        bodyFormat: 'text',
        bodyTemplate: 'Hi {{name}}',
      },
      SAMPLE_TEMPLATE_VARS,
      'px',
    );
    expect(out.previewText).toBe('A real public-site scan for acme-it.example—no PDF attached.');
    expect(out.html).toContain('display:none;max-height:0');
    expect(out.html).toContain('A real public-site scan for acme-it.example—no PDF attached.');
    expect(out.html).not.toContain('{{domain}}');
  });

  it('renders a bounded real-scan preview and a human CTA without exposing a raw URL', () => {
    const out = renderOutreachTemplate(
      {
        subjectTemplate: '{{company}}: your scan is ready',
        bodyFormat: 'text',
        bodyTemplate: 'Hi {{name}},\n\n{{scan_preview}}\n\n{{walkthrough_cta}}',
      },
      SAMPLE_TEMPLATE_VARS,
      'px',
      'https://getgeopulse.com/unsubscribe',
    );
    expect(out.html).toContain('61</span>');
    expect(out.html).toContain('Scanned URL:');
    expect(out.html).toContain('https://acme-it.example/');
    expect(out.html).toContain('20/24');
    expect(out.html).toContain('5/5');
    expect(out.html).toContain('100 vs 62');
    expect(out.html).toContain('AI Understanding &amp; Trust scored <strong>62/100</strong>');
    expect(out.html).toContain('A practical first pass');
    expect(out.html).toContain('Verify the change');
    expect(out.html).toContain('re-run acme-it.example');
    expect(out.html).toContain('full PDF is intentionally not attached');
    expect(out.html).toContain('>Review the scan with us</a>');
    expect(out.html).not.toContain(`<p>${SAMPLE_TEMPLATE_VARS.walkthroughUrl}</p>`);
    expect(out.html).toContain('https://www.instagram.com/get_geopulse/');
    expect(out.html).toContain('https://www.linkedin.com/company/143052018/');
    expect(out.html).toContain('https://getgeopulse.com/branding/email/instagram.png');
    expect(out.html).toContain('https://getgeopulse.com/branding/email/linkedin.png');
    expect(out.html).toContain('/team/elena-park.jpg');
  });

  it('always wraps in the brand shell with the tracking pixel', () => {
    const out = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'text', bodyTemplate: 'x' },
      SAMPLE_TEMPLATE_VARS,
      'https://x.com/api/outreach/open/abc'
    );
    expect(out.html).toContain('GEO-Pulse');
    expect(out.html).toContain('https://x.com/api/outreach/open/abc');
    expect(out.html).toContain('Regards,');
    expect(out.html.indexOf('AVIS DE CONFIDENTIALITÉ')).toBeLessThan(out.html.indexOf('CONFIDENTIALITY NOTICE'));
    expect(out.html).toContain('Politique de confidentialité / Privacy policy');
  });

  it('renders the report cover as a linked email-safe image', () => {
    const out = renderOutreachTemplate(
      { subjectTemplate: 's', bodyFormat: 'html', bodyTemplate: '<p>Hi {{name}},</p>{{report_thumbnail}}' },
      SAMPLE_TEMPLATE_VARS,
      'px',
    );
    expect(out.html).toContain(`<img src="${SAMPLE_TEMPLATE_VARS.reportThumbnailUrl}"`);
    expect(out.html).toContain(`href="${SAMPLE_TEMPLATE_VARS.reportUrl}"`);
    expect(out.html).toContain('Open your private 10-page audit');
    expect(out.html).not.toContain('{{report_thumbnail}}');
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
