// lib/api/v1/briefings.mjs
import { Router } from 'express';
import { requireCredits, CREDIT_COSTS } from '../../credits/index.mjs';
import { sendApiResponse, creditsFromReq } from './response.mjs';

/**
 * 从 synthesized 数据生成结构化简报对象。
 */
function briefingFromSynthesized(data) {
  const cves = data.cves ?? {};
  const iocs = data.iocs ?? {};
  const actors = data.actors ?? {};

  const allIOCs = [
    ...(iocs.malware ?? []),
    ...(iocs.c2 ?? []),
    ...(iocs.maliciousIPs ?? []),
    ...(iocs.phishing ?? []),
  ];

  const topCVEs = (cves.recent ?? [])
    .slice(0, 10)
    .map(c => ({
      cve_id: c.id ?? c.cveId,
      cvss: c.cvss ?? c.cvssV3 ?? null,
      epss: c.epss ?? null,
      kev: c.kev ?? c.inKEV ?? false,
      priority_score: c.priorityScore ?? null,
      description: c.description ?? null,
    }));

  const activeActors = (actors.ransomwareGroups ?? [])
    .slice(0, 5)
    .map(a => ({
      name: a.name,
      type: a.type ?? 'ransomware',
      victims_this_period: (actors.victims ?? []).filter(v => v.group === a.name).length,
      sources: a.sources ?? [],
    }));

  const iocHighlights = {
    total: allIOCs.length,
    malware_hashes: (iocs.malware ?? []).length,
    c2_indicators: (iocs.c2 ?? []).length,
    malicious_ips: (iocs.maliciousIPs ?? []).length,
    phishing_urls: (iocs.phishing ?? []).length,
  };

  const summary = [
    `威胁指数: ${data.delta?.threatIndex ?? 'N/A'}/100 (${data.delta?.overallLevel ?? 'UNKNOWN'})`,
    `活跃 CVE: ${cves.total ?? 0} 条，其中 KEV: ${cves.kev ?? 0} 条`,
    `IOC 总量: ${allIOCs.length} 条`,
    `活跃 APT 组织: ${(actors.ransomwareGroups ?? []).length} 个`,
  ].join('。');

  return {
    id: 'briefing--latest',
    generated_at: data.meta?.timestamp ?? new Date().toISOString(),
    executive_summary: summary,
    threat_level: data.delta?.overallLevel ?? null,
    threat_index: data.delta?.threatIndex ?? null,
    top_vulnerabilities: topCVEs,
    active_threat_actors: activeActors,
    ioc_highlights: iocHighlights,
    key_advisories: (data.news ?? []).slice(0, 5).map(n => ({
      title: n.title,
      source: n.source ?? null,
      url: n.url ?? null,
      published: n.published ?? null,
    })),
    sources_queried: data.meta?.sourcesQueried ?? null,
    sources_ok: data.meta?.sourcesOk ?? null,
  };
}

export default function briefingsRouter({ getPool, getCurrentData }) {
  const router = Router();

  // GET /briefings/latest — 最新简报（消耗 1 积分）
  router.get('/latest', requireCredits('briefing_read', getPool()), async (req, res) => {
    const data = getCurrentData();
    if (!data) return res.status(503).json({ error: 'No briefing available yet — first sweep in progress' });

    const briefing = briefingFromSynthesized(data);
    sendApiResponse(
      res,
      briefing,
      creditsFromReq(req, CREDIT_COSTS.briefing_read),
    );
  });

  // GET /briefings — 简报列表（消耗 1 积分；历史存储待 Plan 6 实现）
  router.get('/', requireCredits('briefing_read', getPool()), async (req, res) => {
    const data = getCurrentData();
    const items = data ? [briefingFromSynthesized(data)] : [];

    sendApiResponse(
      res,
      { items, total: items.length, note: 'Historical briefings require analysis engine (Plan 6)' },
      creditsFromReq(req, CREDIT_COSTS.briefing_read),
    );
  });

  return router;
}
