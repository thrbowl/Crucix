# Dashboard Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the SOC dashboard for persistent monitoring — reduce map prominence, surface AI Brief/Sweep Delta above the fold, eliminate redundant panels, add full drill-down support, and make the layout extensible for future data sources.

**Architecture:** Two files change — `inject.mjs` reshapes three data structures (`certAlerts`, `health`, `newsFeed`), and `jarvis.html` receives the corresponding HTML/CSS/JS updates. Tasks are ordered so each commit leaves the dashboard in a working state.

**Tech Stack:** Node.js ESM (inject.mjs), vanilla JS + CSS Grid/Flexbox (jarvis.html). No new dependencies.

---

## File Map

| File | What changes |
|------|-------------|
| `dashboard/inject.mjs` | `buildCertAlerts()` → dynamic `items` array; `health` → grouped by domain; `newsFeed` items already have `url`; health source URL mapping added |
| `dashboard/public/jarvis.html` | HTML structure (panel moves, removals, additions); CSS (grid rows, map height, fullscreen, Stats Row, health domain groups); JS (renderStatsRow, renderCertAlerts, renderHealth, drill-down in all panels, fullscreen toggle) |

---

## Task 1: inject.mjs — certAlerts dynamic structure

**Files:**
- Modify: `dashboard/inject.mjs:704-742`

Change `buildCertAlerts()` to return a `{ total, items }` shape. Each item has `{ source, label, count, color, orgUrl, alerts }` so `renderCertAlerts()` can iterate dynamically and new CERT sources need zero frontend changes.

- [ ] **Step 1: Replace `buildCertAlerts` function**

In `dashboard/inject.mjs`, replace lines 704–742 (the entire `buildCertAlerts` function) with:

```js
function buildCertAlerts(data) {
  const cisaAlerts = (data.sources['CISA-Alerts']?.recentAlerts || []).slice(0, 15).map(a => ({
    title: (a.title || '').substring(0, 120),
    date: a.date || a.published,
    url: sanitizeExternalUrl(a.url || a.link),
    severity: a.severity,
  }));

  const enisaAlerts = (data.sources.ENISA?.recentReports || []).slice(0, 10).map(r => ({
    title: (r.title || '').substring(0, 120),
    date: r.date || r.published,
    url: sanitizeExternalUrl(r.url || r.link),
  }));

  const certsIntlAlerts = (data.sources['CERTs-Intl']?.recentAlerts || []).slice(0, 15).map(a => ({
    title: (a.title || '').substring(0, 120),
    cert: a.cert || a.source,
    date: a.date || a.published,
    url: sanitizeExternalUrl(a.url || a.link),
  }));

  const cncertAlerts = (data.sources.CNCERT?.recentAlerts || []).slice(0, 10).map(a => ({
    title: (a.title || '').substring(0, 120),
    date: a.date,
    url: sanitizeExternalUrl(a.url),
  }));

  const cnvdAlerts = (data.sources.CNVD?.recentVulns || []).slice(0, 10).map(v => ({
    title: (v.title || v.name || '').substring(0, 120),
    date: v.date,
    url: sanitizeExternalUrl(v.url),
  }));

  const cnnvdAlerts = (data.sources.CNNVD?.recentVulns || []).slice(0, 10).map(v => ({
    title: (v.title || v.name || '').substring(0, 120),
    date: v.date,
    url: sanitizeExternalUrl(v.url),
  }));

  const items = [
    { source: 'CISA',        label: 'CISA',       color: 'var(--red)',    orgUrl: 'https://www.cisa.gov/news-events/alerts',       alerts: cisaAlerts },
    { source: 'ENISA',       label: 'ENISA',      color: 'var(--orange)', orgUrl: 'https://www.enisa.europa.eu/publications',      alerts: enisaAlerts },
    { source: 'CERTs-Intl',  label: 'CERTs Intl', color: 'var(--blue)',   orgUrl: '',                                              alerts: certsIntlAlerts },
    { source: 'CNCERT',      label: 'CNCERT',     color: 'var(--green)',  orgUrl: 'https://www.cert.org.cn',                       alerts: cncertAlerts },
    { source: 'CNVD',        label: 'CNVD',       color: 'var(--accent)', orgUrl: 'https://www.cnvd.org.cn',                       alerts: cnvdAlerts },
    { source: 'CNNVD',       label: 'CNNVD',      color: 'var(--accent)', orgUrl: 'https://www.cnnvd.org.cn',                      alerts: cnnvdAlerts },
  ].map(item => ({ ...item, count: item.alerts.length }));

  return {
    total: items.reduce((s, i) => s + i.count, 0),
    items,
  };
}
```

- [ ] **Step 2: Fix the line in `buildChinaIntel` that references old certAlerts shape**

Find this block in `inject.mjs` around line 985–988 (inside the ideas/signal generation area):

```js
  if (V2.certAlerts.total > 10) {
```

That reference is to `V2.certAlerts.total` which still exists — no change needed there. But verify the string at line 988 still compiles:

```js
      text: `${V2.certAlerts.total} advisories across CISA (${V2.certAlerts.cisa.length}), ENISA (${V2.certAlerts.enisa.length}), CERTs (${V2.certAlerts.certs.length}), China (${V2.certAlerts.china.length}). Cross-reference with internal asset inventory.`,
```

Replace that string literal to use the new shape:

```js
      text: `${V2.certAlerts.total} advisories across ${V2.certAlerts.items.map(i => `${i.label} (${i.count})`).join(', ')}. Cross-reference with internal asset inventory.`,
```

- [ ] **Step 3: Syntax-check**

```bash
node --check dashboard/inject.mjs && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add dashboard/inject.mjs
git commit -m "feat(inject): certAlerts dynamic items array for extensibility"
```

---

## Task 2: jarvis.html — renderCertAlerts update

**Files:**
- Modify: `dashboard/public/jarvis.html:1591-1610` (renderCertAlerts function)

Update `renderCertAlerts()` to read from `D.certAlerts.items` (new shape from Task 1). Each org row is clickable to its `orgUrl`.

- [ ] **Step 1: Replace `renderCertAlerts` function**

Find and replace the entire `renderCertAlerts` function (lines 1591–1610):

```js
// Before (lines 1591–1610):
function renderCertAlerts(){
  const el = document.getElementById('certAlertsList');
  if(!el) return;
  const ca = D.certAlerts || {};
  const chi = D.chinaIntel || {};
  const rows = [
    { org:'CISA', items:ca.cisa||[], color:'var(--red)', url:'https://www.cisa.gov/news-events/alerts' },
    { org:'ENISA', items:ca.enisa||[], color:'var(--orange)', url:'https://www.enisa.europa.eu/publications' },
    { org:t('cert.intl','CERTs Intl'), items:ca.certs||[], color:'var(--blue)', url:'' },
    { org:'CNCERT', items:Array.isArray(chi.cncertAlerts)?chi.cncertAlerts:[], color:'var(--green)', url:'https://www.cert.org.cn' },
    { org:'CNVD/CNNVD', items:[...(Array.isArray(chi.cnvdVulns)?chi.cnvdVulns:[]),...(Array.isArray(chi.cnnvdVulns)?chi.cnnvdVulns:[])], color:'var(--accent)', url:'https://www.cnvd.org.cn' },
  ];
  const total = rows.reduce((s,r)=>s+r.items.length,0);
  document.getElementById('certTotalBadge').textContent = total;
  el.innerHTML = rows.map(r => `
    <div class="cert-row"${r.url?` onclick="window.open('${r.url}','_blank','noopener')"`:''}>
      <div class="cert-org"><div class="co-dot" style="background:${r.color}"></div>${esc(r.org)}</div>
      <div class="cert-count" style="color:${r.color}">${r.items.length}</div>
    </div>`).join('');
}
```

Replace with:

```js
function renderCertAlerts(){
  const el = document.getElementById('certAlertsList');
  if(!el) return;
  const ca = D.certAlerts || {};
  const items = ca.items || [];
  const total = ca.total || 0;
  document.getElementById('certTotalBadge').textContent = total;
  if(!items.length){
    el.innerHTML = `<div class="cert-row"><div class="cert-org" style="color:var(--dim)">${esc(t('emptyStates.noCerts','No CERT data'))}</div></div>`;
    return;
  }
  el.innerHTML = items.map(r => `
    <div class="cert-row${r.orgUrl?' clickable':''}" style="cursor:${r.orgUrl?'pointer':'default'}"
      ${r.orgUrl?`onclick="window.open('${r.orgUrl}','_blank','noopener noreferrer')"`:''}>
      <div class="cert-org"><div class="co-dot" style="background:${r.color}"></div>${esc(r.label)}</div>
      <div class="cert-count" style="color:${r.color}">${r.count}</div>
    </div>`).join('');
}
```

- [ ] **Step 2: Syntax-check**

```bash
node --check dashboard/public/jarvis.html 2>&1 | head -5 || echo "HTML - check browser console"
```

Open the dashboard in a browser and confirm the CERT Alerts panel still shows (no JS errors in console).

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/jarvis.html
git commit -m "feat(dashboard): renderCertAlerts uses dynamic items array"
```

---

## Task 3: jarvis.html — HTML/CSS layout restructure

**Files:**
- Modify: `dashboard/public/jarvis.html`
  - CSS: lines 42 (`#main` grid), 96 (`.center-area`), 101 (`.map-wrapper`), 102 (`.center-scroll`), 147 (`.bottom-area`)
  - HTML: lines 338–341 (topbar pills), 350–364 (left sidebar), 376–448 (center+right structure)

This task makes all the structural HTML/CSS changes. The JS rendering functions are updated in Task 4.

- [ ] **Step 1: Update `#main` grid to add Stats Row**

Find:
```css
#main{opacity:0;display:grid;grid-template-rows:52px 1fr 30px;grid-template-columns:240px 1fr 320px;height:100vh;height:100dvh;gap:1px;background:rgba(0,229,255,0.04)}
```

Replace with:
```css
#main{opacity:0;display:grid;grid-template-rows:52px 28px 1fr 30px;grid-template-columns:240px 1fr 320px;height:100vh;height:100dvh;gap:1px;background:rgba(0,229,255,0.04)}
```

- [ ] **Step 2: Add Stats Row CSS**

After the `.topbar{...}` CSS line, add:
```css
.stats-row{grid-column:1/-1;grid-row:2;display:flex;align-items:center;gap:6px;padding:0 12px;background:var(--panel);border-bottom:1px solid var(--border);overflow-x:auto;flex-wrap:nowrap}
.stats-row::-webkit-scrollbar{height:2px}
.stats-row::-webkit-scrollbar-thumb{background:rgba(0,229,255,0.15)}
.stat-chip{display:flex;align-items:baseline;gap:5px;padding:2px 8px;border-radius:3px;border:1px solid rgba(255,255,255,0.06);flex-shrink:0}
.sc-val{font-family:var(--mono);font-size:13px;font-weight:700}
.sc-label{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:var(--dim)}
```

- [ ] **Step 3: Update `.sidebar-left`, `.center-area`, `.sidebar-right` grid rows**

Find:
```css
.sidebar-left{grid-column:1;grid-row:2/3;
```
Replace with:
```css
.sidebar-left{grid-column:1;grid-row:3/4;
```

Find:
```css
.center-area{grid-column:2;grid-row:2/3;
```
Replace with:
```css
.center-area{grid-column:2;grid-row:3/4;display:flex;flex-direction:column;overflow-y:auto;background:#080812}
```

Find:
```css
.sidebar-right{grid-column:3;grid-row:2/3;
```
Replace with:
```css
.sidebar-right{grid-column:3;grid-row:3/4;
```

- [ ] **Step 4: Resize map, make Tab area normal flow (not overlaying)**

Find:
```css
.map-wrapper{position:relative;flex:1;min-height:280px;overflow:hidden}
```
Replace with:
```css
.map-wrapper{position:relative;flex:0 0 35vh;min-height:200px;overflow:hidden}
```

Find:
```css
.bottom-area{position:absolute;bottom:0;left:0;right:0;z-index:20;display:flex;flex-direction:column;pointer-events:none}
```
Replace with:
```css
.bottom-area{display:flex;flex-direction:column;flex-shrink:0;border-top:1px solid var(--border)}
```

Find:
```css
.bottom-area.expanded .tab-content{max-height:260px}
```
Replace with:
```css
.bottom-area .tab-content{max-height:260px}
```

Also find and update the `.center-scroll` to allow it to grow:
```css
.center-scroll{flex-shrink:0;max-height:320px;overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border)}
```
Replace with:
```css
.center-scroll{flex:1;overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border)}
```

- [ ] **Step 5: Add map fullscreen CSS**

After the `.map-wrapper` CSS rule, add:
```css
.map-fullscreen{position:fixed!important;inset:0;z-index:9999;flex:none!important;height:100vh!important}
.map-fs-btn{position:absolute;top:6px;right:6px;z-index:25;background:rgba(8,8,18,0.85);border:1px solid var(--border);color:var(--dim);font-size:14px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;line-height:1}
.map-fs-btn:hover{color:var(--accent)}
```

- [ ] **Step 6: Add Stats Row HTML in topbar area**

Find the closing `</div>` of the topbar (line ~348, right after `<div class="meta-ts" id="metaTs">--</div>`):
```html
    <div class="meta-ts" id="metaTs">--</div>
  </div>
```

Insert the Stats Row div immediately after the topbar `</div>`:
```html
    <div class="meta-ts" id="metaTs">--</div>
  </div>
  <!-- Stats Row -->
  <div class="stats-row" id="statsRow"></div>
```

- [ ] **Step 7: Remove 4 redundant stat pills from topbar**

Find and delete these 4 lines (338–341):
```html
    <div class="stat-pill"><div class="sp-val" id="kevCount">--</div><div class="sp-label" data-i18n="threats.activeKevs">活跃 KEV</div></div>
    <div class="stat-pill"><div class="sp-val" id="aptCount">--</div><div class="sp-label" data-i18n="threats.aptGroups">APT 组织</div></div>
    <div class="stat-pill"><div class="sp-val" id="critCve">--</div><div class="sp-label" data-i18n="threats.criticalCves">严重 CVE</div></div>
    <div class="stat-pill"><div class="sp-val" id="iocTotal">--</div><div class="sp-label" data-i18n="threats.totalIocs">IOC 总数</div></div>
```

- [ ] **Step 8: Remove sensorGrid from left sidebar**

Find and delete these 2 lines in the left sidebar:
```html
    <div class="section-hdr"><h4 data-i18n="sidebar.sensorGrid">传感器面板</h4><span class="live-badge" data-i18n="badges.live">实时</span></div>
    <div id="sensorGrid"></div>
```

- [ ] **Step 9: Move layerToggles from left sidebar to center column**

In the left sidebar, find and delete:
```html
    <div class="section-hdr"><h4 data-i18n="sidebar.mapLayers">地图图层</h4></div>
    <div id="layerToggles"></div>
```

In the center column, find the closing `</div>` of `#mapContainer` (around line 410, `</div>` right before `<!-- Below-map panels -->`):
```html
    </div>
    <!-- Below-map panels -->
```

Insert the layer controls between the map closing div and the below-map panels comment:
```html
    </div>
    <!-- Map layers (moved from left sidebar) -->
    <div class="map-layers-bar" id="mapLayersBar">
      <span class="mlb-label" data-i18n="sidebar.mapLayers">图层</span>
      <div id="layerToggles" style="display:flex;flex-wrap:wrap;gap:4px;flex:1"></div>
    </div>
    <!-- Below-map panels -->
```

Add CSS for `.map-layers-bar`:
```css
.map-layers-bar{display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--panel);border-bottom:1px solid var(--border);flex-shrink:0}
.mlb-label{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:var(--dim);flex-shrink:0}
```

- [ ] **Step 10: Move bottomArea out of mapContainer, add fullscreen button to map**

Currently `#bottomArea` is inside `#mapContainer`. Move it out:

Find (inside mapContainer):
```html
      <!-- Floating tabs on map -->
      <div class="bottom-area" id="bottomArea">
        <div class="tab-bar" id="tabBar">
          <button class="tab-btn" data-tab="cve" data-i18n="tabs.cve">CVEs</button>
          <button class="tab-btn" data-tab="attack" data-i18n="tabs.attack">ATT&CK</button>
          <button class="tab-btn" data-tab="actors" data-i18n="tabs.actors">Actors</button>
          <button class="tab-btn" data-tab="china" data-i18n="tabs.china">China</button>
        </div>
        <div class="tab-content">
          <div class="tab-pane" id="tab-cve"><canvas id="cveCanvas"></canvas></div>
          <div class="tab-pane" id="tab-attack"><canvas id="attackCanvas"></canvas></div>
          <div class="tab-pane" id="tab-actors"><div class="actor-grid" id="actorGrid"></div></div>
          <div class="tab-pane" id="tab-china"><div class="china-grid" id="chinaGrid"></div></div>
        </div>
      </div>
      <!-- Map marker popup -->
```

Delete the bottomArea block from inside mapContainer. Then add the fullscreen button and the bottomArea after the mapLayersBar, before the `<!-- Below-map panels -->` comment:

The center column should now read (after mapContainer closing div):
```html
    </div>
    <!-- Map layers -->
    <div class="map-layers-bar" id="mapLayersBar">
      <span class="mlb-label" data-i18n="sidebar.mapLayers">图层</span>
      <div id="layerToggles" style="display:flex;flex-wrap:wrap;gap:4px;flex:1"></div>
    </div>
    <!-- Tab area (moved out of map overlay) -->
    <div class="bottom-area" id="bottomArea">
      <div class="tab-bar" id="tabBar">
        <button class="tab-btn" data-tab="cve" data-i18n="tabs.cve">CVEs</button>
        <button class="tab-btn" data-tab="attack" data-i18n="tabs.attack">ATT&CK</button>
        <button class="tab-btn" data-tab="actors" data-i18n="tabs.actors">Actors</button>
        <button class="tab-btn" data-tab="china" data-i18n="tabs.china">China</button>
      </div>
      <div class="tab-content">
        <div class="tab-pane" id="tab-cve"><canvas id="cveCanvas"></canvas></div>
        <div class="tab-pane" id="tab-attack"><canvas id="attackCanvas"></canvas></div>
        <div class="tab-pane" id="tab-actors"><div class="actor-grid" id="actorGrid"></div></div>
        <div class="tab-pane" id="tab-china"><div class="china-grid" id="chinaGrid"></div></div>
      </div>
    </div>
    <!-- Below-map panels -->
```

Also add the fullscreen button inside `#mapContainer`, right before the map zoom controls:
```html
      <button class="map-fs-btn" id="mapFsBtn" title="全屏">⛶</button>
```

- [ ] **Step 11: Move sweepDelta + hotMetrics from right sidebar to center column**

In the right sidebar, find and delete:
```html
    <div class="section-hdr" style="border-top:1px solid var(--border)"><h4 data-i18n="panels.hotMetrics">热点指标</h4></div>
    <div id="hotMetrics"></div>
    <div class="section-hdr" style="border-top:1px solid var(--border)"><h4 data-i18n="panels.sweepDelta">采集变化</h4><span class="sh-badge" id="sweepDeltaBadge">◆ --</span></div>
    <div id="sweepDelta"></div>
```

In the center column, find the `<!-- Below-map panels -->` section and insert sweepDelta before the AI Brief panel-card (before the `<div class="panel-card">` containing `llmBrief`):

```html
      <!-- Sweep Delta (moved from right sidebar, above fold) -->
      <div class="panel-card" style="flex-shrink:0">
        <div class="panel-hdr"><h4 data-i18n="panels.sweepDelta">采集变化</h4><span class="sh-badge" id="sweepDeltaBadge">◆ --</span></div>
        <div id="sweepDelta"></div>
      </div>
```

And move the AI Brief panel-card to be first (before the sweepDelta or right below it), then CVE Trends, then News Grid. The order in `.center-scroll` should be:

1. AI Brief (highest value, always first)
2. Sweep Delta
3. Tab area (CVE/ATT&CK/Actors/China) — already handled above
4. CVE Trends
5. News Grid

Since bottomArea is now a normal flex item above center-scroll, the center column flow is:
- Region tabs
- Map (35vh)
- Map layers bar
- bottomArea (tabs: CVE/ATT&CK/Actors/China)
- center-scroll: [AI Brief, Sweep Delta, CVE Trends, News Grid]

Move Sweep Delta into center-scroll too. The panel order in `.center-scroll`:

```html
    <div class="center-scroll">
      <div class="panel-card" style="flex-shrink:0">
        <div class="panel-hdr"><h4 data-i18n="panels.aiThreatBrief">AI 威胁简报</h4><span class="ai-badge" data-i18n="ideas.aiEnhanced">AI 增强</span></div>
        <div class="llm-brief" id="llmBrief" style="padding:6px 10px"></div>
      </div>
      <div class="panel-card" style="flex-shrink:0">
        <div class="panel-hdr"><h4 data-i18n="panels.sweepDelta">采集变化</h4><span class="sh-badge" id="sweepDeltaBadge">◆ --</span></div>
        <div id="sweepDelta"></div>
      </div>
      <div class="panel-card">
        <div class="panel-hdr"><h4 data-i18n="panels.cveTrends">CVE 趋势</h4></div>
        <div class="trend-grid" id="trendGrid"></div>
      </div>
      <div class="panel-card">
        <div class="panel-hdr"><h4 data-i18n="panels.securityNews">安全新闻</h4><span class="live-badge" data-i18n="badges.live">实时</span><span class="panel-count" id="newsCount">0 条</span></div>
        <div class="news-grid" id="newsGrid"></div>
      </div>
    </div>
```

- [ ] **Step 12: Verify the dashboard renders (check browser console for errors)**

Open the dashboard URL and confirm:
- No JS errors in console
- Three columns visible
- Stats Row visible (empty for now — filled in Task 4)
- Map shows at ~35% height
- Left sidebar has: Health, CERT Alerts, IOC Monitor (no sensorGrid, no layerToggles)
- Center has: map, layer bar, tab area, center-scroll with AI Brief at top
- Right sidebar has: Signals, Threat Feed (no hotMetrics, no sweepDelta)

- [ ] **Step 13: Commit**

```bash
git add dashboard/public/jarvis.html
git commit -m "feat(dashboard): layout restructure — map 35vh, panels reordered, Stats Row placeholder"
```

---

## Task 4: jarvis.html — JS updates (Stats Row, cleanups, fullscreen)

**Files:**
- Modify: `dashboard/public/jarvis.html` (JS section)

- [ ] **Step 1: Add STATS_CONFIG and renderStatsRow function**

Find the `function updateTopbar(){` line and insert the Stats Row code immediately before it:

```js
// === STATS ROW ===
const STATS_CONFIG = [
  { label: 'KEV',          getValue: d => safe((d.cves||{}).kevCount, 0),                  color: 'var(--red)'     },
  { label: 'Critical CVE', getValue: d => safe((d.cves||{}).criticalCount, 0),             color: 'var(--orange)'  },
  { label: 'IOC',          getValue: d => safe((d.iocs||{}).total, 0),                     color: 'var(--accent)'  },
  { label: 'C2',           getValue: d => safe((d.iocs||{}).c2Count, 0),                   color: 'var(--darkred)' },
  { label: 'APT',          getValue: d => safe(((d.actors||{}).ransomwareGroups||[]).length, 0), color: 'var(--purple)' },
  { label: 'CERT',         getValue: d => safe((d.certAlerts||{}).total, 0),               color: 'var(--green)'   },
  { label: 'Geo',          getValue: d => safe((d.geoAttacks||[]).length, 0),              color: 'var(--blue)'    },
];

function renderStatsRow(){
  const el = document.getElementById('statsRow');
  if(!el) return;
  el.innerHTML = STATS_CONFIG.map(cfg => {
    const val = cfg.getValue(D);
    return `<div class="stat-chip"><span class="sc-val" style="color:${cfg.color}">${val}</span><span class="sc-label">${esc(cfg.label)}</span></div>`;
  }).join('');
}
```

- [ ] **Step 2: Update `updateTopbar` to remove deleted element references**

Find in `updateTopbar()`:
```js
  document.getElementById('kevCount').textContent = safe(cves.kevCount, 0);
  document.getElementById('aptCount').textContent = safe((actors.ransomwareGroups||[]).length, 0);
  document.getElementById('critCve').textContent = safe(cves.criticalCount, 0);
  document.getElementById('iocTotal').textContent = safe(iocs.total, 0);
```

Delete those 4 lines entirely.

- [ ] **Step 3: Add map fullscreen toggle function**

Find `function renderLayers(){` and insert before it:

```js
// === MAP FULLSCREEN ===
(function(){
  const btn = document.getElementById('mapFsBtn');
  if(!btn) return;
  btn.addEventListener('click', () => {
    const map = document.getElementById('mapContainer');
    const isFs = map.classList.toggle('map-fullscreen');
    btn.textContent = isFs ? '✕' : '⛶';
    btn.title = isFs ? '退出全屏' : '全屏';
    if(!isFs) {
      // Re-render map at original size after exit
      setTimeout(() => { if(mapMode==='flat') drawFlatMap(); else plotGlobeMarkers(); }, 50);
    }
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      const map = document.getElementById('mapContainer');
      if(map.classList.contains('map-fullscreen')){
        map.classList.remove('map-fullscreen');
        btn.textContent = '⛶';
        btn.title = '全屏';
        setTimeout(() => { if(mapMode==='flat') drawFlatMap(); else plotGlobeMarkers(); }, 50);
      }
    }
  });
})();
```

- [ ] **Step 4: Remove renderSensorGrid and renderHotMetrics from updateAll()**

Find in `updateAll()`:
```js
  renderSensorGrid();
```
Delete that line.

Find:
```js
  renderHotMetrics();
```
Delete that line.

- [ ] **Step 5: Add renderStatsRow call to updateAll()**

In `updateAll()`, find `updateTopbar();` and add `renderStatsRow();` immediately after:
```js
  updateTopbar();
  renderStatsRow();
```

- [ ] **Step 6: Fix updateAll tab expand check (bottomArea is no longer inside map)**

Find in `updateAll()`:
```js
  if(activeTab && document.getElementById('bottomArea').classList.contains('expanded')){
```
Replace with:
```js
  if(activeTab && document.getElementById('bottomArea')){
```

- [ ] **Step 7: Check browser — Stats Row shows 7 chips, map has fullscreen button**

Open dashboard. Confirm:
- Stats Row shows 7 colored number chips
- Map has ⛶ button top-right; clicking it makes map fullscreen; Esc exits
- No console errors

- [ ] **Step 8: Commit**

```bash
git add dashboard/public/jarvis.html
git commit -m "feat(dashboard): Stats Row, map fullscreen, remove redundant panel JS"
```

---

## Task 5: jarvis.html — drill-down links

**Files:**
- Modify: `dashboard/public/jarvis.html` (JS render functions)

Add `target="_blank" rel="noopener noreferrer"` links to every panel that has source URLs. All items use `cursor:pointer` + `opacity:0.85` on hover. No underlines.

First add the hover CSS once (find `.cert-row{` or similar and add after it):
```css
.clickable{cursor:pointer}
.clickable:hover{opacity:0.85}
```

- [ ] **Step 1: renderIOCMonitor — add search URL drill-down**

Find the `renderIOCMonitor` function. Replace the rows definition:

```js
  const rows = [
    { name:t('ioc.malware','Malware Samples'), val:Array.isArray(iocs.malware)?iocs.malware.length:0, color:'var(--red)', key:'malware' },
    { name:t('ioc.c2','C2 Servers'), val:safe(iocs.c2Count,0), color:'var(--darkred)', key:'c2' },
    { name:t('ioc.maliciousIPs','Malicious IPs'), val:Array.isArray(iocs.maliciousIPs)?iocs.maliciousIPs.length:0, color:'var(--orange)', key:'maliciousIPs' },
    { name:t('ioc.phishing','Phishing URLs'), val:safe(iocs.phishCount,0), color:'var(--yellow)', key:'phishing' },
  ];
```

Replace with:

```js
  const rows = [
    { name:t('ioc.malware','Malware Samples'), val:Array.isArray(iocs.malware)?iocs.malware.length:0, color:'var(--red)',     key:'malware',    url:'https://bazaar.abuse.ch/browse/' },
    { name:t('ioc.c2','C2 Servers'),           val:safe(iocs.c2Count,0),                              color:'var(--darkred)', key:'c2',          url:'https://threatfox.abuse.ch/browse/' },
    { name:t('ioc.maliciousIPs','Malicious IPs'), val:Array.isArray(iocs.maliciousIPs)?iocs.maliciousIPs.length:0, color:'var(--orange)', key:'maliciousIPs', url:'https://www.abuseipdb.com/' },
    { name:t('ioc.phishing','Phishing URLs'),   val:safe(iocs.phishCount,0),                           color:'var(--yellow)', key:'phishing',    url:'https://www.phishtank.com/phish_search.php' },
  ];
```

And update the HTML template in `el.innerHTML`:
```js
  el.innerHTML = rows.map(r => `
    <div class="ioc-row clickable" onclick="window.open('${r.url}','_blank','noopener noreferrer')" data-key="${r.key}">
      <div class="ioc-left"><div class="ioc-dot" style="background:${r.color};box-shadow:0 0 4px ${r.color}"></div><span class="ioc-name">${esc(r.name)}</span></div>
      <div class="ioc-val" style="color:${r.color}">${r.val}</div>
    </div>`).join('');
```

- [ ] **Step 2: renderFeed — make each item clickable**

Find in `renderFeed()` the `innerHTML` template. Find where feed items are rendered and locate the `<div class="feed-item"` template. Add `onclick` if `item.url` exists:

Find the feed item template (will look like):
```js
    el.innerHTML += `<div class="feed-item ${lvl}">...`;
```

Add clickable wrapper — find the feed item div construction and add:
```js
    const clickAttr = item.url ? ` class="feed-item ${lvl} clickable" onclick="window.open('${item.url}','_blank','noopener noreferrer')"` : ` class="feed-item ${lvl}"`;
```

Then use `clickAttr` in the template: `<div${clickAttr}>`.

(Read the exact renderFeed template first to apply precisely — the pattern is consistent.)

- [ ] **Step 3: renderNewsCards — cards already have url field, add onclick**

Find in `renderNewsCards()` the card template. Locate where `item.url` is used (it's already in the `<a>` tag for the title). Ensure the entire card div is also clickable:

Find:
```js
    <div class="news-card">
```
Replace with:
```js
    <div class="news-card clickable" onclick="window.open('${esc(item.url||'')}','_blank','noopener noreferrer')">
```

- [ ] **Step 4: renderActors — link each card to ransomware.live**

Find `renderActors()`. Find the actor card template and add `onclick`:

```js
  grid.innerHTML = (groups||[]).map(g => {
    const slug = encodeURIComponent((g.name||'').toLowerCase().replace(/\s+/g,'-'));
    return `<div class="actor-card clickable" onclick="window.open('https://ransomware.live/group/${slug}','_blank','noopener noreferrer')">
      <div class="actor-name">${esc(g.name||'')}</div>
      <div class="actor-victims">${safe(g.victimCount,0)} victims</div>
    </div>`;
  }).join('');
```

- [ ] **Step 5: renderChinaIntel — link CERT alert items**

Find `renderChinaIntel()`. Where CERT alert items are rendered, add `onclick` for items with `url`:

In the alerts list template, add:
```js
const alertHtml = (alerts||[]).map(a => `
  <div class="china-alert-item${a.url?' clickable':''}" ${a.url?`onclick="window.open('${a.url}','_blank','noopener noreferrer')"`:''}>
    <span class="ca-date">${fmtTime(a.date)}</span>
    <span class="ca-title">${esc((a.title||'').substring(0,80))}</span>
  </div>`).join('');
```

- [ ] **Step 6: renderCveTrends — KEV and Critical cards link out**

Find `renderCveTrends()` and the trendGrid template. For the KEV and Critical count cards, add `onclick`:

```js
  const trends = [
    { label: t('cveTimeline.total','Total Tracked'), val: safe(cves.totalTracked,0), cls:'', url:'' },
    { label: t('cveTimeline.critical','Critical'),    val: safe(cves.criticalCount,0), cls:'orange', url:'https://nvd.nist.gov/vuln/search?results_type=overview&search_type=all&cvss_version=3&cvss_v3_severity=CRITICAL' },
    { label: t('cveTimeline.inKev','In KEV'),         val: safe(cves.kevCount,0), cls:'red', url:'https://www.cisa.gov/known-exploited-vulnerabilities-catalog' },
    { label: t('cveTimeline.hasPoc','Has PoC'),       val: (cves.recent||[]).filter(c=>c.hasPoc).length, cls:'', url:'' },
    { label: t('cveTimeline.avgCvss','Avg CVSS'),     val: ..., cls:'', url:'' },
    { label: t('cveTimeline.recent','Last 7 Days'),   val: safe((cves.recent||[]).length,0), cls:'', url:'' },
  ];
  grid.innerHTML = trends.map(tr => `
    <div class="trend-card${tr.url?' clickable':''}" ${tr.url?`onclick="window.open('${tr.url}','_blank','noopener noreferrer')"`:''}>
      <div class="tr-val ${tr.cls}">${tr.val}</div>
      <div class="tr-label">${esc(tr.label)}</div>
    </div>`).join('');
```

(Read the exact current renderCveTrends to find the avgCvss calculation and splice it in.)

- [ ] **Step 7: Map popup — add detail button**

Find `showMapPopup` or the popupContent rendering. Find where `popupContent.innerHTML` is set. Add a "查看详情" button at the bottom:

```js
  let detailLink = '';
  if(d.cveId) detailLink = `<a href="https://nvd.nist.gov/vuln/detail/${encodeURIComponent(d.cveId)}" target="_blank" rel="noopener noreferrer" class="popup-detail-btn">查看 NVD ↗</a>`;
  else if(d.ip) detailLink = `<a href="https://www.abuseipdb.com/check/${encodeURIComponent(d.ip)}" target="_blank" rel="noopener noreferrer" class="popup-detail-btn">查看 AbuseIPDB ↗</a>`;
```

Add CSS:
```css
.popup-detail-btn{display:inline-block;margin-top:6px;font-size:10px;color:var(--accent);text-decoration:none;border:1px solid var(--border);padding:2px 6px;border-radius:2px}
.popup-detail-btn:hover{background:rgba(0,229,255,0.08)}
```

- [ ] **Step 8: Check browser — all panels are clickable**

Open dashboard and verify:
- IOC Monitor rows open correct search pages on click
- News cards open article URLs on click
- Actor cards open ransomware.live on click
- CVE Trends KEV card opens CISA catalog on click
- Map popup has detail button for markers with cveId or ip
- No JS errors in console

- [ ] **Step 9: Commit**

```bash
git add dashboard/public/jarvis.html
git commit -m "feat(dashboard): drill-down links for all panels — target=_blank"
```

---

## Task 6: Health Grid — domain grouping

**Files:**
- Modify: `dashboard/inject.mjs:1012-1018` (health generation)
- Modify: `dashboard/public/jarvis.html` (renderHealth function + CSS)

These two files must be updated together and committed together — the new D.health structure breaks renderHealth until it's updated.

The 5 domains come from `apis/briefing.mjs` comments:
- Domain 1: Vulnerability Intelligence — CISA-KEV, NVD, EPSS, GitHub-Advisory, ExploitDB, OSV
- Domain 2: Threat Actors & Malware — OTX, MalwareBazaar, ThreatFox, Feodo, ATT&CK-STIX, VirusTotal, URLhaus
- Domain 3: Attack Activity & Exposure — GreyNoise, Shodan, AbuseIPDB, Cloudflare-Radar, Shadowserver, Spamhaus, BGP-Ranking, PhishTank
- Domain 4: Event Tracking & Intel Community — Ransomware-Live, ENISA, CISA-Alerts, CERTs-Intl, Bluesky, Telegram
- Domain 5: China Intelligence — CNCERT, CNVD, CNNVD, Qianxin, FOFA, ZoomEye, FreeBuf, Anquanke, 4hou

- [ ] **Step 1: Update health generation in inject.mjs**

Find the health generation block (lines 1012–1018):
```js
  // Source health
  const health = Object.entries(data.sources).map(([name, src]) => ({
    n: name,
    err: src.status !== 'active',
    reason: src.status !== 'active' ? (src.reason || 'unknown') : null,
    stale: Boolean(src.stale),
  }));
```

Replace with:
```js
  // Source health — grouped by domain
  const HEALTH_DOMAINS = [
    { domain: 'domain1', label: 'Vuln Intel',       sources: ['CISA-KEV','NVD','EPSS','GitHub-Advisory','ExploitDB','OSV'] },
    { domain: 'domain2', label: 'Threat Actors',    sources: ['OTX','MalwareBazaar','ThreatFox','Feodo','ATT&CK-STIX','VirusTotal','URLhaus'] },
    { domain: 'domain3', label: 'Attack/Exposure',  sources: ['GreyNoise','Shodan','AbuseIPDB','Cloudflare-Radar','Shadowserver','Spamhaus','BGP-Ranking','PhishTank'] },
    { domain: 'domain4', label: 'Event Tracking',   sources: ['Ransomware-Live','ENISA','CISA-Alerts','CERTs-Intl','Bluesky','Telegram'] },
    { domain: 'domain5', label: 'China Intel',      sources: ['CNCERT','CNVD','CNNVD','Qianxin','FOFA','ZoomEye','FreeBuf','Anquanke','4hou'] },
  ];

  const sourceMap = Object.fromEntries(
    Object.entries(data.sources).map(([name, src]) => [name, {
      n: name,
      err: src.status !== 'active',
      reason: src.status !== 'active' ? (src.reason || 'unknown') : null,
      stale: Boolean(src.stale),
    }])
  );

  const health = HEALTH_DOMAINS.map(({ domain, label, sources }) => {
    const domainSources = sources
      .filter(name => name in sourceMap)
      .map(name => sourceMap[name]);
    // Also include any sources in this domain that appeared at runtime but aren't in the list yet
    return { domain, label, sources: domainSources };
  }).filter(d => d.sources.length > 0);
```

- [ ] **Step 2: Add SOURCE_HOME_URLS constant in inject.mjs (for health dot links)**

Immediately after the HEALTH_DOMAINS constant, add:

```js
  const SOURCE_HOME_URLS = {
    'CISA-KEV': 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    'NVD': 'https://nvd.nist.gov/',
    'EPSS': 'https://www.first.org/epss/',
    'GitHub-Advisory': 'https://github.com/advisories',
    'ExploitDB': 'https://www.exploit-db.com/',
    'OSV': 'https://osv.dev/',
    'OTX': 'https://otx.alienvault.com/',
    'MalwareBazaar': 'https://bazaar.abuse.ch/',
    'ThreatFox': 'https://threatfox.abuse.ch/',
    'Feodo': 'https://feodotracker.abuse.ch/',
    'ATT&CK-STIX': 'https://attack.mitre.org/',
    'VirusTotal': 'https://www.virustotal.com/',
    'URLhaus': 'https://urlhaus.abuse.ch/',
    'GreyNoise': 'https://www.greynoise.io/',
    'Shodan': 'https://www.shodan.io/',
    'AbuseIPDB': 'https://www.abuseipdb.com/',
    'Cloudflare-Radar': 'https://radar.cloudflare.com/',
    'Shadowserver': 'https://www.shadowserver.org/',
    'Spamhaus': 'https://www.spamhaus.org/',
    'BGP-Ranking': 'https://bgpranking.circl.lu/',
    'PhishTank': 'https://www.phishtank.com/',
    'Ransomware-Live': 'https://ransomware.live/',
    'ENISA': 'https://www.enisa.europa.eu/',
    'CISA-Alerts': 'https://www.cisa.gov/news-events/alerts',
    'CERTs-Intl': 'https://www.first.org/members/',
    'Bluesky': 'https://bsky.app/',
    'Telegram': 'https://t.me/',
    'CNCERT': 'https://www.cert.org.cn/',
    'CNVD': 'https://www.cnvd.org.cn/',
    'CNNVD': 'https://www.cnnvd.org.cn/',
    'Qianxin': 'https://ti.qianxin.com/',
    'FOFA': 'https://fofa.info/',
    'ZoomEye': 'https://www.zoomeye.org/',
    'FreeBuf': 'https://www.freebuf.com/',
    'Anquanke': 'https://www.anquanke.com/',
    '4hou': 'https://www.4hou.com/',
  };
```

Then in the sourceMap construction, add `url` field:
```js
  const sourceMap = Object.fromEntries(
    Object.entries(data.sources).map(([name, src]) => [name, {
      n: name,
      err: src.status !== 'active',
      reason: src.status !== 'active' ? (src.reason || 'unknown') : null,
      stale: Boolean(src.stale),
      url: SOURCE_HOME_URLS[name] || '',
    }])
  );
```

- [ ] **Step 3: Syntax-check inject.mjs**

```bash
node --check dashboard/inject.mjs && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Update renderHealth in jarvis.html**

Find the entire `renderHealth` function (lines 952–963):

```js
function renderHealth(){
  const grid = document.getElementById('healthGrid');
  const items = D.health || [];
  grid.innerHTML = '';
  items.forEach(h => {
    const cls = h.err ? 'err' : h.stale ? 'stale' : 'ok';
    const el = document.createElement('div');
    el.className = 'health-item';
    el.innerHTML = `<div class="health-dot ${cls}"></div><span>${esc(h.n)}</span>`;
    grid.appendChild(el);
  });
}
```

Replace with:

```js
function renderHealth(){
  const grid = document.getElementById('healthGrid');
  const domains = D.health || [];
  grid.innerHTML = '';

  // Support both old flat array (fallback) and new grouped array
  if(domains.length && !domains[0].domain){
    // Flat array fallback — render as before
    domains.forEach(h => {
      const cls = h.err ? 'err' : h.stale ? 'stale' : 'ok';
      const el = document.createElement('div');
      el.className = 'health-item';
      el.innerHTML = `<div class="health-dot ${cls}"></div><span>${esc(h.n)}</span>`;
      grid.appendChild(el);
    });
    return;
  }

  domains.forEach(domain => {
    const okCount = domain.sources.filter(s => !s.err && !s.stale).length;
    const total = domain.sources.length;
    const allOk = okCount === total;
    const anyErr = domain.sources.some(s => s.err);

    const domainEl = document.createElement('div');
    domainEl.className = 'health-domain';
    domainEl.innerHTML = `
      <div class="health-domain-hdr" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="hd-label">${esc(domain.label)}</span>
        <span class="hd-ratio ${anyErr?'err':okCount<total?'stale':'ok'}">${okCount}/${total}</span>
        <span class="hd-arrow">›</span>
      </div>
      <div class="health-domain-body">
        ${domain.sources.map(s => {
          const cls = s.err ? 'err' : s.stale ? 'stale' : 'ok';
          const tip = s.err ? (s.reason || 'inactive') : s.stale ? 'stale' : 'ok';
          const clickAttr = s.url ? `onclick="window.open('${s.url}','_blank','noopener noreferrer')"` : '';
          return `<div class="health-item${s.url?' clickable':''}" title="${esc(s.n)}: ${tip}" ${clickAttr}>
            <div class="health-dot ${cls}"></div><span>${esc(s.n)}</span>
          </div>`;
        }).join('')}
      </div>`;
    grid.appendChild(domainEl);
  });

  // Update badge
  const allSources = domains.flatMap(d => d.sources);
  const ok = allSources.filter(s => !s.err && !s.stale).length;
  const badge = document.getElementById('healthBadge');
  if(badge) badge.textContent = `${ok}/${allSources.length}`;
}
```

- [ ] **Step 5: Add CSS for health domain groups**

Find `.health-grid{...}` CSS and add after it:

```css
.health-domain{margin-bottom:2px}
.health-domain-hdr{display:flex;align-items:center;gap:6px;padding:3px 4px;cursor:pointer;border-radius:2px}
.health-domain-hdr:hover{background:rgba(255,255,255,0.04)}
.hd-label{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:var(--dim);flex:1}
.hd-ratio{font-family:var(--mono);font-size:10px}
.hd-ratio.ok{color:var(--green)}
.hd-ratio.stale{color:var(--yellow)}
.hd-ratio.err{color:var(--red)}
.hd-arrow{font-size:10px;color:var(--dim);transition:transform 0.15s}
.health-domain.expanded .hd-arrow{transform:rotate(90deg)}
.health-domain-body{display:none;padding-left:8px}
.health-domain.expanded .health-domain-body{display:grid;grid-template-columns:1fr 1fr;gap:1px}
```

Also update `updateAll()` badge line — find:
```js
  const hOk = h.filter(s=>!s.err&&!s.stale).length;
```
This is in `updateAll` around line 1814. The `renderHealth()` function now sets the badge itself, so check if there's a duplicate badge update in `updateAll()` and remove it if so.

- [ ] **Step 6: Syntax check and browser verify**

```bash
node --check dashboard/inject.mjs && echo "OK"
```

Open dashboard — verify:
- Left sidebar shows 5 domain rows with ratio badges (e.g., `Vuln Intel 6/6`)
- Clicking a domain row expands to show individual source dots
- Each source dot is clickable → opens that source's homepage
- No JS errors in console

- [ ] **Step 7: Commit both files together**

```bash
git add dashboard/inject.mjs dashboard/public/jarvis.html
git commit -m "feat(dashboard): health grid grouped by domain with expand/collapse and source links"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Map 35% height | Task 3 Step 4 |
| Map fullscreen button | Task 3 Step 10 + Task 4 Step 3 |
| Map layers moved to below map | Task 3 Step 9 |
| AI Brief above fold | Task 3 Step 11 |
| Sweep Delta moved to center | Task 3 Step 11 |
| Sensor Grid deleted | Task 3 Step 8 |
| Hot Metrics deleted | Task 3 Step 11 |
| 4 topbar pills removed | Task 3 Step 7 |
| Stats Row (data-driven, 7 chips) | Task 3 Step 6 + Task 4 Step 1 |
| certAlerts dynamic items | Task 1 |
| renderCertAlerts dynamic | Task 2 |
| health grouped by domain | Task 6 |
| health source URLs | Task 6 Step 2 |
| Drill-down: IOC Monitor | Task 5 Step 1 |
| Drill-down: Threat Feed | Task 5 Step 2 |
| Drill-down: News Grid | Task 5 Step 3 |
| Drill-down: Actors | Task 5 Step 4 |
| Drill-down: China CERT alerts | Task 5 Step 5 |
| Drill-down: CVE Trends | Task 5 Step 6 |
| Drill-down: Map popup | Task 5 Step 7 |
| Tab area out of map overlay | Task 3 Step 10 |
| Bottom Ticker unchanged | Not touched ✓ |
| briefing.mjs unchanged | Not touched ✓ |
| sources/*.mjs unchanged | Not touched ✓ |

**Type/name consistency:**
- `D.certAlerts.items` — defined in Task 1, read in Task 2 ✓
- `D.health[].domain` — defined in Task 6 Step 1, read in Task 6 Step 4 ✓
- `D.health[].sources[].url` — defined in Task 6 Step 2, read in Task 6 Step 4 ✓
- `STATS_CONFIG` — defined in Task 4 Step 1, called in Task 4 Step 5 ✓
- `.map-fullscreen` — CSS in Task 3 Step 5, toggled in Task 4 Step 3 ✓
- `.health-domain.expanded` — CSS in Task 6 Step 5, toggled in Task 6 Step 4 ✓
