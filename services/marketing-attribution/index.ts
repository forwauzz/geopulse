export { MarketingEventSchema, MARKETING_EVENT_NAMES } from './schema';
export type { MarketingEvent, MarketingEventName, MarketingEventInsert } from './schema';
export { ingestEvent, validateEvent } from './ingest';
export type { IngestResult } from './ingest';
export { emitMarketingEvent } from './emit';
export type { EmitContext } from './emit';
export { hashEmailSha256, normalizeEmail, canonicalizeSource } from './hash';
