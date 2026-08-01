import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_SETTINGS,
  LOCKED_SECTIONS,
  PLANNED_SECTIONS,
  SECTION_DESCRIPTORS,
  describeOverrides,
  diffAgainstInherited,
  isLockedSection,
  parseReportSettings,
  resolveReportSettings,
  sectionRenderState,
  sectionsForSurface,
  type ReportSettings,
} from './report-settings';

describe('section catalogue', () => {
  it('only lists sections that render on at least one surface', () => {
    for (const section of SECTION_DESCRIPTORS) {
      expect(section.surfaces.length).toBeGreaterThan(0);
    }
  });

  it('keeps unrendered ideas out of the settings surface entirely', () => {
    // A switch that silently does nothing is worse than no switch. These six were derived from
    // mockups and gate nothing today, so they must not appear as section keys.
    const keys = SECTION_DESCRIPTORS.map((s) => s.key) as string[];
    for (const dead of [
      'categoryBreakdown',
      'namedVsLinked',
      'trendOverTime',
      'averagePosition',
      'shareOfAnswers',
      'crawlDetail',
    ]) {
      expect(keys).not.toContain(dead);
    }
    expect(PLANNED_SECTIONS.length).toBe(6);
    for (const planned of PLANNED_SECTIONS) expect(planned.blockedBy).toBeTruthy();
  });

  it('splits sections by the surface they actually appear on', () => {
    const summary = sectionsForSurface('summary').map((s) => s.key);
    const pdf = sectionsForSurface('pdf').map((s) => s.key);
    // Verified in the live DOM and in a delivered PDF respectively.
    expect(summary).toContain('measurementReceipts');
    expect(pdf).not.toContain('measurementReceipts');
    expect(pdf).toContain('opportunities');
    expect(summary).not.toContain('opportunities');
  });

  it('marks competitor co-citations conditional, because it does not always render', () => {
    const section = SECTION_DESCRIPTORS.find((s) => s.key === 'competitorCoCitations');
    expect(section?.conditional).toBe(true);
  });

  it('declares pairings symmetrically', () => {
    for (const section of SECTION_DESCRIPTORS) {
      if (!section.pairedWith) continue;
      const partner = SECTION_DESCRIPTORS.find((s) => s.key === section.pairedWith);
      expect(partner?.pairedWith).toBe(section.key);
    }
  });

  it('defaults every section on, since each one renders today', () => {
    for (const section of SECTION_DESCRIPTORS) {
      expect(DEFAULT_REPORT_SETTINGS.sections[section.key]).toBe(true);
    }
  });
});

describe('parseReportSettings', () => {
  it('returns an empty override for a scope that has stored nothing', () => {
    expect(parseReportSettings(undefined)).toEqual({});
    expect(parseReportSettings(null)).toEqual({});
    expect(parseReportSettings({})).toEqual({});
  });

  it('degrades to an empty override rather than throwing on a malformed value', () => {
    expect(parseReportSettings('not an object')).toEqual({});
    expect(parseReportSettings({ layout: 'sideways' })).toEqual({});
  });

  it('drops keys retired by this reconciliation without discarding the rest', () => {
    // Anything saved by the previously deployed taxonomy must degrade cleanly.
    const parsed = parseReportSettings({
      layout: 'per_engine',
      sections: { crawlDetail: true, opportunities: false },
    });
    expect(parsed.layout).toBe('per_engine');
    expect(parsed.sections).toEqual({ opportunities: false });
  });
});

describe('resolveReportSettings', () => {
  it('returns the shipped default when no level overrides anything', () => {
    expect(resolveReportSettings(null, null)).toEqual(DEFAULT_REPORT_SETTINGS);
  });

  it('lets the client win over the agency for the field it sets', () => {
    const resolved = resolveReportSettings(
      { sections: { opportunities: true, promptPerformance: true } },
      { sections: { opportunities: false } }
    );
    expect(resolved.sections.opportunities).toBe(false);
    expect(resolved.sections.promptPerformance).toBe(true);
  });

  it('keeps a client following the agency for fields the client did not set', () => {
    const before = resolveReportSettings({ sections: { opportunities: false } }, { layout: 'per_engine' });
    const after = resolveReportSettings({ sections: { opportunities: true } }, { layout: 'per_engine' });
    expect(before.sections.opportunities).toBe(false);
    expect(after.sections.opportunities).toBe(true);
    expect(after.layout).toBe('per_engine');
  });

  it('ignores a stored false for a locked section at any level', () => {
    const resolved = resolveReportSettings(
      { sections: { scopeStatement: false } },
      { sections: { methodology: false } }
    );
    expect(resolved.sections.scopeStatement).toBe(true);
    expect(resolved.sections.methodology).toBe(true);
    expect(LOCKED_SECTIONS).toContain('scopeStatement');
  });

  it('keeps a paired section on when only its partner was switched off', () => {
    // They share a row on the summary; disabling one alone strands a half-width column.
    const resolved = resolveReportSettings({ sections: { competitorsTracked: false } });
    expect(resolved.sections.competitorsTracked).toBe(true);
    expect(resolved.sections.visibilityByEngine).toBe(true);
  });

  it('honours a pair switched off together', () => {
    const resolved = resolveReportSettings({
      sections: { competitorsTracked: false, visibilityByEngine: false },
    });
    expect(resolved.sections.competitorsTracked).toBe(false);
    expect(resolved.sections.visibilityByEngine).toBe(false);
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
      sections: { opportunities: false, promptPerformance: true },
    });
    expect(map.count).toBe(3);
    expect(map.layout).toBe(true);
    expect(map.sections.opportunities).toBe(true);
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
      sections: { ...inherited.sections, opportunities: false },
    };
    expect(diffAgainstInherited(desired, inherited)).toEqual({ sections: { opportunities: false } });
  });

  it('never stores a locked section', () => {
    const desired: ReportSettings = {
      ...inherited,
      sections: { ...inherited.sections, scopeStatement: false, methodology: false },
    };
    expect(diffAgainstInherited(desired, inherited)).toEqual({});
  });

  it('round-trips a paired change through resolve', () => {
    const desired: ReportSettings = {
      layout: 'per_engine',
      engines: { ...inherited.engines, claude: false },
      sections: { ...inherited.sections, competitorsTracked: false, visibilityByEngine: false },
    };
    const diff = diffAgainstInherited(desired, inherited);
    expect(resolveReportSettings(diff)).toEqual(desired);
  });
});

describe('sectionRenderState', () => {
  it('hides a section that is switched off', () => {
    expect(sectionRenderState(false, true)).toBe('hidden');
  });

  it('renders a section that is on and has data', () => {
    expect(sectionRenderState(true, true)).toBe('render');
  });

  it('marks a section that is on but has no data as empty, not hidden', () => {
    expect(sectionRenderState(true, false)).toBe('empty');
  });
});

describe('isLockedSection', () => {
  it('locks the two sections that describe the boundary of the measurement', () => {
    expect(isLockedSection('scopeStatement')).toBe(true);
    expect(isLockedSection('methodology')).toBe(true);
    expect(isLockedSection('opportunities')).toBe(false);
  });
});
