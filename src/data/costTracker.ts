import fs from 'fs/promises';
import path from 'path';
import { costsMutex } from './locks';

const COSTS_FILE = path.join(process.cwd(), 'data', 'costs.json');

// Haiku 4.5 pricing (USD)
const INPUT_PRICE_PER_TOKEN  = 1.00 / 1_000_000;  // $1 / MTok
const OUTPUT_PRICE_PER_TOKEN = 5.00 / 1_000_000;  // $5 / MTok
const WEB_SEARCH_PRICE       = 10.00 / 1_000;      // $10 / 1k searches

export interface AgentCosts {
  inputTokens: number;
  outputTokens: number;
  webSearchRequests: number;
  totalCostUSD: number;
  calls: number;
}

export interface CostsData {
  agents: Record<string, AgentCosts>;
  total: {
    inputTokens: number;
    outputTokens: number;
    webSearchRequests: number;
    totalCostUSD: number;
  };
  lastUpdated: string | null;
}

export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  server_tool_use?: { web_search_requests?: number };
}

async function readCosts(): Promise<CostsData> {
  try {
    const raw = await fs.readFile(COSTS_FILE, 'utf-8');
    return JSON.parse(raw) as CostsData;
  } catch {
    return {
      agents: {},
      total: { inputTokens: 0, outputTokens: 0, webSearchRequests: 0, totalCostUSD: 0 },
      lastUpdated: null,
    };
  }
}

export async function recordUsage(agentId: string, usage: ApiUsage): Promise<void> {
  await costsMutex.runExclusive(async () => {
    const data = await readCosts();

    const input  = usage.input_tokens;
    const output = usage.output_tokens;
    const searches = (usage.server_tool_use?.web_search_requests) ?? 0;
    const cost = input * INPUT_PRICE_PER_TOKEN +
                 output * OUTPUT_PRICE_PER_TOKEN +
                 searches * WEB_SEARCH_PRICE;

    if (!data.agents[agentId]) {
      data.agents[agentId] = { inputTokens: 0, outputTokens: 0, webSearchRequests: 0, totalCostUSD: 0, calls: 0 };
    }
    data.agents[agentId].inputTokens       += input;
    data.agents[agentId].outputTokens      += output;
    data.agents[agentId].webSearchRequests += searches;
    data.agents[agentId].totalCostUSD      += cost;
    data.agents[agentId].calls             += 1;

    data.total.inputTokens       += input;
    data.total.outputTokens      += output;
    data.total.webSearchRequests += searches;
    data.total.totalCostUSD      += cost;
    data.lastUpdated = new Date().toISOString();

    await fs.writeFile(COSTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  });
}

export async function getTotalCosts(): Promise<CostsData> {
  return readCosts();
}
