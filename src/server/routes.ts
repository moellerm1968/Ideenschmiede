import fs from 'fs/promises';
import path from 'path';
import { Router } from 'express';
import { registerSSEClient } from './sse';
import { readAllBacklogs, listDetailedPlans, getPlanFilePath } from '../data/backlogManager';
import { getTotalCosts } from '../data/costTracker';
import { agentRegistry } from '../agentRegistry';

const router = Router();

// ── Real-time SSE stream ─────────────────────────────────────
router.get('/events', (req, res) => {
  registerSSEClient(res);
  // Note: response intentionally kept open for SSE
});

// ── All three backlogs ───────────────────────────────────────
router.get('/backlogs', async (_req, res) => {
  try {
    const backlogs = await readAllBacklogs();
    res.json(backlogs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read backlogs' });
  }
});

// ── Cost totals ──────────────────────────────────────────────
router.get('/costs', async (_req, res) => {
  try {
    const costs = await getTotalCosts();
    res.json(costs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read costs' });
  }
});

// ── Agent status snapshot ─────────────────────────────────────
router.get('/agents/status', (_req, res) => {
  const statuses = agentRegistry.map((a) => a.getStatus());
  res.json(statuses);
});

// ── DPD list (sorted by commercial priority) ──────────────────
router.get('/plans', async (_req, res) => {
  try {
    const plans = await listDetailedPlans();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

// ── DPD viewer (single plan rendered as HTML page) ───────────
router.get('/plans/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^PLAN-\d+$/.test(id)) {
    res.status(400).send('Invalid plan ID');
    return;
  }
  try {
    const content = await fs.readFile(getPlanFilePath(id), 'utf-8');
    res.type('text/html').send(buildPlanHtml(id, content));
  } catch {
    res.status(404).send('Plan not found');
  }
});

function buildPlanHtml(id: string, mdContent: string): string {
  const escaped = JSON.stringify(mdContent);
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${id} — Ideenschmiede DPD</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f1117;color:#e8eaf6;line-height:1.75;padding:32px 24px}
    .wrap{max-width:900px;margin:0 auto}
    .toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #2e3248}
    .back-link{color:#9da3c2;font-size:.85rem;text-decoration:none;transition:color .15s}
    .back-link:hover{color:#e8eaf6}
    .plan-id{font-family:monospace;font-size:.8rem;background:#1a1d27;border:1px solid #2e3248;padding:3px 10px;border-radius:6px;color:#10b981}
    h1,h2,h3,h4{color:#fff;margin-top:1.8em;margin-bottom:.5em}
    h1{font-size:1.5rem;border-bottom:2px solid #10b981;padding-bottom:.4em;margin-top:.5em}
    h2{font-size:1.2rem;color:#10b981}
    h3{font-size:1rem;color:#818cf8}
    p{margin:.6em 0;color:#c5c9e0}
    ul,ol{padding-left:1.6em;margin:.5em 0}
    li{margin:.25em 0;color:#c5c9e0}
    strong{color:#e8eaf6}
    em{color:#9da3c2}
    code{background:#20232e;padding:2px 6px;border-radius:4px;font-size:.88em;font-family:monospace;color:#f59e0b}
    pre{background:#20232e;border:1px solid #2e3248;padding:16px;border-radius:8px;overflow-x:auto;margin:1em 0}
    pre code{background:none;padding:0;color:#e8eaf6}
    blockquote{border-left:3px solid #6366f1;padding-left:16px;color:#9da3c2;margin:1em 0}
    table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.9rem}
    th,td{border:1px solid #2e3248;padding:8px 14px;text-align:left}
    th{background:#1a1d27;color:#9da3c2;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
    tr:hover{background:#1a1d27}
    hr{border:none;border-top:1px solid #2e3248;margin:1.5em 0}
    a{color:#6366f1}
    a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="toolbar">
      <a class="back-link" href="/" onclick="window.close();return false">← Ideenschmiede Dashboard</a>
      <span class="plan-id">${id}</span>
    </div>
    <div id="content">Lade…</div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
  <script>
    const raw = ${escaped};
    const cleaned = raw.replace(/<!--[^>]*-->/g, '').trim();
    document.getElementById('content').innerHTML = window.marked.parse(cleaned, { gfm: true, breaks: true });
  </script>
</body>
</html>`;
}

export { router as apiRouter };
