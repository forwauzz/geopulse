import { describe, expect, it } from 'vitest';
import {
  buildGpmRunKey,
  resolveGpmPlatformModelMap,
  resolveGpmWindowDate,
} from './geo-performance-schedule';

// ── resolveGpmWindowDate ──────────────────────────────────────────────────────

describe('resolveGpmWindowDate', () => {
  it('returns YYYY-MM for monthly cadence', () => {
    const date = new Date('2026-04-22T10:00:00Z');
    expect(resolveGpmWindowDate('monthly', date)).toBe('2026-04');
  });

  it('returns same monthly window for any day in the month', () => {
    expect(resolveGpmWindowDate('monthly', new Date('2026-04-01T00:00:00Z'))).toBe('2026-04');
    expect(resolveGpmWindowDate('monthly', new Date('2026-04-30T23:59:59Z'))).toBe('2026-04');
  });

  it('returns correct month boundary for January vs December', () => {
    expect(resolveGpmWindowDate('monthly', new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(resolveGpmWindowDate('monthly', new Date('2025-12-31T00:00:00Z'))).toBe('2025-12');
  });

  it('returns YYYY-WNN for weekly cadence', () => {
    // 2026-04-22 is ISO week 17
    const result = resolveGpmWindowDate('weekly', new Date('2026-04-22T00:00:00Z'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns the same weekly window for all days in the same ISO week', () => {
    // ISO week starts Monday — 2026-04-20 (Mon) through 2026-04-26 (Sun) are all week 17
    const monday = resolveGpmWindowDate('weekly', new Date('2026-04-20T00:00:00Z'));
    const sunday = resolveGpmWindowDate('weekly', new Date('2026-04-26T00:00:00Z'));
    expect(monday).toBe(sunday);
  });

  it('returns different weekly windows for consecutive weeks', () => {
    const week17 = resolveGpmWindowDate('weekly', new Date('2026-04-20T00:00:00Z'));
    const week18 = resolveGpmWindowDate('weekly', new Date('2026-04-27T00:00:00Z'));
    expect(week17).not.toBe(week18);
  });

  it('returns YYYY-WNN for biweekly cadence', () => {
    const result = resolveGpmWindowDate('biweekly', new Date('2026-04-22T00:00:00Z'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('maps consecutive weeks to the same biweekly window', () => {
    // weeks 17 and 18 should map to the same biweekly window
    const week17 = resolveGpmWindowDate('biweekly', new Date('2026-04-20T00:00:00Z')); // ISO W17
    const week18 = resolveGpmWindowDate('biweekly', new Date('2026-04-27T00:00:00Z')); // ISO W18
    expect(week17).toBe(week18);
  });

  it('maps weeks 2 apart to different biweekly windows', () => {
    const block1 = resolveGpmWindowDate('biweekly', new Date('2026-04-20T00:00:00Z')); // W17
    const block2 = resolveGpmWindowDate('biweekly', new Date('2026-05-04T00:00:00Z')); // W19
    expect(block1).not.toBe(block2);
  });

  it('biweekly window always starts at an odd week number', () => {
    for (let weekOffset = 0; weekOffset < 10; weekOffset++) {
      const date = new Date('2026-01-05T00:00:00Z'); // week 2
      date.setUTCDate(date.getUTCDate() + weekOffset * 7);
      const window = resolveGpmWindowDate('biweekly', date);
      const weekNum = parseInt(window.split('-W')[1]!, 10);
      expect(weekNum % 2).toBe(1); // always odd
    }
  });
});

// ── buildGpmRunKey ────────────────────────────────────────────────────────────

describe('buildGpmRunKey', () => {
  it('returns a colon-delimited key with gpm prefix', () => {
    const key = buildGpmRunKey('config-123', 'chatgpt', '2026-04');
    expect(key).toBe('gpm:config-123:chatgpt:2026-04');
  });

  it('produces different keys for different platforms', () => {
    const chatgpt = buildGpmRunKey('config-123', 'chatgpt', '2026-04');
    const gemini = buildGpmRunKey('config-123', 'gemini', '2026-04');
    expect(chatgpt).not.toBe(gemini);
  });

  it('produces different keys for different window dates', () => {
    const april = buildGpmRunKey('config-123', 'chatgpt', '2026-04');
    const may = buildGpmRunKey('config-123', 'chatgpt', '2026-05');
    expect(april).not.toBe(may);
  });

  it('produces different keys for different config IDs', () => {
    const config1 = buildGpmRunKey('config-aaa', 'gemini', '2026-W17');
    const config2 = buildGpmRunKey('config-bbb', 'gemini', '2026-W17');
    expect(config1).not.toBe(config2);
  });
});

// ── resolveGpmPlatformModelMap ────────────────────────────────────────────────

describe('resolveGpmPlatformModelMap', () => {
  it('uses defaults when env vars are absent', () => {
    const map = resolveGpmPlatformModelMap({});
    expect(map.chatgpt).toBe('gpt-4o-mini');
    expect(map.gemini).toBe('gemini-2.0-flash');
    expect(map.perplexity).toBe('llama-3.1-sonar-small-128k-online');
  });

  it('uses env var overrides when provided', () => {
    const map = resolveGpmPlatformModelMap({
      GPM_CHATGPT_MODEL_ID: 'gpt-4o',
      GPM_GEMINI_MODEL_ID: 'gemini-1.5-pro',
      GPM_PERPLEXITY_MODEL_ID: 'sonar-pro',
    });
    expect(map.chatgpt).toBe('gpt-4o');
    expect(map.gemini).toBe('gemini-1.5-pro');
    expect(map.perplexity).toBe('sonar-pro');
  });

  it('trims whitespace from env var values', () => {
    const map = resolveGpmPlatformModelMap({ GPM_CHATGPT_MODEL_ID: '  gpt-4o  ' });
    expect(map.chatgpt).toBe('gpt-4o');
  });
});
