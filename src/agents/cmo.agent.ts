import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.agent';
import { appendIdea } from '../data/backlogManager';

const AGENT_PROFILE = path.join(process.cwd(), 'agents', 'CMO.Agent.md');
const MODEL = 'claude-haiku-4-5';

export class CMOAgent extends BaseAgent {
  constructor(intervalMs: number) {
    super('CMO', 'Chief Marketing Officer', intervalMs);
  }

  protected async runCycle(): Promise<void> {
    this.setStatus('running', 'Recherchiere aktuelle Markttrends…');

    const systemPrompt = await fs.readFile(AGENT_PROFILE, 'utf-8');
    const today = new Date().toISOString().slice(0, 10);

    const response = await this.callAnthropic({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [
        // web_search_20250305 is a server tool not yet typed in SDK 0.39 — cast via unknown
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: 'user',
          content: `Heute ist der ${today}. 
          
Recherchiere aktuelle Markttrends und Produktinnovationen. Identifiziere 2-3 konkrete, vielversprechende Produktideen aus unterschiedlichen Bereichen.

Für jede Idee verwende EXAKT das folgende Format (ersetze IDEA-000 mit IDEA-000 — das System vergibt echte IDs automatisch):

<!-- IDEA-000 | status: PENDING | created: ${new Date().toISOString()} | agent: CMO -->
## Idee-000: [Prägnanter Titel]
**Status:** PENDING | **Erstellt:** ${today} | **Von:** CMO

**Trend-Hintergrund:** [...]

**Produktidee:** [...]

**Zielgruppe:** [...]

**Kernproblem:** [...]

**Erste Markteinschätzung:** [...]

**Datenquellen:** [URLs oder Referenzen]
---

Schreibe alle 2-3 Ideen direkt hintereinander, jede im exakten Format oben.`,
        },
      ],
    });

    const text = this.extractText(response);
    if (!text.trim()) {
      this.setStatus('idle', 'Keine Ideen generiert (leere Antwort)');
      return;
    }

    // Split on metadata comment markers to extract individual ideas
    const ideaBlocks = text.split(/(?=<!-- IDEA-)/).filter((b) => b.includes('<!-- IDEA-'));

    if (ideaBlocks.length === 0) {
      // Fallback: treat the entire text as one idea block
      const ideaId = await appendIdea(wrapIfNeeded(text));
      this.setStatus('idle', `Idee ${ideaId} ins Backlog geschrieben`);
      this.emit('backlog_update', { type: 'idea', ideaId });
      return;
    }

    const ids: string[] = [];
    for (const block of ideaBlocks) {
      const ideaId = await appendIdea(block.trim());
      ids.push(ideaId);
      this.emit('backlog_update', { type: 'idea', ideaId });
    }
    this.setStatus('idle', `${ids.length} neue Ideen ins Backlog: ${ids.join(', ')}`);
  }
}

function wrapIfNeeded(text: string): string {
  if (text.includes('<!-- IDEA-')) return text;
  const iso = new Date().toISOString();
  return `<!-- IDEA-000 | status: PENDING | created: ${iso} | agent: CMO -->
## Idee-000: Trend-Idee vom ${iso.slice(0, 10)}
**Status:** PENDING | **Erstellt:** ${iso.slice(0, 10)} | **Von:** CMO

${text.trim()}
---`;
}
