// Delta Engine — compares two synthesized sweep results and produces structured changes

// Metrics we track for delta computation
const NUMERIC_METRICS = [
  { key: 'vix', extract: d => d.fred?.find(f => f.id === 'VIXCLS')?.value, label: 'VIX', threshold: 5 },
  { key: 'hy_spread', extract: d => d.fred?.find(f => f.id === 'BAMLH0A0HYM2')?.value, label: 'HY Spread', threshold: 5 },
  { key: '10y2y', extract: d => d.fred?.find(f => f.id === 'T10Y2Y')?.value, label: '10Y-2Y Spread', threshold: 10 },
  { key: 'wti', extract: d => d.energy?.wti, label: 'WTI Crude', threshold: 3 },
  { key: 'brent', extract: d => d.energy?.brent, label: 'Brent Crude', threshold: 3 },
  { key: 'natgas', extract: d => d.energy?.natgas, label: 'Natural Gas', threshold: 5 },
  { key: 'unemployment', extract: d => d.bls?.find(b => b.id === 'LNS14000000' || b.id === 'UNRATE')?.value, label: 'Unemployment', threshold: 2 },
  { key: 'fed_funds', extract: d => d.fred?.find(f => f.id === 'DFF')?.value, label: 'Fed Funds Rate', threshold: 1 },
  { key: '10y_yield', extract: d => d.fred?.find(f => f.id === 'DGS10')?.value, label: '10Y Yield', threshold: 3 },
  { key: 'usd_index', extract: d => d.fred?.find(f => f.id === 'DTWEXBGS')?.value, label: 'USD Index', threshold: 1 },
  { key: 'mortgage', extract: d => d.fred?.find(f => f.id === 'MORTGAGE30US')?.value, label: '30Y Mortgage', threshold: 2 },
];

const COUNT_METRICS = [
  { key: 'urgent_posts', extract: d => d.tg?.urgent?.length || 0, label: 'Urgent OSINT Posts' },
  { key: 'thermal_total', extract: d => d.thermal?.reduce((s, t) => s + t.det, 0) || 0, label: 'Thermal Detections' },
  { key: 'air_total', extract: d => d.air?.reduce((s, a) => s + a.total, 0) || 0, label: 'Air Activity' },
  { key: 'who_alerts', extract: d => d.who?.length || 0, label: 'WHO Alerts' },
  { key: 'conflict_events', extract: d => d.acled?.totalEvents || 0, label: 'Conflict Events' },
  { key: 'conflict_fatalities', extract: d => d.acled?.totalFatalities || 0, label: 'Conflict Fatalities' },
  { key: 'sdr_online', extract: d => d.sdr?.online || 0, label: 'SDR Receivers' },
  { key: 'news_count', extract: d => d.news?.length || 0, label: 'News Items' },
  { key: 'sources_ok', extract: d => d.meta?.sourcesOk || 0, label: 'Sources OK' },
];

export function computeDelta(current, previous) {
  if (!previous) return null;

  const signals = { new: [], escalated: [], deescalated: [], unchanged: [] };
  let criticalChanges = 0;

  // Numeric metrics: track % change
  for (const m of NUMERIC_METRICS) {
    const curr = m.extract(current);
    const prev = m.extract(previous);
    if (curr == null || prev == null) continue;

    const pctChange = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

    if (Math.abs(pctChange) > m.threshold) {
      const entry = {
        key: m.key, label: m.label, from: prev, to: curr,
        pctChange: parseFloat(pctChange.toFixed(2)),
        direction: pctChange > 0 ? 'up' : 'down',
      };
      if (pctChange > 0) signals.escalated.push(entry);
      else signals.deescalated.push(entry);
      if (Math.abs(pctChange) > 10) criticalChanges++;
    } else {
      signals.unchanged.push(m.key);
    }
  }

  // Count metrics: track absolute change
  for (const m of COUNT_METRICS) {
    const curr = m.extract(current);
    const prev = m.extract(previous);
    const diff = curr - prev;

    if (Math.abs(diff) > 0) {
      const entry = {
        key: m.key, label: m.label, from: prev, to: curr,
        change: diff, direction: diff > 0 ? 'up' : 'down',
      };
      if (diff > 0) signals.escalated.push(entry);
      else signals.deescalated.push(entry);
    } else {
      signals.unchanged.push(m.key);
    }
  }

  // New urgent posts (check by text content)
  const prevUrgentTexts = new Set((previous.tg?.urgent || []).map(p => p.text?.substring(0, 60)));
  for (const post of (current.tg?.urgent || [])) {
    const key = post.text?.substring(0, 60);
    if (key && !prevUrgentTexts.has(key)) {
      signals.new.push({ key: 'tg_urgent', item: post, reason: 'New urgent OSINT post' });
      criticalChanges++;
    }
  }

  // Nuclear anomaly change
  const currAnom = current.nuke?.some(n => n.anom) || false;
  const prevAnom = previous.nuke?.some(n => n.anom) || false;
  if (currAnom && !prevAnom) {
    signals.new.push({ key: 'nuke_anomaly', reason: 'Nuclear anomaly detected' });
    criticalChanges += 5; // Critical
  } else if (!currAnom && prevAnom) {
    signals.deescalated.push({ key: 'nuke_anomaly', label: 'Nuclear Anomaly', direction: 'resolved' });
  }

  // Determine overall direction
  let direction = 'mixed';
  const riskUp = signals.escalated.filter(s =>
    ['vix', 'hy_spread', 'urgent_posts', 'conflict_events', 'thermal_total'].includes(s.key)
  ).length;
  const riskDown = signals.deescalated.filter(s =>
    ['vix', 'hy_spread', 'urgent_posts', 'conflict_events', 'thermal_total'].includes(s.key)
  ).length;
  if (riskUp > riskDown + 1) direction = 'risk-off';
  else if (riskDown > riskUp + 1) direction = 'risk-on';

  return {
    timestamp: current.meta?.timestamp || new Date().toISOString(),
    previous: previous.meta?.timestamp || null,
    signals,
    summary: {
      totalChanges: signals.new.length + signals.escalated.length + signals.deescalated.length,
      criticalChanges,
      direction,
    },
  };
}
