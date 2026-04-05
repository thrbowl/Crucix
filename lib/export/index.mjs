// Export Layer — IOC/CVE export in JSON, CSV, STIX 2.1 formats

export function exportIOCsJSON(iocs) {
  return JSON.stringify({
    type: 'crucix-ioc-export',
    version: '1.0',
    timestamp: new Date().toISOString(),
    count: iocs.length,
    indicators: iocs,
  }, null, 2);
}

export function exportIOCsCSV(iocs) {
  const headers = ['type', 'value', 'confidence', 'source', 'first_seen', 'last_seen', 'tags'];
  const rows = iocs.map(ioc => [
    ioc.type || '', ioc.value || '', ioc.confidence || '',
    (ioc.sources || []).join(';'), ioc.firstSeen || '', ioc.lastSeen || '',
    (ioc.tags || []).join(';')
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export function exportIOCsSTIX(iocs) {
  const objects = iocs.map((ioc, i) => ({
    type: 'indicator',
    spec_version: '2.1',
    id: `indicator--${crypto.randomUUID?.() || `crucix-${i}-${Date.now()}`}`,
    created: ioc.firstSeen || new Date().toISOString(),
    modified: ioc.lastSeen || new Date().toISOString(),
    name: `${ioc.type}: ${ioc.value}`,
    description: `IOC from Crucix intelligence. Source: ${(ioc.sources || []).join(', ')}`,
    pattern: buildSTIXPattern(ioc),
    pattern_type: 'stix',
    valid_from: ioc.firstSeen || new Date().toISOString(),
    confidence: Math.round((ioc.confidence || 50)),
    labels: ioc.tags || [],
  }));
  return JSON.stringify({
    type: 'bundle',
    id: `bundle--crucix-${Date.now()}`,
    objects,
  }, null, 2);
}

function buildSTIXPattern(ioc) {
  switch (ioc.type) {
    case 'ipv4':   return `[ipv4-addr:value = '${ioc.value}']`;
    case 'ipv6':   return `[ipv6-addr:value = '${ioc.value}']`;
    case 'domain': return `[domain-name:value = '${ioc.value}']`;
    case 'url':    return `[url:value = '${ioc.value}']`;
    case 'email':  return `[email-addr:value = '${ioc.value}']`;
    case 'md5':    return `[file:hashes.MD5 = '${ioc.value}']`;
    case 'sha1':   return `[file:hashes.'SHA-1' = '${ioc.value}']`;
    case 'sha256': return `[file:hashes.'SHA-256' = '${ioc.value}']`;
    default:       return `[artifact:payload_bin = '${ioc.value}']`;
  }
}

export function exportCVEsJSON(cves) {
  return JSON.stringify({
    type: 'crucix-cve-export',
    version: '1.0',
    timestamp: new Date().toISOString(),
    count: cves.length,
    vulnerabilities: cves,
  }, null, 2);
}

export function exportCVEsCSV(cves) {
  const headers = ['cve_id', 'cvss', 'epss', 'in_kev', 'has_poc', 'description', 'published_date', 'sources'];
  const rows = cves.map(c => [
    c.id || c.cveId || '', c.cvss || '', c.epss || '', c.inKEV ? 'yes' : 'no',
    c.hasPoc ? 'yes' : 'no', (c.description || '').substring(0, 200),
    c.publishedDate || '', (c.sources || []).join(';')
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// Backward-compatible dispatchers
export function exportIOCs(iocs, format = 'json') {
  switch (format) {
    case 'json': return exportIOCsJSON(iocs);
    case 'csv':  return exportIOCsCSV(iocs);
    case 'stix': return exportIOCsSTIX(iocs);
    default:     throw new Error(`Unknown export format: ${format}`);
  }
}

export function exportCVEs(cves, format = 'json') {
  switch (format) {
    case 'json': return exportCVEsJSON(cves);
    case 'csv':  return exportCVEsCSV(cves);
    default:     throw new Error(`Unknown export format: ${format}`);
  }
}
