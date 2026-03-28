import fs from 'fs/promises';
import path from 'path';
import { costsMutex } from './locks';

const COSTS_FILE = path.join(process.cwd(), 'data', 'costs.json');

// Token costs are not available via GitHub Copilot SDK (included in subscription).
// We track only call counts for observability.

export interface AgentCosts {
  calls: number;
}

export interface CostsData {
  agents: Record<string, AgentCosts>;
  total: {
    calls: number;
  };
  lastUpdated: string | null;
}

async function readCosts(): Promise<CostsData> {
  try {
    const raw = await fs.readFile(COSTS_FILE, 'utf-8');
    return JSON.parse(raw) as CostsData;
  } catch {
    return {
      agents: {},
      total: { calls: 0 },
      lastUpdated: null,
    };
  }
}

export async function recordUsage(agentId: string): Promise<void> {
  await costsMutex.runExclusive(async () => {
    const data = await readCosts();

    if (!data.agents[agentId]) {
      data.agents[agentId] = { calls: 0 };
    }
    data.agents[agentId].calls += 1;
    data.total.calls += 1;
    data.lastUpdated = new Date().toISOString();

    await fs.writeFile(COSTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  });
}

export async function getTotalCosts(): Promise<CostsData> {
  return readCosts();
}

