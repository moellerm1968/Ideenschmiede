import 'dotenv/config';
import { createServer } from './server';
import { stopCopilotClient } from './copilotClient';
import { CMOAgent } from './agents/cmo.agent';
import { ProductManagerAgent } from './agents/productManager.agent';
import { TeamOrchestratorAgent } from './agents/specialists/teamOrchestrator';
import { agentRegistry } from './agentRegistry';
import { broadcast, broadcastAgentStatus } from './server/sse';
import { getTotalCosts } from './data/costTracker';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const CMO_INTERVAL_MS        = parseInt(process.env.CMO_INTERVAL_MS        ?? '300000', 10);
const PM_INTERVAL_MS         = parseInt(process.env.PM_INTERVAL_MS         ?? '120000', 10);
const SPECIALIST_INTERVAL_MS = parseInt(process.env.SPECIALIST_INTERVAL_MS ?? '300000', 10);

async function main(): Promise<void> {
  // ── Create agents ──────────────────────────────────────────
  const cmo  = new CMOAgent(CMO_INTERVAL_MS);
  const pm1  = new ProductManagerAgent(1, PM_INTERVAL_MS);
  const pm2  = new ProductManagerAgent(2, PM_INTERVAL_MS);
  const pm3  = new ProductManagerAgent(3, PM_INTERVAL_MS);
  const team1 = new TeamOrchestratorAgent(1, SPECIALIST_INTERVAL_MS);
  const team2 = new TeamOrchestratorAgent(2, SPECIALIST_INTERVAL_MS);

  const agents = [cmo, pm1, pm2, pm3, team1, team2];
  agentRegistry.push(...agents);

  // ── Wire SSE events ────────────────────────────────────────
  for (const agent of agents) {
    agent.on('status_update', (status) => {
      broadcastAgentStatus(status);
    });

    agent.on('backlog_update', (data) => {
      broadcast('backlog_update', data);
    });

    agent.on('api_call', (data) => {
      // Broadcast cost update every API call so the dashboard stays current
      getTotalCosts().then((costs) => {
        broadcast('costs_update', costs);
      }).catch(() => {/* ignore */});
    });

    agent.on('team_started', (data) => {
      broadcast('team_started', data);
    });

    agent.on('team_completed', (data) => {
      broadcast('team_completed', data);
    });
  }

  // ── Start web server ───────────────────────────────────────
  const app = createServer();
  app.listen(PORT, () => {
    console.log(`\n🏭  Ideenschmiede läuft auf http://localhost:${PORT}`);
    console.log(`📊  Dashboard: http://localhost:${PORT}`);
    console.log(`🔌  LLM: GitHub Copilot SDK (${process.env.COPILOT_MODEL ?? 'gpt-4o-mini'})\n`);
  });

  // ── Start all agents ───────────────────────────────────────
  console.log('🤖  Starte Agenten…');
  for (const agent of agents) {
    agent.start();
    console.log(`   ✓ ${agent.agentId} (${agent.role}) — Intervall: ${
      agent.agentId === 'CMO' ? CMO_INTERVAL_MS / 60000 :
      agent.agentId.startsWith('PM') ? PM_INTERVAL_MS / 60000 :
      SPECIALIST_INTERVAL_MS / 60000
    } Min`);
  }
  console.log('\n🚀  Simulation gestartet!\n');

  // ── Graceful shutdown ──────────────────────────────────────
  const shutdown = async () => {
    console.log('\n🛑  Stoppe alle Agenten…');
    for (const agent of agents) agent.stop();
    await stopCopilotClient();
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
  process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
}

main().catch((err) => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
