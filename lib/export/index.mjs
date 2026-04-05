// Export Layer — IOC/CVE export in multiple formats
// Skeleton for v0.1.0 — full implementation in v1.0.0

export function exportIOCs(iocs, format = 'json') {
  switch (format) {
    case 'json': return JSON.stringify(iocs, null, 2);
    case 'csv':  throw new Error('CSV export not yet implemented (v1.0.0)');
    case 'stix': throw new Error('STIX export not yet implemented (v1.0.0)');
    default:     throw new Error(`Unknown export format: ${format}`);
  }
}

export function exportCVEs(cves, format = 'json') {
  switch (format) {
    case 'json': return JSON.stringify(cves, null, 2);
    default:     throw new Error(`Unknown export format: ${format}`);
  }
}
