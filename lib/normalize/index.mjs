// Normalize Layer — unified exports for IOC/CVE standardization
// All data sources should pass their output through these functions before
// feeding into the Delta engine or dashboard synthesis.

export { normalizeIOC, mergeIOCs, deduplicateIOCs, detectIOCType } from './ioc.mjs';
export { normalizeCVE, mergeCVEs, deduplicateCVEs, cveSeverityScore } from './cve.mjs';
export { calculateConfidence, recalculateConfidences } from './confidence.mjs';
