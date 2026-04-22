// lib/pipeline/indicator.mjs
import { stixId } from '../stix/id.mjs';
import { iocConfidenceScore, iocLifecycleState } from './scoring.mjs';

/** Build a STIX pattern string for the given IOC type and value. */
function buildStixPattern(type, value) {
  switch (type) {
    case 'ipv4-addr':   return `[ipv4-addr:value = '${value}']`;
    case 'ipv6-addr':   return `[ipv6-addr:value = '${value}']`;
    case 'domain-name': return `[domain-name:value = '${value}']`;
    case 'url':         return `[url:value = '${value}']`;
    case 'email-addr':  return `[email-addr:value = '${value}']`;
    case 'file':        return buildFilePattern(value);
    default:            return `[${type}:value = '${value}']`;
  }
}

/** Build a STIX file hash pattern, detecting hash type by length. */
function buildFilePattern(hash) {
  const len = hash.length;
  if (len === 32)  return `[file:hashes.'MD5' = '${hash}']`;
  if (len === 40)  return `[file:hashes.'SHA-1' = '${hash}']`;
  if (len === 64)  return `[file:hashes.'SHA-256' = '${hash}']`;
  return `[file:hashes.'Unknown' = '${hash}']`;
}

/** Build the companion SCO for the IOC. */
function buildSco(type, value) {
  const base = { type, spec_version: '2.1', id: stixId(type, value) };
  switch (type) {
    case 'ipv4-addr':
    case 'ipv6-addr':
    case 'domain-name':
    case 'url':
    case 'email-addr':
      return { ...base, value };
    case 'file': {
      const len = value.length;
      const hashType = len === 32 ? 'MD5' : len === 40 ? 'SHA-1' : 'SHA-256';
      return { ...base, hashes: { [hashType]: value } };
    }
    default:
      return { ...base, value };
  }
}

/**
 * Convert a normalized IOC object to a STIX Indicator SDO + SCO pair.
 * Input: output of normalizeIOC() from lib/normalize/ioc.mjs
 *
 * @param {object} ioc - Normalized IOC
 * @param {number} [nowMs] - Current time override (for testing)
 * @returns {{ indicator: object, sco: object }}
 */
export function toStixIndicator(ioc, nowMs = Date.now()) {
  const now = new Date().toISOString();
  const confidenceScore = iocConfidenceScore(ioc, nowMs);
  const lifecycle = iocLifecycleState(ioc, nowMs);

  const indicator = {
    type: 'indicator',
    spec_version: '2.1',
    id: stixId('indicator', ioc.type, ioc.value),
    pattern_type: 'stix',
    pattern: buildStixPattern(ioc.type, ioc.value),
    valid_from: ioc.firstSeen ?? now,
    created: ioc.firstSeen ?? now,
    modified: ioc.lastSeen ?? now,
    indicator_types: ['malicious-activity'],

    // Crucix extensions
    x_crucix_confidence_score: confidenceScore,
    x_crucix_source_count: (ioc.sources ?? []).length,
    x_crucix_sources: ioc.sources ?? [],
    x_crucix_ioc_lifecycle: lifecycle,
    x_crucix_false_positive_rate: ioc.falsePositiveRate ?? null,
    x_crucix_last_seen: ioc.lastSeen ?? now,
    x_crucix_related_cves: ioc.relatedCVEs ?? [],
    x_crucix_related_actors: ioc.relatedActors ?? [],
    x_crucix_tags: ioc.tags ?? [],
    x_crucix_ioc_type: ioc.type,
    x_crucix_ioc_value: ioc.value,
  };

  const sco = buildSco(ioc.type, ioc.value);

  return { indicator, sco };
}
