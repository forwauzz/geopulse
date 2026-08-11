import { describe, expect, it } from 'vitest';
import {
  engagementEvidenceKey,
  isVerifiedExternalAuditRequest,
  uniqueReportViewScanIds,
} from './engagement-evidence';

describe('isVerifiedExternalAuditRequest', () => {
  it('rejects the observed internal campaign-preview batch', () => {
    for (const domain of [
      'hoopdesk.com', 'canadadirect.ca', 'delvinia.com', 'estateably.com',
      'altavia.co', 'webtmize.com', 'therundigital.com', 'sdpn.ca',
    ]) {
      expect(isVerifiedExternalAuditRequest({
        domain,
        runSource: 'admin_manual',
        reportEmail: null,
      })).toBe(false);
    }
  });

  it('rejects founder QA even when it used the public flow', () => {
    expect(isVerifiedExternalAuditRequest({
      domain: 'jnmanagedservices.com',
      runSource: 'public_self_serve',
      reportEmail: 'uzzielt@techehealthservices.com',
    })).toBe(false);
  });

  it('accepts an external domain-matched request or exact outreach prospect', () => {
    expect(isVerifiedExternalAuditRequest({
      domain: 'buyer.ca',
      runSource: 'public_self_serve',
      reportEmail: 'owner@buyer.ca',
    })).toBe(true);
    expect(isVerifiedExternalAuditRequest({
      domain: 'buyer.ca',
      runSource: 'public_self_serve',
      reportEmail: 'owner@gmail.com',
      prospectEmails: ['owner@gmail.com'],
    })).toBe(true);
  });
});

describe('uniqueReportViewScanIds', () => {
  it('collapses the two server serves produced by one report page load', () => {
    expect(uniqueReportViewScanIds([
      { data: { scanId: 'big-fox-scan' } },
      { data: { scanId: 'big-fox-scan' } },
      { data: { scanId: 'another-scan' } },
      { data: {} },
    ])).toEqual(['big-fox-scan', 'another-scan']);
  });
});

describe('engagementEvidenceKey', () => {
  it('normalizes recipient identity for prospect-specific audit attribution', () => {
    expect(engagementEvidenceKey('scan-1', ' Owner@Buyer.ca ')).toBe('scan-1:owner@buyer.ca');
  });
});
