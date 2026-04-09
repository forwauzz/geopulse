import { describe, expect, it } from 'vitest';
import { buildReportPath, buildReportUrl } from './report-route';

describe('report route helpers', () => {
  it('builds the canonical report path', () => {
    expect(buildReportPath('9fa517bd-cb3f-4072-9110-ec629ea1bd1f')).toBe(
      '/results/9fa517bd-cb3f-4072-9110-ec629ea1bd1f/report'
    );
  });

  it('builds the canonical report url without duplicate slashes', () => {
    expect(buildReportUrl('https://getgeopulse.com/', '9fa517bd-cb3f-4072-9110-ec629ea1bd1f')).toBe(
      'https://getgeopulse.com/results/9fa517bd-cb3f-4072-9110-ec629ea1bd1f/report'
    );
  });
});
