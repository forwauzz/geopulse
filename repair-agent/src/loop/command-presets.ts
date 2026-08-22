export type QaCommandPresetId = 'geopulse-safe-v1' | 'portable-static-safe-v1';

export type QaCommandPreset = {
  id: QaCommandPresetId;
  focused: readonly (readonly string[])[];
  affected: readonly (readonly string[])[];
  typeCheck: readonly (readonly string[])[];
  build: readonly (readonly string[])[];
  browser: readonly (readonly string[])[];
};

const PRESETS: Readonly<Record<QaCommandPresetId, QaCommandPreset>> = Object.freeze({
  'geopulse-safe-v1': Object.freeze({
    id: 'geopulse-safe-v1',
    focused: Object.freeze([Object.freeze(['npm', 'run', 'test'])]),
    affected: Object.freeze([]),
    typeCheck: Object.freeze([Object.freeze(['npm', 'run', 'type-check'])]),
    build: Object.freeze([Object.freeze(['node', 'scripts/opennext-build.cjs'])]),
    browser: Object.freeze([Object.freeze(['npx', 'playwright', 'test'])]),
  }),
  'portable-static-safe-v1': Object.freeze({
    id: 'portable-static-safe-v1',
    focused: Object.freeze([Object.freeze(['node', '--test'])]),
    affected: Object.freeze([]),
    typeCheck: Object.freeze([]),
    build: Object.freeze([]),
    browser: Object.freeze([]),
  }),
});

export function isQaCommandPresetId(value: string): value is QaCommandPresetId {
  return Object.hasOwn(PRESETS, value);
}

export function resolveQaCommandPreset(id: QaCommandPresetId): QaCommandPreset {
  const preset = PRESETS[id];
  return structuredClone(preset);
}
