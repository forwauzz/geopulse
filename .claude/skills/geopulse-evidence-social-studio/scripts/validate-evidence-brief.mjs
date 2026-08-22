#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootFields = new Set([
  'brief_version',
  'content_lane',
  'audience',
  'visual_family',
  'claims',
]);

const claimFields = new Set([
  'claim_id',
  'claim_type',
  'evidence_grade',
  'publishable',
  'public_claim',
  'source_title',
  'source_location',
  'source_owner',
  'source_date',
  'accessed_at',
  'metric_name',
  'value',
  'unit',
  'population_or_cohort',
  'denominator',
  'sample_size',
  'time_window',
  'method',
  'scope_and_limitations',
  'privacy_classification',
  'privacy_treatment',
  'allowed_public_wording',
  'prohibited_inference',
]);

const allowedLanes = new Set([
  'market_stat',
  'audit_finding',
  'benchmark_signal',
  'buyer_intelligence',
  'product_education',
  'practical_education',
  'outreach_asset',
]);

const allowedFamilies = new Set([
  'editorial_core',
  'editorial_dark',
  'amara_education',
  'landing_colorblock',
]);

const allowedClaimTypes = new Set([
  'market_stat',
  'audit_finding',
  'benchmark_signal',
  'buyer_intelligence',
  'product_truth',
  'non_quantitative',
]);

const allowedGrades = new Set(['A', 'B', 'C']);
const allowedPrivacy = new Set(['public', 'shared', 'internal', 'private_tenant']);
const placeholderWords = ['replace', 'example', 'todo', 'tbd'];

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateEvidenceBrief(payload) {
  const errors = [];
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
    return ['root must be a JSON object'];
  }

  for (const field of [...rootFields].sort()) {
    if (!(field in payload)) errors.push('missing root field: ' + field);
  }

  if (payload.brief_version !== 'geopulse-social-evidence-v1') {
    errors.push('brief_version must be geopulse-social-evidence-v1');
  }
  if (!allowedLanes.has(payload.content_lane)) {
    errors.push('content_lane is invalid');
  }
  if (!allowedFamilies.has(payload.visual_family)) {
    errors.push('visual_family is invalid');
  }
  if (!nonempty(payload.audience)) {
    errors.push('audience must be a non-empty string');
  }
  if (!Array.isArray(payload.claims) || payload.claims.length === 0) {
    errors.push('claims must be a non-empty array');
    return errors;
  }

  const seenIds = new Set();
  payload.claims.forEach((claim, index) => {
    const prefix = 'claims[' + index + ']';
    if (claim === null || Array.isArray(claim) || typeof claim !== 'object') {
      errors.push(prefix + ' must be an object');
      return;
    }

    for (const field of [...claimFields].sort()) {
      if (!(field in claim)) errors.push(prefix + ' missing field: ' + field);
    }

    if (!nonempty(claim.claim_id)) {
      errors.push(prefix + '.claim_id must be non-empty');
    } else if (seenIds.has(claim.claim_id)) {
      errors.push(prefix + '.claim_id is duplicated: ' + claim.claim_id);
    } else {
      seenIds.add(claim.claim_id);
    }

    if (!allowedClaimTypes.has(claim.claim_type)) {
      errors.push(prefix + '.claim_type is invalid');
    }
    if (!allowedGrades.has(claim.evidence_grade)) {
      errors.push(prefix + '.evidence_grade must be A, B, or C');
    }
    if (typeof claim.publishable !== 'boolean') {
      errors.push(prefix + '.publishable must be boolean');
    }
    if (claim.publishable && claim.evidence_grade === 'C') {
      errors.push(prefix + ' grade C evidence cannot be publishable');
    }
    if (!allowedPrivacy.has(claim.privacy_classification)) {
      errors.push(prefix + '.privacy_classification is invalid');
    }
    if (['internal', 'private_tenant'].includes(claim.privacy_classification)) {
      const treatment = String(claim.privacy_treatment || '').toLowerCase();
      if (!['aggregate', 'redact', 'approved', 'anonym'].some((word) => treatment.includes(word))) {
        errors.push(prefix + '.privacy_treatment must state aggregate, redact, anonymize, or approval');
      }
    }

    for (const field of claimFields) {
      if (field === 'publishable') continue;
      const value = claim[field];
      if (!nonempty(value)) {
        errors.push(prefix + '.' + field + ' must be a non-empty string');
        continue;
      }
      const lowered = value.toLowerCase();
      if (claim.publishable && placeholderWords.some((word) => lowered.includes(word))) {
        errors.push(prefix + '.' + field + ' still contains placeholder language');
      }
    }

    const publicText = [claim.public_claim, claim.allowed_public_wording]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    const prohibitedPromises = [
      'guaranteed ranking',
      'guaranteed citation',
      'guaranteed traffic',
      'guaranteed revenue',
      'industry rank #1',
      'show up first',
    ];
    for (const phrase of prohibitedPromises) {
      if (publicText.includes(phrase)) {
        errors.push(prefix + ' contains prohibited promise: ' + phrase);
      }
    }
  });

  return errors;
}

function main() {
  if (process.argv.length !== 3) {
    console.error('usage: validate-evidence-brief.mjs <brief.json>');
    return 2;
  }

  const inputPath = path.resolve(process.argv[2]);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (error) {
    console.error('INVALID');
    console.error('- cannot read valid JSON: ' + error.message);
    return 1;
  }

  const errors = validateEvidenceBrief(payload);
  if (errors.length > 0) {
    console.log('INVALID');
    for (const error of errors) console.log('- ' + error);
    return 1;
  }

  console.log('VALID');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
