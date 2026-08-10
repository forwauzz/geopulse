import { describe, expect, it } from 'vitest';
import { renderLifecycleTemplate } from './lifecycle-email';

describe('lifecycle email contract', () => {
  it('renders known variables and fails closed to an empty value for missing data', () => {
    expect(renderLifecycleTemplate('Hello {{ first_name }} — {{domain}} {{missing}}', {
      first_name: 'Uzziel', domain: 'example.com',
    })).toBe('Hello Uzziel — example.com ');
  });

  it('renders repeated tokens deterministically', () => {
    expect(renderLifecycleTemplate('{{name}}/{{name}}', { name: 'GEO-Pulse' })).toBe('GEO-Pulse/GEO-Pulse');
  });
});
