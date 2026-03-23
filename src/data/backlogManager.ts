import fs from 'fs/promises';
import path from 'path';
import { ideaBacklogMutex, productBacklogMutex, detailedPlansMutex } from './locks';

const DATA_DIR  = path.join(process.cwd(), 'data');
const PLANS_DIR = path.join(DATA_DIR, 'plans');

const IDEA_BACKLOG    = path.join(DATA_DIR, 'Ideenbacklog.md');
const PRODUCT_BACKLOG = path.join(DATA_DIR, 'ProductBacklog.md');

// ──────────────────────────────────────────────────────────────
// ID counters (in-memory; derived from file on startup)
// ──────────────────────────────────────────────────────────────

async function getNextId(filePath: string, prefix: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
  const regex = new RegExp(`<!-- ${prefix}-(\\d+)`, 'g');
  let max = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const n = parseInt(match[1], 10);
    if (n > max) max = n;
  }
  return String(max + 1).padStart(3, '0');
}

// ──────────────────────────────────────────────────────────────
// Ideen-Backlog
// ──────────────────────────────────────────────────────────────

export interface IdeaEntry {
  id: string;
  title: string;
  content: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
  claimedBy?: string;
  created: string;
}

export async function appendIdea(markdownBlock: string): Promise<string> {
  return ideaBacklogMutex.runExclusive(async () => {
    const id = await getNextId(IDEA_BACKLOG, 'IDEA');
    // Ensure the markdown block contains the correct ID; replace placeholder
    const block = markdownBlock
      .replace(/IDEA-000/g, `IDEA-${id}`)
      .replace(/Idee-000/g, `Idee-${id}`);
    await fs.appendFile(IDEA_BACKLOG, '\n' + block.trim() + '\n---\n', 'utf-8');
    return `IDEA-${id}`;
  });
}

export async function claimNextIdea(agentId: string): Promise<IdeaEntry | null> {
  return ideaBacklogMutex.runExclusive(async () => {
    const content = await fs.readFile(IDEA_BACKLOG, 'utf-8');
    // Match the metadata comment line for PENDING ideas
    const metaRegex = /<!-- (IDEA-\d+) \| status: PENDING \| created: ([^|]+) \| agent: ([^-]+)-->/;
    const match = metaRegex.exec(content);
    if (!match) return null;

    const ideaId = match[1].trim();
    const created = match[2].trim();

    // Update status in file: PENDING → IN_PROGRESS:[agentId]
    const updated = content.replace(
      `<!-- ${ideaId} | status: PENDING | created: ${match[2]} | agent: ${match[3]}-->`,
      `<!-- ${ideaId} | status: IN_PROGRESS | claimed_by: ${agentId} | created: ${match[2]} | agent: ${match[3]}-->`
    ).replace(
      `**Status:** PENDING`,
      `**Status:** IN_PROGRESS (${agentId})`
    );
    await fs.writeFile(IDEA_BACKLOG, updated, 'utf-8');

    // Extract the content block for this idea
    const blockRegex = new RegExp(
      `<!-- ${ideaId}[\\s\\S]*?(?=<!-- IDEA-|$)`,
      ''
    );
    const blockMatch = blockRegex.exec(updated);
    const ideaContent = blockMatch ? blockMatch[0].replace(/---\s*$/, '').trim() : '';

    return {
      id: ideaId,
      title: extractTitle(ideaContent),
      content: ideaContent,
      status: 'IN_PROGRESS',
      claimedBy: agentId,
      created,
    };
  });
}

export async function markIdeaDone(ideaId: string, agentId: string): Promise<void> {
  return ideaBacklogMutex.runExclusive(async () => {
    const content = await fs.readFile(IDEA_BACKLOG, 'utf-8');
    const updated = content
      .replace(
        new RegExp(`(<!-- ${ideaId} \\| status: IN_PROGRESS \\| claimed_by: ${agentId}[^>]*-->)`),
        (m) => m.replace('IN_PROGRESS', 'DONE')
      )
      .replace(`**Status:** IN_PROGRESS (${agentId})`, `**Status:** DONE`);
    await fs.writeFile(IDEA_BACKLOG, updated, 'utf-8');
  });
}

// ──────────────────────────────────────────────────────────────
// Product-Backlog
// ──────────────────────────────────────────────────────────────

export interface ProductEntry {
  id: string;
  title: string;
  content: string;
  sourceIdeaId: string;
  status: 'PENDING_REVIEW' | 'IN_REVIEW' | 'DONE';
  claimedBy?: string;
  created: string;
}

export async function appendProduct(markdownBlock: string): Promise<string> {
  return productBacklogMutex.runExclusive(async () => {
    const id = await getNextId(PRODUCT_BACKLOG, 'PROD');
    const block = markdownBlock
      .replace(/PROD-000/g, `PROD-${id}`)
      .replace(/Produkt-000/g, `Produkt-${id}`);
    await fs.appendFile(PRODUCT_BACKLOG, '\n' + block.trim() + '\n---\n', 'utf-8');
    return `PROD-${id}`;
  });
}

export async function claimNextProduct(agentId: string): Promise<ProductEntry | null> {
  return productBacklogMutex.runExclusive(async () => {
    const content = await fs.readFile(PRODUCT_BACKLOG, 'utf-8');
    const metaRegex = /<!-- (PROD-\d+) \| status: PENDING_REVIEW \| source: ([^|]+) \| agent: ([^|]+) \| created: ([^>]+)-->/;
    const match = metaRegex.exec(content);
    if (!match) return null;

    const prodId     = match[1].trim();
    const sourceId   = match[2].trim();
    const pmAgent    = match[3].trim();
    const created    = match[4].trim();

    const metaOld = `<!-- ${prodId} | status: PENDING_REVIEW | source: ${match[2]} | agent: ${match[3]} | created: ${match[4]}-->`;
    const metaNew = `<!-- ${prodId} | status: IN_REVIEW | reviewing_agent: ${agentId} | source: ${match[2]} | agent: ${match[3]} | created: ${match[4]}-->`;

    const updated = content
      .replace(metaOld, metaNew)
      .replace(`**Status:** PENDING_REVIEW`, `**Status:** IN_REVIEW (${agentId})`);
    await fs.writeFile(PRODUCT_BACKLOG, updated, 'utf-8');

    const blockRegex = new RegExp(`<!-- ${prodId}[\\s\\S]*?(?=<!-- PROD-|$)`);
    const blockMatch = blockRegex.exec(updated);
    const prodContent = blockMatch ? blockMatch[0].replace(/---\s*$/, '').trim() : '';

    return {
      id: prodId,
      title: extractTitle(prodContent),
      content: prodContent,
      sourceIdeaId: sourceId,
      status: 'IN_REVIEW',
      claimedBy: agentId,
      created,
      // pmAgent info embedded in content
    } as ProductEntry & { pmAgent: string };
  });
}

export async function markProductDone(prodId: string, agentId: string): Promise<void> {
  return productBacklogMutex.runExclusive(async () => {
    const content = await fs.readFile(PRODUCT_BACKLOG, 'utf-8');
    const updated = content
      .replace(
        new RegExp(`(<!-- ${prodId} \\| status: IN_REVIEW \\| reviewing_agent: ${agentId}[^>]*-->)`),
        (m) => m.replace('IN_REVIEW', 'REVIEWED')
      )
      .replace(`**Status:** IN_REVIEW (${agentId})`, `**Status:** REVIEWED`);
    await fs.writeFile(PRODUCT_BACKLOG, updated, 'utf-8');
  });
}

// ──────────────────────────────────────────────────────────────
// Detailed Product Plans  (each DPD gets its own file)
// ──────────────────────────────────────────────────────────────

export interface PlanMetadata {
  id: string;
  title: string;
  created: string;
  sourceProductId: string;
  recommendation: string;
  priority: number;          // 1 Investieren · 2 Bedingt · 3 Nicht · 4 Unbekannt
  filename: string;
}

export async function appendDetailedPlan(markdownBlock: string): Promise<string> {
  return detailedPlansMutex.runExclusive(async () => {
    await fs.mkdir(PLANS_DIR, { recursive: true });
    const files = await fs.readdir(PLANS_DIR).catch(() => [] as string[]);
    const nums = files
      .map(f => /^PLAN-(\d+)\.md$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(m => parseInt(m[1], 10));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    const id     = String(max + 1).padStart(3, '0');
    const planId = `PLAN-${id}`;
    const block  = markdownBlock
      .replace(/PLAN-000/g, planId)
      .replace(/Plan-000/g, `Plan-${id}`);
    await fs.writeFile(path.join(PLANS_DIR, `${planId}.md`), block.trim() + '\n', 'utf-8');
    return planId;
  });
}

export function getPlanFilePath(planId: string): string {
  return path.join(PLANS_DIR, `${planId}.md`);
}

export async function listDetailedPlans(): Promise<PlanMetadata[]> {
  await fs.mkdir(PLANS_DIR, { recursive: true });
  const files = await fs.readdir(PLANS_DIR).catch(() => [] as string[]);
  const planFiles = files.filter(f => /^PLAN-\d+\.md$/.test(f)).sort();
  const plans = await Promise.all(
    planFiles.map(async (filename) => {
      const content = await fs.readFile(path.join(PLANS_DIR, filename), 'utf-8').catch(() => '');
      return parsePlanMetadata(content, filename);
    })
  );
  return plans.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

function parsePlanMetadata(content: string, filename: string): PlanMetadata {
  const metaMatch  = /<!-- (PLAN-\d+) \| status: \w+ \| source: ([^|]+) \| created: ([^>]+)-->/.exec(content);
  const titleMatch = /## Plan-\d+:\s*(.+)/.exec(content);
  const id              = metaMatch?.[1]?.trim() ?? filename.replace('.md', '');
  const sourceProductId = metaMatch?.[2]?.trim() ?? '';
  const created         = metaMatch?.[3]?.trim() ?? '';
  const title           = titleMatch?.[1]?.trim() ?? id;
  const { recommendation, priority } = parseRecommendation(content);
  return { id, title, created, sourceProductId, recommendation, priority, filename };
}

function parseRecommendation(content: string): { recommendation: string; priority: number } {
  const lower = content.toLowerCase();
  const idx   = lower.indexOf('team-empfehlung');
  if (idx !== -1) {
    const snippet = lower.slice(idx, idx + 300);
    if (snippet.includes('nicht investieren'))   return { recommendation: 'Nicht investieren',   priority: 3 };
    if (snippet.includes('bedingt investieren')) return { recommendation: 'Bedingt investieren', priority: 2 };
    if (snippet.includes('investieren'))         return { recommendation: 'Investieren',         priority: 1 };
  }
  return { recommendation: 'Unbekannt', priority: 4 };
}

// ──────────────────────────────────────────────────────────────
// Read all backlogs (for the dashboard API)
// ──────────────────────────────────────────────────────────────

export async function readAllBacklogs(): Promise<{
  ideas: string;
  products: string;
  plans: string;
}> {
  const [ideas, products] = await Promise.all([
    fs.readFile(IDEA_BACKLOG, 'utf-8').catch(() => ''),
    fs.readFile(PRODUCT_BACKLOG, 'utf-8').catch(() => ''),
  ]);
  return { ideas, products, plans: '' };
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function extractTitle(block: string): string {
  const m = /##\s+[^:]+:\s+(.+)/.exec(block);
  return m ? m[1].trim() : 'Unbekannter Titel';
}
