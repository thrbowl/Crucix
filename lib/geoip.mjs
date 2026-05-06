// lib/geoip.mjs
// City-level IP geolocation using MaxMind GeoLite2-City database.
// Falls back to null if the DB is unavailable or the IP is private/unroutable.

import { createReadStream } from 'node:fs';
import { open } from 'maxmind';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '../data/GeoLite2-City.mmdb');

let _reader = null;

async function getReader() {
  if (_reader) return _reader;
  try {
    _reader = await open(DB_PATH);
  } catch (err) {
    console.warn('[GeoIP] Failed to open GeoLite2-City.mmdb:', err.message);
    _reader = null;
  }
  return _reader;
}

/**
 * Look up an IP address and return { lat, lon, city, country } or null.
 * @param {string} ip
 * @returns {{ lat: number, lon: number, city: string|null, country: string|null }|null}
 */
export async function lookupIP(ip) {
  const reader = await getReader();
  if (!reader) return null;
  try {
    const result = reader.get(ip);
    if (!result?.location?.latitude) return null;
    return {
      lat:     result.location.latitude,
      lon:     result.location.longitude,
      city:    result.city?.names?.en ?? null,
      country: result.country?.names?.en ?? result.registered_country?.names?.en ?? null,
    };
  } catch {
    return null;
  }
}
