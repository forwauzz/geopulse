import { describe, expect, it } from 'vitest';
import { formatStartupSlackMessage } from './startup-slack-message';

describe('startup slack message formatter', () => {
  it('formats audit payload with bullets and markdown link', () => {
    const message = formatStartupSlackMessage({
      startup_workspace_id: 'ws-1',
      destination_id: 'dest-1',
      event_type: 'new_audit_ready',
      site_domain: 'alie.com',
      score: 76,
      score_delta: 4,
      summary_bullets: ['Fix heading hierarchy', 'Compress hero image', 'Add schema markup'],
      report_url: 'https://app.example.com/dashboard/startup?startupWorkspace=ws-1',
      markdown_url: 'https://files.example.com/report.md',
      sent_by_user_id: 'user-1',
    });

    expect(message).toContain('Audit ready');
    expect(message).toContain('Score: 76/100 (delta: +4)');
    expect(message).toContain('Top actions:');
    expect(message).toContain('- Fix heading hierarchy');
    expect(message).toContain('Markdown: https://files.example.com/report.md');
  });

  it('clamps bullets and omits markdown when null', () => {
    const message = formatStartupSlackMessage({
      startup_workspace_id: 'ws-1',
      destination_id: 'dest-1',
      event_type: 'plan_ready',
      site_domain: 'alie.com',
      score: null,
      score_delta: null,
      summary_bullets: ['one', 'two', 'three', 'four'],
      report_url: 'https://app.example.com/dashboard/startup?startupWorkspace=ws-1',
      markdown_url: null,
      sent_by_user_id: 'user-1',
    });

    expect(message).toContain('Implementation plan ready');
    expect(message).toContain('Score: n/a (delta: n/a)');
    expect(message).toContain('- one');
    expect(message).toContain('- three');
    expect(message).not.toContain('- four');
    expect(message).not.toContain('Markdown:');
  });
});
