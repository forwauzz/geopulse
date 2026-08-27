import type { JordanReelScript } from './jordan-reel-production';

export const JORDAN_REEL_REVIEW_VERSION = 'maya-reel-watch-v2-inline';
export const DEFAULT_JORDAN_REEL_REVIEW_MODEL = 'gemini-2.5-flash';

const FILES_API_ROOT = 'https://generativelanguage.googleapis.com';
const MAX_REVIEW_ATTEMPTS = 2;
const MAX_FILE_POLLS = 30;
// Gemini supports one-off inline video requests below 20 MB. Keep enough
// headroom for base64 expansion, the review prompt, and the JSON envelope.
const MAX_INLINE_VIDEO_BYTES = 14 * 1024 * 1024;

export type JordanReelReviewDecision = 'pass' | 'fail' | 'hold';
export type JordanReelReviewSeverity = 'blocker' | 'major' | 'minor';
export type JordanReelReviewFindingCode =
  | 'blank_frame'
  | 'text_clipped'
  | 'text_overlap'
  | 'text_too_fast'
  | 'spelling_error'
  | 'sequence_error'
  | 'brand_error'
  | 'cta_error'
  | 'audio_error'
  | 'repetition_risk'
  | 'weak_hook'
  | 'weak_payoff'
  | 'reviewer_unavailable'
  | 'other';

export type JordanReelReviewFinding = {
  readonly code: JordanReelReviewFindingCode;
  readonly severity: JordanReelReviewSeverity;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly message: string;
  readonly repair: string;
};

export type JordanReelReviewAttestation = {
  readonly decision: JordanReelReviewDecision;
  readonly reviewer: 'maya';
  readonly reviewVersion: typeof JORDAN_REEL_REVIEW_VERSION;
  readonly provider: 'gemini';
  readonly model: string;
  readonly mediaSha256: string;
  readonly reviewedAt: string;
  readonly summary: string;
  readonly hookClear: boolean;
  readonly brandSafe: boolean;
  readonly ctaClear: boolean;
  readonly audioAcceptable: boolean;
  readonly textReadable: boolean;
  readonly sequenceCoherent: boolean;
  readonly engaging: boolean;
  readonly findings: readonly JordanReelReviewFinding[];
  readonly attempts: number;
};

type FetchLike = typeof fetch;

type ReviewModelPayload = {
  readonly decision: 'pass' | 'fail';
  readonly summary: string;
  readonly hookClear: boolean;
  readonly brandSafe: boolean;
  readonly ctaClear: boolean;
  readonly audioAcceptable: boolean;
  readonly textReadable: boolean;
  readonly sequenceCoherent: boolean;
  readonly engaging: boolean;
  readonly findings: readonly JordanReelReviewFinding[];
};

type UploadedGeminiFile = {
  readonly name: string;
  readonly uri: string;
  readonly state: string;
};

type GeminiMediaPart =
  | { readonly inlineData: { readonly mimeType: 'video/mp4'; readonly data: string } }
  | { readonly fileData: { readonly mimeType: 'video/mp4'; readonly fileUri: string } };

const findingCodes: readonly JordanReelReviewFindingCode[] = [
  'blank_frame',
  'text_clipped',
  'text_overlap',
  'text_too_fast',
  'spelling_error',
  'sequence_error',
  'brand_error',
  'cta_error',
  'audio_error',
  'repetition_risk',
  'weak_hook',
  'weak_payoff',
  'reviewer_unavailable',
  'other',
] as const;

const severities: readonly JordanReelReviewSeverity[] = ['blocker', 'major', 'minor'] as const;

const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    hookClear: { type: 'boolean' },
    brandSafe: { type: 'boolean' },
    ctaClear: { type: 'boolean' },
    audioAcceptable: { type: 'boolean' },
    textReadable: { type: 'boolean' },
    sequenceCoherent: { type: 'boolean' },
    engaging: { type: 'boolean' },
    findings: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string', enum: findingCodes },
          severity: { type: 'string', enum: severities },
          startSeconds: { type: 'number', minimum: 0 },
          endSeconds: { type: 'number', minimum: 0 },
          message: { type: 'string' },
          repair: { type: 'string' },
        },
        required: ['code', 'severity', 'startSeconds', 'endSeconds', 'message', 'repair'],
      },
    },
  },
  required: [
    'decision',
    'summary',
    'hookClear',
    'brandSafe',
    'ctaClear',
    'audioAcceptable',
    'textReadable',
    'sequenceCoherent',
    'engaging',
    'findings',
  ],
} as const;

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maximum)
    : '';
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isFindingCode(value: unknown): value is JordanReelReviewFindingCode {
  return typeof value === 'string' && findingCodes.includes(value as JordanReelReviewFindingCode);
}

function isSeverity(value: unknown): value is JordanReelReviewSeverity {
  return typeof value === 'string' && severities.includes(value as JordanReelReviewSeverity);
}

function normalizeFinding(value: unknown, durationSeconds: number): JordanReelReviewFinding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isFindingCode(row['code']) || !isSeverity(row['severity'])) return null;
  const rawStart = finiteNumber(row['startSeconds']);
  const rawEnd = finiteNumber(row['endSeconds']);
  const message = cleanText(row['message'], 300);
  const repair = cleanText(row['repair'], 300);
  if (rawStart === null || rawEnd === null || !message || !repair) return null;
  const startSeconds = Math.max(0, Math.min(rawStart, durationSeconds));
  const endSeconds = Math.max(startSeconds, Math.min(rawEnd, durationSeconds));
  return {
    code: row['code'],
    severity: row['severity'],
    startSeconds,
    endSeconds,
    message,
    repair,
  };
}

export function parseJordanReelReviewModelPayload(
  value: unknown,
  durationSeconds: number
): ReviewModelPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row['decision'] !== 'pass' && row['decision'] !== 'fail') return null;
  const summary = cleanText(row['summary'], 500);
  const booleans = [
    'hookClear',
    'brandSafe',
    'ctaClear',
    'audioAcceptable',
    'textReadable',
    'sequenceCoherent',
    'engaging',
  ] as const;
  if (!summary || booleans.some((key) => typeof row[key] !== 'boolean')) return null;
  const rawFindings = Array.isArray(row['findings']) ? row['findings'] : null;
  if (!rawFindings) return null;
  const findings = rawFindings
    .slice(0, 12)
    .map((finding) => normalizeFinding(finding, durationSeconds))
    .filter((finding): finding is JordanReelReviewFinding => finding !== null);
  if (findings.length !== Math.min(rawFindings.length, 12)) return null;
  return {
    decision: row['decision'],
    summary,
    hookClear: row['hookClear'] as boolean,
    brandSafe: row['brandSafe'] as boolean,
    ctaClear: row['ctaClear'] as boolean,
    audioAcceptable: row['audioAcceptable'] as boolean,
    textReadable: row['textReadable'] as boolean,
    sequenceCoherent: row['sequenceCoherent'] as boolean,
    engaging: row['engaging'] as boolean,
    findings,
  };
}

function attestedDecision(payload: ReviewModelPayload): 'pass' | 'fail' {
  const criticalDimensions = [
    payload.hookClear,
    payload.brandSafe,
    payload.ctaClear,
    payload.audioAcceptable,
    payload.textReadable,
    payload.sequenceCoherent,
    payload.engaging,
  ];
  const seriousFinding = payload.findings.some(
    (finding) => finding.severity === 'blocker' || finding.severity === 'major'
  );
  return payload.decision === 'pass' && criticalDimensions.every(Boolean) && !seriousFinding
    ? 'pass'
    : 'fail';
}

function parseUploadedFile(value: unknown): UploadedGeminiFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const raw = root['file'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as Record<string, unknown>;
  const name = cleanText(file['name'], 200);
  const uri = cleanText(file['uri'], 2_000);
  const state = cleanText(file['state'], 40) || 'PROCESSING';
  return name && uri ? { name, uri, state } : null;
}

async function uploadVideo(args: {
  readonly apiKey: string;
  readonly video: ArrayBuffer;
  readonly displayName: string;
  readonly fetchImpl: FetchLike;
}): Promise<UploadedGeminiFile> {
  const start = await args.fetchImpl(`${FILES_API_ROOT}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': args.apiKey,
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-length': String(args.video.byteLength),
      'x-goog-upload-header-content-type': 'video/mp4',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: args.displayName } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) throw new Error(`reel_review_upload_start_http_${start.status}`);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl?.startsWith('https://')) throw new Error('reel_review_upload_url_missing');
  const uploaded = await args.fetchImpl(uploadUrl, {
    method: 'POST',
    headers: {
      'content-length': String(args.video.byteLength),
      'x-goog-upload-offset': '0',
      'x-goog-upload-command': 'upload, finalize',
      'content-type': 'video/mp4',
    },
    body: args.video,
    signal: AbortSignal.timeout(90_000),
  });
  if (!uploaded.ok) throw new Error(`reel_review_upload_http_${uploaded.status}`);
  const file = parseUploadedFile(await uploaded.json().catch(() => null));
  if (!file) throw new Error('reel_review_upload_contract_invalid');
  return file;
}

async function awaitActiveFile(args: {
  readonly apiKey: string;
  readonly file: UploadedGeminiFile;
  readonly fetchImpl: FetchLike;
  readonly wait: (milliseconds: number) => Promise<void>;
}): Promise<UploadedGeminiFile> {
  let current = args.file;
  for (let poll = 0; poll < MAX_FILE_POLLS; poll += 1) {
    if (current.state === 'ACTIVE') return current;
    if (current.state === 'FAILED') throw new Error('reel_review_file_processing_failed');
    await args.wait(2_000);
    const response = await args.fetchImpl(`${FILES_API_ROOT}/v1beta/${current.name}`, {
      headers: { 'x-goog-api-key': args.apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`reel_review_file_poll_http_${response.status}`);
    const next = parseUploadedFile({ file: await response.json().catch(() => null) });
    if (!next) throw new Error('reel_review_file_poll_contract_invalid');
    current = next;
  }
  throw new Error('reel_review_file_processing_timeout');
}

function reviewPrompt(script: JordanReelScript, durationSeconds: number): string {
  return [
    'You are Maya, the independent GEO-Pulse Reel quality reviewer.',
    'Watch the complete video from beginning to end and listen to its audio before deciding.',
    'Fail it if there are blank or dead sections, clipped/overlapping/duplicated text, unreadably brief text, spelling errors, incorrect sequence, weak first-two-second hook, missing payoff, unclear CTA, wrong URL, off-brand presentation, or unusable audio.',
    'The Reel may be energetic and template-driven, but it must feel intentional, useful, simple, and understandable to a business buyer.',
    'Use exact timestamps for every issue. A major or blocker issue means decision=fail. Minor polish may pass only when all seven Boolean dimensions are true.',
    `Expected duration: ${durationSeconds.toFixed(2)} seconds.`,
    `Expected script and CTA context: ${JSON.stringify(script)}.`,
  ].join('\n');
}

function responseText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const candidates = (value as Record<string, unknown>)['candidates'];
  if (!Array.isArray(candidates)) return '';
  const first = candidates[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return '';
  const content = (first as Record<string, unknown>)['content'];
  if (!content || typeof content !== 'object' || Array.isArray(content)) return '';
  const parts = (content as Record<string, unknown>)['parts'];
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => part && typeof part === 'object' && !Array.isArray(part)
      ? cleanText((part as Record<string, unknown>)['text'], 20_000)
      : '')
    .filter(Boolean)
    .join('\n');
}

function base64Video(video: ArrayBuffer): string {
  const bytes = new Uint8Array(video);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(''));
}

async function generateReview(args: {
  readonly apiKey: string;
  readonly model: string;
  readonly mediaPart: GeminiMediaPart;
  readonly script: JordanReelScript;
  readonly durationSeconds: number;
  readonly fetchImpl: FetchLike;
}): Promise<ReviewModelPayload> {
  const response = await args.fetchImpl(
    `${FILES_API_ROOT}/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': args.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            args.mediaPart,
            { text: reviewPrompt(args.script, args.durationSeconds) },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema: reviewSchema,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    }
  );
  if (!response.ok) throw new Error(`reel_review_generate_http_${response.status}`);
  const text = responseText(await response.json().catch(() => null));
  if (!text) throw new Error('reel_review_empty_response');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('reel_review_json_invalid');
  }
  const payload = parseJordanReelReviewModelPayload(parsed, args.durationSeconds);
  if (!payload) throw new Error('reel_review_contract_invalid');
  return payload;
}

async function deleteUploadedFile(
  apiKey: string,
  name: string,
  fetchImpl: FetchLike
): Promise<void> {
  await fetchImpl(`${FILES_API_ROOT}/v1beta/${name}`, {
    method: 'DELETE',
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

function holdAttestation(args: {
  readonly model: string;
  readonly mediaSha256: string;
  readonly reviewedAt: string;
  readonly attempts: number;
  readonly reason: string;
}): JordanReelReviewAttestation {
  return {
    decision: 'hold',
    reviewer: 'maya',
    reviewVersion: JORDAN_REEL_REVIEW_VERSION,
    provider: 'gemini',
    model: args.model,
    mediaSha256: args.mediaSha256,
    reviewedAt: args.reviewedAt,
    summary: 'The Reel could not be independently watched, so it remains held.',
    hookClear: false,
    brandSafe: false,
    ctaClear: false,
    audioAcceptable: false,
    textReadable: false,
    sequenceCoherent: false,
    engaging: false,
    findings: [{
      code: 'reviewer_unavailable',
      severity: 'blocker',
      startSeconds: 0,
      endSeconds: 0,
      message: `Independent Reel review was unavailable (${cleanText(args.reason, 120) || 'unknown'}).`,
      repair: 'Retry the independent review before scheduling this exact media file.',
    }],
    attempts: args.attempts,
  };
}

export async function reviewJordanReel(args: {
  readonly apiKey: string;
  readonly model?: string;
  readonly video: ArrayBuffer;
  readonly mediaSha256: string;
  readonly durationSeconds: number;
  readonly script: JordanReelScript;
  readonly fetchImpl?: FetchLike;
  readonly now?: Date;
  readonly wait?: (milliseconds: number) => Promise<void>;
}): Promise<JordanReelReviewAttestation> {
  const model = cleanText(args.model, 120) || DEFAULT_JORDAN_REEL_REVIEW_MODEL;
  const reviewedAt = (args.now ?? new Date()).toISOString();
  const apiKey = args.apiKey.trim();
  if (!apiKey) {
    return holdAttestation({
      model,
      mediaSha256: args.mediaSha256,
      reviewedAt,
      attempts: 0,
      reason: 'not_configured',
    });
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  const wait = args.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const inlineData = args.video.byteLength <= MAX_INLINE_VIDEO_BYTES
    ? base64Video(args.video)
    : null;
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= MAX_REVIEW_ATTEMPTS; attempt += 1) {
    let uploaded: UploadedGeminiFile | null = null;
    try {
      let mediaPart: GeminiMediaPart;
      if (inlineData) {
        mediaPart = { inlineData: { mimeType: 'video/mp4', data: inlineData } };
      } else {
        uploaded = await uploadVideo({
          apiKey,
          video: args.video,
          displayName: `geopulse-reel-${args.mediaSha256.slice(0, 12)}`,
          fetchImpl,
        });
        const active = await awaitActiveFile({ apiKey, file: uploaded, fetchImpl, wait });
        mediaPart = { fileData: { mimeType: 'video/mp4', fileUri: active.uri } };
      }
      const payload = await generateReview({
        apiKey,
        model,
        mediaPart,
        script: args.script,
        durationSeconds: args.durationSeconds,
        fetchImpl,
      });
      const decision = attestedDecision(payload);
      const findings = decision === 'fail' && payload.findings.length === 0
        ? [{
            code: 'other' as const,
            severity: 'major' as const,
            startSeconds: 0,
            endSeconds: args.durationSeconds,
            message: 'The Reel failed review without an actionable model finding.',
            repair: 'Review the complete Reel and record a timecoded correction before rerendering.',
          }]
        : payload.findings;
      return {
        ...payload,
        decision,
        findings,
        reviewer: 'maya',
        reviewVersion: JORDAN_REEL_REVIEW_VERSION,
        provider: 'gemini',
        model,
        mediaSha256: args.mediaSha256,
        reviewedAt,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown';
    } finally {
      if (uploaded) await deleteUploadedFile(apiKey, uploaded.name, fetchImpl);
    }
  }
  return holdAttestation({
    model,
    mediaSha256: args.mediaSha256,
    reviewedAt,
    attempts: MAX_REVIEW_ATTEMPTS,
    reason: lastError,
  });
}
