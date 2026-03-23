/* ─────────────────────────────────────────────────────────────
   Ideenschmiede — Frontend App
   Handles: SSE connection, backlog rendering, agent status,
            cost tracking, modal detail view
   ───────────────────────────────────────────────────────────── */

// ── Markdown renderer (CDN-free, included via marked from CDN) ──
// We load marked dynamically to avoid bundler setup
let markedLoaded = false;
let _marked = null;

async function ensureMarked() {
  if (_marked) return _marked;
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js';
    script.onload = () => {
      _marked = window.marked;
      markedLoaded = true;
      resolve(_marked);
    };
    document.head.appendChild(script);
  });
}

function mdToHtml(text) {
  if (_marked) {
    return _marked.parse(text, { breaks: true, gfm: true });
  }
  // Fallback: simple escaping + line breaks
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ── State ──────────────────────────────────────────────────────
const state = {
  agents: {},         // agentId → AgentStatus
  ideas: [],          // raw entry objects
  products: [],
  plans: [],
  connected: false,
  reconnectAttempts: 0,
};

// ── DOM refs ───────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  agentsGrid:     $('agentsGrid'),
  ideaList:       $('ideaList'),
  productList:    $('productList'),
  ideaCount:      $('ideaCount'),
  productCount:   $('productCount'),
  dpdCount:       $('dpdCount'),
  totalCost:      $('totalCost'),
  totalCalls:     $('totalCalls'),
  totalSearches:  $('totalSearches'),
  connectionStatus: $('connectionStatus'),
  activityLog:    $('activityLog'),
  costBreakdown:  $('costBreakdown'),
  modalOverlay:   $('modalOverlay'),
  modalTitle:     $('modalTitle'),
  modalBody:      $('modalBody'),
};

// ── Logging ────────────────────────────────────────────────────
function log(message, type = 'info') {
  const now = new Date().toLocaleTimeString('de-DE', { hour12: false });
  const entry = document.createElement('p');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">${now}</span>${message}`;
  els.activityLog.prepend(entry);
  // Keep log to 200 entries
  while (els.activityLog.children.length > 200) {
    els.activityLog.removeChild(els.activityLog.lastChild);
  }
}

function clearLog() {
  els.activityLog.innerHTML = '';
}
window.clearLog = clearLog;

// ── SSE Connection ─────────────────────────────────────────────
let evtSource = null;

function connect() {
  if (evtSource) evtSource.close();

  evtSource = new EventSource('/api/events');

  evtSource.addEventListener('connected', () => {
    state.connected = true;
    state.reconnectAttempts = 0;
    setConnectionStatus('connected', 'Verbunden');
    log('SSE-Verbindung hergestellt', 'success');
    // Load initial data
    loadInitialData();
  });

  evtSource.addEventListener('status_update', (e) => {
    const agentStatus = JSON.parse(e.data);
    state.agents[agentStatus.id] = agentStatus;
    renderAgentCard(agentStatus);
    if (agentStatus.status === 'running') {
      log(`[${agentStatus.id}] ${agentStatus.lastMessage}`, 'running');
    } else if (agentStatus.status === 'error') {
      log(`[${agentStatus.id}] ${agentStatus.lastMessage}`, 'error');
    }
  });

  evtSource.addEventListener('backlog_update', (e) => {
    const data = JSON.parse(e.data);
    log(`📥 Backlog-Update: ${data.type} — ${data.ideaId || data.productId || data.planId}`, 'success');
    // Reload the affected backlog
    loadBacklogs();
  });

  evtSource.addEventListener('costs_update', (e) => {
    const costs = JSON.parse(e.data);
    renderCosts(costs);
  });

  evtSource.addEventListener('team_started', (e) => {
    const data = JSON.parse(e.data);
    log(`🔬 Team-Analyse gestartet: ${data.productId} — "${data.title}"`, 'running');
  });

  evtSource.addEventListener('team_completed', (e) => {
    const data = JSON.parse(e.data);
    log(`✅ Team-Analyse abgeschlossen: ${data.planId} (aus ${data.productId})`, 'success');
    loadBacklogs();
    loadPlans();
  });

  evtSource.onerror = () => {
    state.connected = false;
    state.reconnectAttempts++;
    setConnectionStatus('error', `Getrennt (${state.reconnectAttempts})`);
    log('SSE-Verbindung verloren — Browser versucht Reconnect…', 'error');
  };
}

function setConnectionStatus(cls, text) {
  const el = els.connectionStatus;
  el.className = `status-badge ${cls}`;
  el.textContent = text;
}

// ── Initial data load ──────────────────────────────────────────
async function loadInitialData() {
  await ensureMarked();
  await Promise.all([
    loadBacklogs(),
    loadPlans(),
    loadAgentStatuses(),
    loadCosts(),
  ]);
}

async function loadBacklogs() {
  try {
    const res = await fetch('/api/backlogs');
    const data = await res.json();
    renderBacklog('ideas',    data.ideas,    els.ideaList,    els.ideaCount,    'idea');
    renderBacklog('products', data.products, els.productList, els.productCount, 'product');
  } catch (err) {
    log('Fehler beim Laden der Backlogs: ' + err.message, 'error');
  }
}

async function loadPlans() {
  try {
    const res   = await fetch('/api/plans');
    const plans = await res.json();
    renderDpdTable(plans);
  } catch (err) {
    log('Fehler beim Laden der DPDs: ' + err.message, 'error');
  }
}

function renderDpdTable(plans) {
  const tbody   = $('dpdTableBody');
  if (!tbody) return;
  els.dpdCount.textContent = String(plans.length);

  if (plans.length === 0) {
    tbody.innerHTML = '<tr class="dpd-empty"><td colspan="5">🔬 Spezialisten-Teams bewerten noch — DPDs erscheinen hier nach Abschluss.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  for (const plan of plans) {
    const tr = document.createElement('tr');
    tr.className = 'dpd-row';
    tr.title = 'Plan im Browser öffnen';
    tr.innerHTML = `
      <td>${getPriorityBadge(plan.recommendation, plan.priority)}</td>
      <td class="dpd-id">${escHtml(plan.id)}</td>
      <td class="dpd-title">${escHtml(plan.title)}</td>
      <td class="dpd-source">${escHtml(plan.sourceProductId)}</td>
      <td class="dpd-date">${formatDate(plan.created)}</td>
    `;
    tr.addEventListener('click', () => window.open(`/api/plans/${plan.id}`, '_blank'));
    tbody.appendChild(tr);
  }
}

function getPriorityBadge(recommendation, priority) {
  const map = {
    1: ['invest',  '✅ Investieren'],
    2: ['bedingt', '⚠️ Bedingt'],
    3: ['nicht',   '❌ Nicht'],
    4: ['unknown', '❓ Unbekannt'],
  };
  const [cls, label] = map[priority] ?? map[4];
  return `<span class="dpd-badge ${cls}">${escHtml(label)}</span>`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString.trim()).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return isoString.trim(); }
}

async function loadAgentStatuses() {
  try {
    const res = await fetch('/api/agents/status');
    const statuses = await res.json();
    for (const s of statuses) {
      state.agents[s.id] = s;
      renderAgentCard(s);
    }
  } catch { /* silently ignore on initial load */ }
}

async function loadCosts() {
  try {
    const res = await fetch('/api/costs');
    const costs = await res.json();
    renderCosts(costs);
  } catch { /* silently ignore */ }
}

// ── Backlog rendering ──────────────────────────────────────────
function renderBacklog(type, markdownText, listEl, countEl, cardClass) {
  if (!markdownText || !markdownText.trim()) return;

  const entries = parseBacklogEntries(markdownText, type);
  countEl.textContent = String(entries.length);

  if (entries.length === 0) return;

  listEl.innerHTML = '';
  for (const entry of entries) {
    listEl.appendChild(buildEntryCard(entry, cardClass));
  }
}

function parseBacklogEntries(text, type) {
  const prefixMap = { ideas: 'IDEA', products: 'PROD', plans: 'PLAN' };
  const prefix = prefixMap[type];
  const entries = [];

  // Split on metadata comment markers
  const parts = text.split(/(?=<!-- (?:IDEA|PROD|PLAN)-)/);
  for (const part of parts) {
    if (!part.includes(`<!-- ${prefix}-`)) continue;

    const metaMatch = /<!-- ((?:IDEA|PROD|PLAN)-\d+) \| status: ([^|]+)(?:\| source: ([^|]+))?(?:\| agent: ([^|>]+))?/.exec(part);
    const titleMatch = /## (?:Idee|Produkt|Plan)-\d+:\s*(.+)/.exec(part);

    if (!metaMatch) continue;

    const id     = metaMatch[1].trim();
    const status = metaMatch[2].trim();
    const source = metaMatch[3]?.trim();
    const agent  = metaMatch[4]?.trim();
    const title  = titleMatch ? titleMatch[1].trim() : id;

    // Extract preview text (first descriptive paragraph after the header)
    const preview = extractPreview(part);

    entries.push({ id, status, source, agent, title, preview, raw: part });
  }

  return entries;
}

function extractPreview(text) {
  // Remove comment lines and header, get first meaningful text
  const lines = text
    .split('\n')
    .filter(l => !l.startsWith('<!--') && !l.startsWith('##') && !l.startsWith('**Status') && l.trim());
  const first = lines.slice(0, 4).join(' ').replace(/\*\*[^*]+\*\*/g, '').trim();
  return first.slice(0, 200) + (first.length > 200 ? '…' : '');
}

function buildEntryCard(entry, cardClass) {
  const card = document.createElement('div');
  card.className = `entry-card ${cardClass}-card`;
  card.dataset.entryId = entry.id;

  const statusPill = getStatusPill(entry.status);
  const agentText  = entry.agent ? entry.agent.replace(/\s*$/, '') : '';

  card.innerHTML = `
    <div class="entry-id">${entry.id}${entry.source ? ` ← ${entry.source}` : ''}</div>
    <div class="entry-title">${escHtml(entry.title)}</div>
    <div class="entry-preview">${escHtml(entry.preview)}</div>
    <div class="entry-footer">
      ${statusPill}
      <span class="entry-agent">${escHtml(agentText)}</span>
    </div>
  `;
  card.addEventListener('click', () => openModal(entry));
  return card;
}

function getStatusPill(status) {
  const map = {
    'PENDING':        ['pill-pending',     'PENDING'],
    'IN_PROGRESS':    ['pill-in-progress', 'IN PROGRESS'],
    'DONE':           ['pill-done',        'DONE'],
    'PENDING_REVIEW': ['pill-pending',     'PENDING REVIEW'],
    'IN_REVIEW':      ['pill-in-progress', 'IN REVIEW'],
    'REVIEWED':       ['pill-done',        'REVIEWED'],
    'FINAL':          ['pill-final',       'FINAL'],
  };
  const key = status.split(' ')[0].toUpperCase();
  const [cls, label] = map[key] || ['pill-pending', status];
  return `<span class="pill ${cls}">${label}</span>`;
}

// ── Agent cards ────────────────────────────────────────────────
function renderAgentCard(agentStatus) {
  let card = document.querySelector(`[data-agent-id="${agentStatus.id}"]`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'agent-card';
    card.dataset.agentId = agentStatus.id;
    els.agentsGrid.appendChild(card);
  }

  card.className = `agent-card ${agentStatus.status}`;
  card.innerHTML = `
    <div class="agent-card-header">
      <span class="agent-card-id">${escHtml(agentStatus.id)}</span>
      <span class="status-badge ${agentStatus.status}">${agentStatus.status}</span>
    </div>
    <div class="agent-card-role">${escHtml(agentStatus.role)}</div>
    <div class="agent-card-message" title="${escHtml(agentStatus.lastMessage)}">${escHtml(agentStatus.lastMessage)}</div>
    <div class="agent-card-meta">
      <span>Zyklen: ${agentStatus.runCount}</span>
      ${agentStatus.errorCount > 0 ? `<span style="color:var(--error)">Fehler: ${agentStatus.errorCount}</span>` : ''}
      ${agentStatus.lastRun ? `<span>${new Date(agentStatus.lastRun).toLocaleTimeString('de-DE')}</span>` : ''}
    </div>
  `;
}

// ── Cost rendering ─────────────────────────────────────────────
function renderCosts(costs) {
  if (!costs) return;

  const t = costs.total;
  els.totalCost.textContent     = '$' + (t.totalCostUSD ?? 0).toFixed(4);
  els.totalSearches.textContent = String(t.webSearchRequests ?? 0);

  // Sum up all calls
  const totalCalls = Object.values(costs.agents || {}).reduce((s, a) => s + (a.calls || 0), 0);
  els.totalCalls.textContent = String(totalCalls);

  // Per-agent breakdown
  const agents = costs.agents || {};
  const keys   = Object.keys(agents);
  if (keys.length === 0) return;

  els.costBreakdown.innerHTML = '';
  for (const id of keys) {
    const a    = agents[id];
    const card = document.createElement('div');
    card.className = 'cost-agent-card';
    card.innerHTML = `
      <span class="agent-id">${escHtml(id)}</span>
      <span class="agent-cost-val">$${(a.totalCostUSD ?? 0).toFixed(4)}</span>
      <div class="agent-cost-meta">
        In: ${fmtTokens(a.inputTokens)} / Out: ${fmtTokens(a.outputTokens)}<br>
        Calls: ${a.calls} ${a.webSearchRequests ? `· 🔍 ${a.webSearchRequests}` : ''}
      </div>
    `;
    els.costBreakdown.appendChild(card);
  }
}

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// ── Modal ──────────────────────────────────────────────────────
async function openModal(entry) {
  await ensureMarked();
  els.modalTitle.textContent = `${entry.id} — ${entry.title}`;
  // Remove HTML comment lines before rendering
  const cleaned = entry.raw.replace(/<!--[^>]*-->/g, '').trim();
  els.modalBody.innerHTML = mdToHtml(cleaned);
  els.modalOverlay.classList.add('open');
}

function closeModal() {
  els.modalOverlay.classList.remove('open');
}
window.closeModal = closeModal;

// Keyboard close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ── Helpers ────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ───────────────────────────────────────────────────────
// Start SSE connection
connect();

// Refresh backlogs + costs every 30 s as fallback (in case SSE misses an event)
setInterval(() => {
  if (state.connected) {
    loadBacklogs();
    loadPlans();
    loadCosts();
  }
}, 30_000);
