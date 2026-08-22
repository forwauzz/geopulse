import { describe, expect, it } from 'vitest';
import { lifecycleEligibilityReason, renderLifecycleTemplate, resolveLifecycleProviderStatus } from './lifecycle-email';

describe('lifecycle email contract', () => {
  it('renders known variables and fails closed to an empty value for missing data', () => {
    expect(renderLifecycleTemplate('Hello {{ first_name }} — {{domain}} {{missing}}', {
      first_name: 'Uzziel', domain: 'example.com',
    })).toBe('Hello Uzziel — example.com ');
  });

  it('renders repeated tokens deterministically', () => {
    expect(renderLifecycleTemplate('{{name}}/{{name}}', { name: 'GEO-Pulse' })).toBe('GEO-Pulse/GEO-Pulse');
  });

  it('re-checks category preferences and suppression scopes before delivery', () => {
    expect(lifecycleEligibilityReason({ category: 'transactional', templateEnabled: true, transactionalEnabled: false })).toBe('transactional_preference_disabled');
    expect(lifecycleEligibilityReason({ category: 'marketing', templateEnabled: true, marketingEnabled: false })).toBe('marketing_preference_disabled');
    expect(lifecycleEligibilityReason({ category: 'marketing', templateEnabled: true, suppressionScopes: ['marketing'] })).toBe('recipient_suppressed');
    expect(lifecycleEligibilityReason({ category: 'transactional', templateEnabled: true, suppressionScopes: ['marketing'] })).toBeNull();
    expect(lifecycleEligibilityReason({ category: 'transactional', templateEnabled: true, suppressionScopes: ['all'] })).toBe('recipient_suppressed');
    expect(lifecycleEligibilityReason({ category: 'transactional', templateEnabled: false })).toBe('template_disabled');
  });

  it('never lets a late delivered event overwrite bounce or complaint evidence', () => {
    expect(resolveLifecycleProviderStatus('sent', 'email.delivered')).toEqual({ nextStatus: 'delivered', ignored: false });
    expect(resolveLifecycleProviderStatus('bounced', 'email.delivered')).toEqual({ nextStatus: 'delivered', ignored: true });
    expect(resolveLifecycleProviderStatus('complained', 'email.delivered')).toEqual({ nextStatus: 'delivered', ignored: true });
    expect(resolveLifecycleProviderStatus('delivered', 'email.bounced')).toEqual({ nextStatus: 'bounced', ignored: false });
    expect(resolveLifecycleProviderStatus('sent', 'email.opened')).toEqual({ nextStatus: null, ignored: false });
  });
});
