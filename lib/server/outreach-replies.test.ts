import { describe, expect, it } from 'vitest';
import {
  classifyOutreachReply,
  normalizeSenderEmail,
} from './outreach-replies';

describe('normalizeSenderEmail', () => {
  it('extracts and normalizes a mailbox from a display-name sender', () => {
    expect(normalizeSenderEmail('Alex Rivera <Alex@Example.com>')).toBe('alex@example.com');
    expect(normalizeSenderEmail('not an email')).toBeNull();
  });
});

describe('classifyOutreachReply', () => {
  const classify = (text: string, sender = 'buyer@example.com') =>
    classifyOutreachReply({ sender, subject: '', text });

  it('routes explicit positive intent', () => {
    expect(classify('This sounds useful. Can we schedule a walkthrough?')).toBe('positive');
  });

  it('puts consent withdrawal ahead of other intent', () => {
    expect(classify('Not interested. Please remove me from this list.')).toBe('unsubscribed');
  });

  it('pauses out-of-office replies instead of treating them as buyer intent', () => {
    expect(classify('Automatic reply: I am out of the office this week.')).toBe('out_of_office');
  });

  it('separates wrong-person and ordinary negative replies', () => {
    expect(classify('I am not the right person. Contact our marketing lead instead.')).toBe(
      'wrong_person'
    );
    expect(classify('No thanks, this is not a fit for us.')).toBe('not_interested');
  });

  it('ignores automated delivery traffic and sends ambiguous human replies to review', () => {
    expect(classify('Delivery status notification', 'mailer-daemon@example.com')).toBe('automated');
    expect(classify('Can you clarify which page you checked?')).toBe('neutral');
  });
});
