import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_SETTINGS,
  describeOverrides,
  diffAgainstInherited,
  isLockedSection,
  parseReportSettings,
  resolveReportSettings,
  sectionRenderState,
  type ReportSettings,
} from './report-settings';

describe('parseReportSettings', () => {
  it('returns an empty override for a scope that has stored nothing', () => {
    expect(parseReportSettings(undefined)).toEqual({});
    expect(parseReportSettings(null)).toEqual({});
    expect(parseReportSettings({})).toEqual({});
  });

  it('degrades to an empty override rather than throwing on a malformed value', () => {
    expect(parseReportSettings('not an object')).toEqual({});
    expect(parseReportSettings({ layout: 'sideways' })).toEqual({});
    expect(parseReportSettings({ sections: 'nope' })).toEqual({});
  });

  it('keeps only the fields that were set', () => {
    expect(parseReportSettings({ sections: { crawlDetail: true } })).toEqual({
      sections: { crawlDetail: true },
    });
  });

  it('drops keys it does not recognise instead of failing the whole read', () => {
    const parsed = parseReportSettings({
      layout: 'per_engine',
      sections: { crawlDetail: true, sectionRetiredLastYear: true },
    });
    expect(parsed.layout).toBe('per_engine');
    expect(parsed.sections).toEqual({ crawlDetail: true });
  });
});

describe('resolveReportSettings', () => {
  it('returns the shipped default when no level overrides anything', () => {
    expect(resolveReportSettings(null, null)).toEqual(DEFAULT_REPORT_SETTINGS);
  });

  it('lets the agency change a field without touching the rest', () => {
    const resolved = resolveReportSettings({ sections: { crawlDetail: true } });
    expect(resolved.sections.crawlDetail).toBe(true);
    expect(resolved.sections.categoryBreakdown).toBe(
      DEFAULT_REPORT_SETTINGS.sections.categoryBreakdown
    );
  });

  it('lets the client win over the agency for the field it sets', () => {
    const resolved = resolveReportSettings(
      { sections: { whoIsWinning: true, trackedCompetitorSet: true } },
      { sections: { whoIsWinning: false } }
    );
    expect(resolved.sections.whoIsWinning).toBe(false);
    expect(resolved.sections.trackedCompetitorSet).toBe(true);
  });

  it('keeps a client following the agency for fields the client did not set', () => {
    // The point of sparse storage: change the agency default later and the client still follows.
    const before = resolveReportSettings({ sections: { crawlDetail: false } }, { layout: 'per_engine' });
    const after = resolveReportSettings({ sections: { crawlDetail: true } }, { layout: 'per_engine' });
    expect(before.sections.crawlDetail).toBe(false);
    expect(after.sections.crawlDetail).toBe(true);
    expect(after.layout).toBe('per_engine');
  });

  it('ignores a stored false for a locked section at any level', () => {
    const resolved = resolveReportSettings(
      { sections: { scopeStatement: false } },
      { sections: { methodology: false } }
    );
    expect(resolved.sections.scopeStatement).toBe(true);
    expect(resolved.sections.methodology).toBe(true);
  });

  it('resolves engines independently of sections', () => {
    const resolved = resolveReportSettings({ engines: { claude: false, copilot: false } });
    expect(resolved.engines.claude).toBe(false);
    expect(resolved.engines.chatgpt).toBe(true);
  });
});

describe('describeOverrides', () => {
  it('reports nothing overridden for an empty level', () => {
    expect(describeOverrides({}).count).toBe(0);
    expect(describeOverrides(null).count).toBe(0);
  });

  it('counts each explicitly set field once', () => {
    const map = describeOverrides({
      layout: 'per_engine',
      sections: { whoIsWinning: false, trackedCompetitorSet: true },
    });
    expect(map.count).toBe(3);
    expect(map.layout).toBe(true);
    expect(map.sections.whoIsWinning).toBe(true);
    expect(map.sections.categoryBreakdown).toBeUndefined();
  });

  it('counts a field set to the same value as the parent — it is still explicitly owned here', () => {
    expect(describeOverrides({ sections: { categoryBreakdown: true } }).count).toBe(1);
  });
});

describe('diffAgainstInherited', () => {
  const inherited = DEFAULT_REPORT_SETTINGS;

  it('writes nothing when the desired state matches what is inherited', () => {
    expect(diffAgainstInherited(inherited, inherited)).toEqual({});
  });

  it('writes only the fields that differ', () => {
    const desired: ReportSettings = {
      ...inherited,
      sections: { ...inherited.sections, crawlDetail: true },
    };
    expect(diffAgainstInherited(desired, inherited)).toEqual({ sections: { crawlDetail: true } });
  });

  it('never stores a locked section', () => {
    const desired: ReportSettings = {
      ...inherited,
      sections: { ...inherited.sections, scopeStatement: false, methodology: false },
    };
    expect(diffAgainstInherited(desired, inherited)).toEqual({});
  });

  it('round-trips through resolve', () => {
    const desired: ReportSettings = {
      layout: 'per_engine',
      engines: { ...inherited.engines, claude: false },
      sections: { ...inherited.sections, trackedCompetitorSet: true },
    };
    const diff = diffAgainstInherited(desired, inherited);
    expect(resolveReportSettings(diff)).toEqual(desired);
  });
});

describe('sectionRenderState', () => {
  it('hides a section that is switched off, whether or not data exists', () => {
    expect(sectionRenderState(false, true)).toBe('hidden');
    expect(sectionRenderState(false, false)).toBe('hidden');
  });

  it('renders a section that is on and has data', () => {
    expect(sectionRenderState(true, true)).toBe('render');
  });

  it('marks a section that is on but has no data as empty, not hidden', () => {
    // Trend over time in the first measured month: the agency ticked it, so it must be
    // visibly pending rather than silently absent.
    expect(sectionRenderState(true, false)).toBe('empty');
  });
});

describe('isLockedSection', () => {
  it('locks the two sections that describe the boundary of the measurement', () => {
    expect(isLockedSection('scopeStatement')).toBe(true);
    expect(isLockedSection('methodology')).toBe(true);
    expect(isLockedSection('categoryBreakdown')).toBe(false);
  });
});
