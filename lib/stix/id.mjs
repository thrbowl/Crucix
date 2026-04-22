// lib/stix/id.mjs
import { v5 as uuidv5 } from 'uuid';

/**
 * STIX 2.1 official UUIDv5 namespace.
 * Source: STIX 2.1 spec section 2.9
 */
export const STIX_NAMESPACE = '00abedb4-aa42-466c-9c01-fed23315a9b7';

/**
 * Generate a deterministic STIX 2.1 ID.
 * Same inputs always produce the same ID (idempotent upserts).
 *
 * @param {string} type - STIX object type (e.g., 'vulnerability', 'indicator')
 * @param {...string} parts - Unique identifying parts (e.g., CVE ID, IOC value)
 * @returns {string} - STIX ID in format "type--{uuidv5}"
 */
export function stixId(type, ...parts) {
  const name = parts.join(':');
  return `${type}--${uuidv5(name, STIX_NAMESPACE)}`;
}
