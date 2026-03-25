import { describe, expect, it } from 'vitest';
import { parseReportQueueMessage } from './report-job';

describe('parseReportQueueMessage', () => {
  it('parses v1 payload', () => {
    const raw = JSON.stringify({
      v: 1,
      scanId: '550e8400-e29b-41d4-a716-446655440000',
      customerEmail: 'a@b.com',
      paymentId: '660e8400-e29b-41d4-a716-446655440001',
      stripeSessionId: 'cs_test_123',
    });
    expect(parseReportQueueMessage(raw)).toEqual({
      v: 1,
      scanId: '550e8400-e29b-41d4-a716-446655440000',
      customerEmail: 'a@b.com',
      paymentId: '660e8400-e29b-41d4-a716-446655440001',
      stripeSessionId: 'cs_test_123',
    });
  });

  it('parses v2 payload with scanRunId', () => {
    const raw = JSON.stringify({
      v: 2,
      scanId: '550e8400-e29b-41d4-a716-446655440000',
      scanRunId: '770e8400-e29b-41d4-a716-446655440002',
      customerEmail: 'a@b.com',
      paymentId: '660e8400-e29b-41d4-a716-446655440001',
      stripeSessionId: 'cs_test_123',
    });
    expect(parseReportQueueMessage(raw)).toEqual({
      v: 2,
      scanId: '550e8400-e29b-41d4-a716-446655440000',
      scanRunId: '770e8400-e29b-41d4-a716-446655440002',
      customerEmail: 'a@b.com',
      paymentId: '660e8400-e29b-41d4-a716-446655440001',
      stripeSessionId: 'cs_test_123',
    });
  });

  it('returns null for invalid json', () => {
    expect(parseReportQueueMessage('')).toBeNull();
    expect(parseReportQueueMessage('{}')).toBeNull();
  });
});
