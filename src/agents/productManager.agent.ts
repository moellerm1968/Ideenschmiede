import fs from 'fs/promises';
import path from 'path';
import { BaseAgent } from './base.agent';
import { claimNextIdea, appendProduct, markIdeaDone } from '../data/backlogManager';

const AGENT_PROFILE = path.join(process.cwd(), 'agents', 'ProductManager.Agent.md');
const MODEL = 'claude-haiku-4-5';

export class ProductManagerAgent extends BaseAgent {
  /** pmNumber: 1, 2, or 3 — each PM has a slightly different perspective */
  constructor(
    private readonly pmNumber: 1 | 2 | 3,
    intervalMs: number,
  ) {
    super(`PM-${pmNumber}`, `Product Manager ${pmNumber}`, intervalMs);
  }

  protected async runCycle(): Promise<void> {
    this.setStatus('running', 'Prüfe Ideen-Backlog…');

    const idea = await claimNextIdea(this.agentId);
    if (!idea) {
      this.setStatus('idle', 'Kein neues Ideen-Element vorhanden');
      return;
    }

    this.setStatus('running', `Detailliere Idee ${idea.id}: "${idea.title}"`);

    const systemPrompt = await fs.readFile(AGENT_PROFILE, 'utf-8');
    const today = new Date().toISOString().slice(0, 10);
    const perspectiveHint = this.getPerspectiveHint();

    const response = await this.callAnthropic({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Heute ist der ${today}. Du bist ${this.agentId}.

${perspectiveHint}

Hier ist die Rohidee aus dem Ideen-Backlog, die du detaillieren sollst:

---
${idea.content}
---

Erstelle ein strukturiertes Produkt-Briefing im vorgeschriebenen Format. Verwende für Quell-Referenz: source: ${idea.id}
Verwende für den Metadaten-Kommentar EXAKT dieses Template (ersetze Platzhalter):

<!-- PROD-000 | status: PENDING_REVIEW | source: ${idea.id} | agent: ${this.agentId} | created: ${new Date().toISOString()} -->
## Produkt-000: [Produktname]
**Status:** PENDING_REVIEW | **Quelle:** ${idea.id} | **PM:** ${this.agentId} | **Erstellt:** ${today}

[...rest des Briefings im vorgeschriebenen Format...]
---

Bringe deine eigene, spezifische Perspektive ein — nicht einfach die Idee zusammenfassen.`,
        },
      ],
    });

    const text = this.extractText(response);
    if (!text.trim()) {
      await markIdeaDone(idea.id, this.agentId);
      this.setStatus('idle', `Idee ${idea.id} verarbeitet (leere Antwort)`);
      return;
    }

    const productId = await appendProduct(text.trim());
    await markIdeaDone(idea.id, this.agentId);

    this.setStatus('idle', `Produkt ${productId} (aus ${idea.id}) ins Backlog`);
    this.emit('backlog_update', { type: 'product', productId, sourceIdeaId: idea.id, pmAgent: this.agentId });
  }

  private getPerspectiveHint(): string {
    const hints: Record<number, string> = {
      1: 'Dein Fokus liegt auf einem B2C-Endkunden-Ansatz: Denke an Consumer-Produkte, App-Erlebnisse, einfache Bedienung und emotionalen Mehrwert. Pricing: eher Freemium oder Subscription.',
      2: 'Dein Fokus liegt auf einem B2B/Enterprise-Ansatz: Denke an Unternehmenskunden, Integration in bestehende Workflows, ROI-Argumentation und längere Verkaufszyklen. Pricing: eher gehobene Lizenzmodelle oder usage-based.',
      3: 'Dein Fokus liegt auf Plattform- und Ökosystem-Denken: Könnte das ein Marktplatz, eine API-Plattform oder ein Two-Sided Network werden? Denke an Netzwerkeffekte, Partnerschaften und White-Label-Möglichkeiten.',
    };
    return hints[this.pmNumber];
  }
}
