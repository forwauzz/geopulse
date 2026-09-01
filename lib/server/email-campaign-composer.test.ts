import { describe, expect, it } from 'vitest';
import { createDraftContract, versionChecksum, type EmailCampaignV1 } from './email-campaign-contract';
import {
  campaignGreetingName,
  findLiteralTokens,
  renderCampaignPreview,
  unresolvedMergeFields,
  type PreviewContact,
} from './email-campaign-preview';
import {
  CAMPAIGN_FROM_ENV_KEY,
  CAMPAIGN_REPLY_TO_ENV_KEY,
  CAMPAIGN_SENDER_VERIFIED_ENV_KEY,
  resolveCampaignSender,
  resolveTestRecipients,
} from './email-campaign-sender';
import {
  interventionStatusFor,
  requiresCompleteEmailCampaignContract,
  saveEmailCampaign,
  saveValidatedEmailCampaign,
} from './email-campaign-store';
import { withResolvedSender } from './email-campaign-console';

const CONTACT: PreviewContact = {
  contactId: 'c1',
  email: 'ann@royco.ca',
  name: 'Ann Roy',
  company: 'Roy Co',
  companyDomain: 'royco.ca',
  personalizationReason: 'Published agency owner in the Montreal cohort.',
  personalizationSourceUrl: 'https://royco.ca/about',
};

function contract(body = 'Hi {{name}},\n\nReply with one client domain: {{walkthrough_url}}'): EmailCampaignV1 {
  return createDraftContract({
    campaignId: 'camp-1',
    interventionId: 'int-1',
    interventionKey: 'agency-reporting-montreal-v1',
    goal: {
      objective: 'o', buyer: 'b', offerKey: 'k', ctaGoal: 'c', owner: 'elena',
      meaningfulVariable: 'm', successCondition: 's', stopCondition: 'x', closureCondition: 'z', retryPolicy: 'r',
    },
    sender: {
      displayName: 'Elena at GEO-Pulse',
      fromAddressRef: CAMPAIGN_FROM_ENV_KEY,
      replyToRef: CAMPAIGN_REPLY_TO_ENV_KEY,
      authenticated: true,
      authenticationEvidence: 'verified',
    },
    segment: 'agency-ca-qc-montreal-published-2026-08',
    content: {
      templateId: null,
      templateVersion: 1,
      subject: 'AI visibility baseline for {{company}}',
      previewText: 'One client domain is enough.',
      bodyFormat: 'text',
      bodyTemplate: body,
      followUpSteps: [
        { subject: 'Re: follow-up', previewText: 'Still happy to run one.', bodyTemplate: 'Hi {{name}}, following up once.' },
        { subject: 'Closing the loop', previewText: 'Last note.', bodyTemplate: 'Hi {{name}}, last note on this.' },
      ],
    },
    tracking: { tags: [], utmSource: 'outreach', utmMedium: 'email', utmCampaign: 'agency-reporting-montreal-v1', utmContent: 'agency-reporting', utmTerm: null },
    schedule: { timezone: 'America/Toronto', sendWindowStartHour: 9, sendWindowEndHour: 17, startAt: null, spacingMinutes: 60, dailyCap: 25, maxSequenceSteps: 3, sequenceDelaysDays: [0, 4, 10] },
    nowIso: '2026-08-02T00:00:00.000Z',
  });
}

function jsonbRoundTrip<T>(value: T): T {
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  };
  return sortKeys(value) as T;
}

describe('preview uses the production renderer', () => {
  const preview = renderCampaignPreview({ contract: contract(), contact: CONTACT, appUrl: 'https://getgeopulse.com' });

  it('substitutes contact values into the subject and body', () => {
    expect(preview.subject).toBe('AI visibility baseline for Roy Co');
    expect(preview.html).toContain('Hi Ann,');
    expect(preview.html).not.toContain('Hi Ann Roy');
  });

  it('carries the brand shell, unsubscribe path, and campaign UTM values', () => {
    expect(preview.html).toContain(preview.unsubscribeUrl);
    expect(preview.html).toContain('utm_campaign=agency-reporting-montreal-v1');
    expect(preview.html).toContain('utm_content=agency-reporting-step-1');
  });

  it('leaves no literal merge tokens in rendered output', () => {
    expect(findLiteralTokens(preview.html)).toEqual([]);
  });

  it('uses preview-scoped identifiers so a preview never allocates a real send', () => {
    expect(preview.unsubscribeUrl).toContain('/preview-c1');
    expect(preview.links.every((link) => !link.includes('/api/outreach/open/') || link.includes('preview-'))).toBe(true);
  });
});

describe('campaignGreetingName', () => {
  it('normalizes common CRM name formats to a first name', () => {
    expect(campaignGreetingName('Uzziel Tamon')).toBe('Uzziel');
    expect(campaignGreetingName('Dr. Uzziel Tamon')).toBe('Uzziel');
    expect(campaignGreetingName('Tamon, Uzziel')).toBe('Uzziel');
    expect(campaignGreetingName('  Uzziel   Tamon  ')).toBe('Uzziel');
  });
});

describe('unresolved personalization is unmistakable', () => {
  it('reports a contact with no name even though the renderer would say "there"', () => {
    const anonymous: PreviewContact = { ...CONTACT, name: null };
    const unresolved = unresolvedMergeFields({ contract: contract(), contact: anonymous });
    expect(unresolved).toContainEqual({
      field: 'name',
      why: 'this contact has no name; the renderer would substitute a generic fallback',
    });
    // The rendered mail still looks fine — which is exactly why the check cannot rely on it.
    const preview = renderCampaignPreview({ contract: contract(), contact: anonymous, appUrl: 'https://getgeopulse.com' });
    expect(preview.html).toContain('there');
    expect(preview.unresolved).toHaveLength(1);
  });

  it('reports scan-dependent fields when no scan exists for the recipient', () => {
    const unresolved = unresolvedMergeFields({
      contract: contract('Your score is {{score}} — see {{report_url}}'),
      contact: CONTACT,
    });
    expect(unresolved.map((item) => item.field).sort()).toEqual(['report_url', 'score']);
    expect(unresolved[0]?.why).toContain('requires a completed scan');
  });

  it('reports an unknown merge field', () => {
    const unresolved = unresolvedMergeFields({ contract: contract('Hi {{first_name}}'), contact: CONTACT });
    expect(unresolved).toContainEqual({ field: 'first_name', why: 'not a supported merge field — it would ship literally' });
  });

  it('reports missing personalization evidence', () => {
    const unresolved = unresolvedMergeFields({
      contract: contract('Because {{personalization_reason}} ({{personalization_source_url}})'),
      contact: { ...CONTACT, personalizationReason: null, personalizationSourceUrl: null },
    });
    expect(unresolved.map((item) => item.field).sort()).toEqual(['personalization_reason', 'personalization_source_url']);
  });
});

describe('sender resolution is fail-closed', () => {
  it('is unauthenticated when nothing is configured', () => {
    const sender = resolveCampaignSender({});
    expect(sender.authenticated).toBe(false);
    expect(sender.resolvedFromAddress).toBeNull();
    expect(sender.blockingReason).toContain('not configured');
  });

  it('refuses another business\'s sending identity', () => {
    const sender = resolveCampaignSender({
      [CAMPAIGN_FROM_ENV_KEY]: 'info@techehealth.com',
      [CAMPAIGN_REPLY_TO_ENV_KEY]: 'info@techehealth.com',
      [CAMPAIGN_SENDER_VERIFIED_ENV_KEY]: 'true',
    });
    expect(sender.authenticated).toBe(false);
    expect(sender.blockingReason).toContain('belongs to another business');
  });

  it('refuses a non-GEO-Pulse domain', () => {
    const sender = resolveCampaignSender({
      [CAMPAIGN_FROM_ENV_KEY]: 'elena@somewhere-else.com',
      [CAMPAIGN_REPLY_TO_ENV_KEY]: 'elena@somewhere-else.com',
      [CAMPAIGN_SENDER_VERIFIED_ENV_KEY]: 'true',
    });
    expect(sender.authenticated).toBe(false);
    expect(sender.blockingReason).toContain('not an approved GEO-Pulse sending domain');
  });

  it('refuses a configured but unverified domain', () => {
    const sender = resolveCampaignSender({
      [CAMPAIGN_FROM_ENV_KEY]: 'elena@getgeopulse.com',
      [CAMPAIGN_REPLY_TO_ENV_KEY]: 'elena@getgeopulse.com',
    });
    expect(sender.authenticated).toBe(false);
    expect(sender.blockingReason).toContain('SPF, DKIM, and DMARC');
  });

  it('authenticates only a verified GEO-Pulse identity, and never persists the literal address', () => {
    const sender = resolveCampaignSender({
      [CAMPAIGN_FROM_ENV_KEY]: 'elena@getgeopulse.com',
      [CAMPAIGN_REPLY_TO_ENV_KEY]: 'elena@getgeopulse.com',
      [CAMPAIGN_SENDER_VERIFIED_ENV_KEY]: 'true',
    });
    expect(sender.authenticated).toBe(true);
    expect(sender.fromAddressRef).toBe(CAMPAIGN_FROM_ENV_KEY);
    expect(sender.resolvedFromAddress).toBe('elena@getgeopulse.com');
  });

  it('takes internal test recipients from configuration only', () => {
    expect(resolveTestRecipients({ GEOPULSE_CAMPAIGN_TEST_RECIPIENTS: 'a@getgeopulse.com, bad-entry , b@getgeopulse.com' }))
      .toEqual(['a@getgeopulse.com', 'b@getgeopulse.com']);
    expect(resolveTestRecipients({})).toEqual([]);
  });
});

describe('sender state follows configuration, not the stored contract', () => {
  it('a contract saved while authenticated reads as unavailable once the identity is gone', () => {
    const stored = contract();
    expect(stored.sender.authenticated).toBe(true);
    const resolved = withResolvedSender(stored, resolveCampaignSender({}));
    expect(resolved.sender.authenticated).toBe(false);
    expect(versionChecksum(resolved)).toBe(versionChecksum(stored));
  });
});

describe('store', () => {
  it('maps preparation states onto the coarse intervention status', () => {
    expect(interventionStatusFor('draft')).toBe('planned');
    expect(interventionStatusFor('scheduled')).toBe('planned');
    expect(interventionStatusFor('running')).toBe('running');
    expect(interventionStatusFor('stopped')).toBe('stopped');
  });

  it('allows incremental preparation states but requires completeness after the internal test', () => {
    expect(requiresCompleteEmailCampaignContract('draft')).toBe(false);
    expect(requiresCompleteEmailCampaignContract('audience_ready')).toBe(false);
    expect(requiresCompleteEmailCampaignContract('content_ready')).toBe(false);
    expect(requiresCompleteEmailCampaignContract('qa_ready')).toBe(false);
    expect(requiresCompleteEmailCampaignContract('test_passed')).toBe(true);
    expect(requiresCompleteEmailCampaignContract('scheduled')).toBe(true);
  });

  it('refuses to store a test-passed contract that does not satisfy the contract', () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) } as never;
    return saveValidatedEmailCampaign(supabase, { ...contract(), state: 'test_passed' }).then((result) => {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('contract_invalid');
        expect(result.issues.some((issue) => issue.startsWith('audience.audienceId'))).toBe(true);
      }
    });
  });

  it('stores every version under the intervention metadata without losing history', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  id: 'int-1',
                  metadata: {
                    owner: 'elena',
                    email_campaign: { current: 1, versions: { '1': { ...contract(), state: 'scheduled' } } },
                  },
                },
              }),
            }),
          }),
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as never;

    const v2 = { ...contract(), version: 2, content: { ...contract().content, subject: 'Second version' } };
    const result = await saveValidatedEmailCampaign(supabase, v2);
    expect(result.ok).toBe(true);

    const stored = (updates[0]?.metadata as { email_campaign: { current: number; versions: Record<string, EmailCampaignV1> } }).email_campaign;
    expect(stored.current).toBe(2);
    expect(Object.keys(stored.versions).sort()).toEqual(['1', '2']);
    expect(stored.versions['1']?.state).toBe('scheduled');
    // Unrelated intervention metadata survives.
    expect((updates[0]?.metadata as Record<string, unknown>).owner).toBe('elena');
  });

  it('refuses to overwrite a locked version in place', async () => {
    const locked = { ...contract(), state: 'scheduled' as const };
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'int-1', metadata: { email_campaign: { current: 1, versions: { '1': locked } } } },
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      },
    } as never;

    // Asserted on the storage primitive: `saveValidatedEmailCampaign` would reject this fixture at
    // the validation layer first, which would hide whether the lock guard itself works.
    const result = await saveEmailCampaign(supabase, { ...locked, updatedAt: '2026-09-09T00:00:00.000Z' });
    expect(result).toEqual({ ok: false, reason: 'version_is_locked' });
  });

  it('allows a locked version to move to stopped without changing its immutable campaign payload', async () => {
    const locked = { ...contract(), state: 'scheduled' as const };
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'int-1', metadata: { email_campaign: { current: 1, versions: { '1': locked } } } },
              }),
            }),
          }),
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as never;

    const stopped = {
      ...locked,
      state: 'stopped' as const,
      governance: { ...locked.governance, stopReason: 'zero qualified replies' },
      updatedAt: '2026-09-09T00:00:00.000Z',
    };
    const result = await saveEmailCampaign(supabase, stopped);

    expect(result).toEqual({ ok: true });
    const stored = (updates[0]?.metadata as { email_campaign: { versions: Record<string, EmailCampaignV1> } })
      .email_campaign.versions['1'];
    expect(stored?.state).toBe('stopped');
    expect(stored?.governance.stopReason).toBe('zero qualified replies');
  });

  it('allows a JSONB-loaded locked version to stop after object keys are reordered', async () => {
    const sender = resolveCampaignSender({
      [CAMPAIGN_FROM_ENV_KEY]: 'reports@getgeopulse.com',
      [CAMPAIGN_REPLY_TO_ENV_KEY]: 'reports@getgeopulse.com',
      [CAMPAIGN_SENDER_VERIFIED_ENV_KEY]: 'true',
    });
    const locked = jsonbRoundTrip(withResolvedSender(
      { ...contract(), state: 'scheduled' as const },
      sender,
    ));
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'int-1', metadata: { email_campaign: { current: 1, versions: { '1': locked } } } },
              }),
            }),
          }),
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as never;

    const resolved = withResolvedSender(locked, sender);
    const stopped = {
      ...resolved,
      state: 'stopped' as const,
      governance: { ...resolved.governance, stopReason: 'zero qualified replies' },
      updatedAt: '2026-09-09T00:00:00.000Z',
    };
    const result = await saveEmailCampaign(supabase, stopped);

    expect(result).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
  });

  it('accepts an idempotent stopped-state save on the current immutable version', async () => {
    const stopped = {
      ...contract(),
      state: 'stopped' as const,
      governance: { ...contract().governance, stopReason: 'zero qualified replies' },
    };
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'int-1', metadata: { email_campaign: { current: 1, versions: { '1': stopped } } } },
              }),
            }),
          }),
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as never;

    const result = await saveEmailCampaign(supabase, {
      ...stopped,
      updatedAt: '2026-09-09T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
  });

  it('still rejects a locked lifecycle update that changes internal campaign scope', async () => {
    const locked = { ...contract(), state: 'scheduled' as const };
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'int-1', metadata: { email_campaign: { current: 1, versions: { '1': locked } } } },
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      },
    } as never;

    const result = await saveEmailCampaign(supabase, {
      ...locked,
      state: 'stopped',
      goal: { ...locked.goal, buyer: 'a different buyer' },
      governance: { ...locked.governance, stopReason: 'zero qualified replies' },
      updatedAt: '2026-09-09T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: false, reason: 'version_is_locked' });
  });
});
