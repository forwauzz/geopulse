import { describe, expect, it } from 'vitest';
import { messageFromScanError } from './scan-api-error';

describe('messageFromScanError', () => {
  it.each(['db_error', 'server_misconfigured', 'service_unavailable'])(
    'does not expose %s details',
    (code) => {
      expect(
        messageFromScanError({
          error: { code, message: 'private database/provider detail' },
        })
      ).toBe('The free audit is temporarily unavailable. Please try again shortly.');
    }
  );

  it('preserves actionable target-site failures', () => {
    expect(
      messageFromScanError({
        error: { code: 'scan_failed', message: 'The target site blocked the request.' },
      })
    ).toBe('scan_failed: The target site blocked the request.');
  });

  it('uses a safe fallback for malformed responses', () => {
    expect(messageFromScanError('<html>internal error</html>')).toBe(
      'The scan could not be completed. Please try again shortly.'
    );
  });
});
