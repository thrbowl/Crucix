// Crucix Cybersecurity Edition — Configuration
// All settings with env var overrides

import "./apis/utils/env.mjs"; // Load .env first

export default {
  port: parseInt(process.env.PORT) || 3117,
  refreshIntervalMinutes: parseInt(process.env.REFRESH_INTERVAL_MINUTES) || 15,

  // Authentication (v1.0 basic, v1.1 RBAC)
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    accessToken: process.env.AUTH_ACCESS_TOKEN || null,
  },

  llm: {
    provider: process.env.LLM_PROVIDER || null,
    apiKey: process.env.LLM_API_KEY || null,
    model: process.env.LLM_MODEL || null,
    baseUrl: process.env.OLLAMA_BASE_URL || null,
  },

  // Watchlist — user-defined monitoring targets
  watchlist: {
    vendors: (process.env.WATCHLIST_VENDORS || '').split(',').filter(Boolean),
    industries: (process.env.WATCHLIST_INDUSTRIES || '').split(',').filter(Boolean),
    actors: (process.env.WATCHLIST_ACTORS || '').split(',').filter(Boolean),
    keywords: (process.env.WATCHLIST_KEYWORDS || '').split(',').filter(Boolean),
    cveIds: (process.env.WATCHLIST_CVE_IDS || '').split(',').filter(Boolean),
    ipRanges: (process.env.WATCHLIST_IP_RANGES || '').split(',').filter(Boolean),
  },

  // Commercial feed slots (v1.1 activation)
  commercialFeeds: {
    recordedFuture: { apiKey: process.env.RECORDED_FUTURE_API_KEY || null },
    mandiant: { apiKey: process.env.MANDIANT_API_KEY || null },
    misp: { url: process.env.MISP_URL || null, key: process.env.MISP_API_KEY || null },
    virustotalPro: { apiKey: process.env.VT_PRO_API_KEY || null },
  },

  // Search engine intelligence feeds (v1.1)
  searchFeeds: {
    xApiBearer: process.env.X_API_BEARER || null,
    githubToken: process.env.GITHUB_TOKEN || null,
    bingApiKey: process.env.BING_API_KEY || null,
    intelxApiKey: process.env.INTELX_API_KEY || null,
  },

  // Delta engine thresholds — cybersecurity semantics
  delta: {
    thresholds: {
      numeric: {
        // Cybersecurity thresholds (% change to flag)
        threat_index: 10,
        epss_spike: 30,
      },
      count: {
        new_critical_cves: 1,
        new_kev_entries: 1,
        ransomware_victims: 2,
        ioc_volume_surge: 50,
        active_apt_groups: 1,
        sources_ok: 1,
      },
    },
  },
};
