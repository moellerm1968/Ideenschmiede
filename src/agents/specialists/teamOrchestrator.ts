import { BaseAgent } from '../base.agent';
import { claimNextProduct, markProductDone, appendDetailedPlan } from '../../data/backlogManager';
import {
  evaluateSoftwareEngineer,
  evaluateCloudArchitect,
  evaluateMarketResearcher,
  evaluateController,
} from './specialists';

const TEAM_ORCHESTRATOR_SYSTEM = `Du bist ein erfahrener Chief Product Officer (CPO) und moderierst ein interdisziplinäres Bewertungs-Team.
Deine Aufgabe: Fasse die Assessments von Software-Engineer, Cloud-Architekt, Marktforscher und Controller zu einem kohärenten, abgestimmten Team-Konsens zusammen.
Identifiziere Widersprüche, wichtigste Erkenntnisse und gib eine klare Gesamt-Empfehlung ab.`;

export class TeamOrchestratorAgent extends BaseAgent {
  constructor(private readonly teamNumber: 1 | 2, intervalMs: number) {
    super(`Team-${teamNumber}`, `Team Orchestrator ${teamNumber} (CPO)`, intervalMs);
  }

  protected async runCycle(): Promise<void> {
    this.setStatus('running', 'Prüfe Product-Backlog…');

    const product = await claimNextProduct(this.agentId);
    if (!product) {
      this.setStatus('idle', 'Kein Produkt zur Bewertung vorhanden');
      return;
    }

    this.setStatus('running', `Bewertet Produkt ${product.id}: "${product.title}"`);
    this.emit('team_started', { productId: product.id, title: product.title });

    const emitCall = (agentId: string) => {
      this.emit('api_call', { agentId });
    };

    // Step 1: SW, Cloud, Market all run in parallel
    this.setStatus('running', `[${product.id}] Parallele Spezialisten-Analyse läuft…`);
    const [swResult, cloudResult, marketResult] = await Promise.all([
      evaluateSoftwareEngineer(product.content, emitCall),
      evaluateCloudArchitect(product.content, emitCall),
      evaluateMarketResearcher(product.content, emitCall),
    ]);

    // Step 2: Controller needs outputs from the three above
    this.setStatus('running', `[${product.id}] Business Case wird berechnet…`);
    const controllerResult = await evaluateController(
      product.content,
      swResult.content,
      cloudResult.content,
      marketResult.content,
      emitCall,
    );

    // Step 3: Team synthesis / consensus call
    this.setStatus('running', `[${product.id}] Team-Konsens wird erarbeitet…`);
    const teamConsensus = await this.callCopilot(
      TEAM_ORCHESTRATOR_SYSTEM,
      `Fasse die folgenden vier Spezialisten-Assessments zum Produkt "${product.title}" (ID: ${product.id}) zu einem abgestimmten Team-Konsens zusammen:

=== SOFTWARE-ASSESSMENT ===
${swResult.content}

=== CLOUD-ARCHITEKTUR-ASSESSMENT ===
${cloudResult.content}

=== MARKTFORSCHUNG ===
${marketResult.content}

=== BUSINESS CASE (CONTROLLER) ===
${controllerResult.content}

Erstelle einen kurzen Team-Konsens-Abschnitt (maximal 300 Wörter) mit:
1. **Wichtigste Erkenntnisse** (3-5 Bulletpoints)
2. **Identifizierte Widersprüche oder offene Fragen** (falls vorhanden)
3. **Team-Empfehlung**: Investieren / Bedingt investieren / Nicht investieren — mit Begründung in 1-3 Sätzen
4. **Nächster Schritt**: Was sollte als nächstes getan werden?`,
    );
    const today = new Date().toISOString().slice(0, 10);
    const iso = new Date().toISOString();

    // Assemble the final plan document
    const planBlock = `<!-- PLAN-000 | status: FINAL | source: ${product.id} | created: ${iso} -->
## Plan-000: ${product.title}
**Status:** FINAL | **Quelle:** ${product.id} | **Erstellt:** ${today}

---

### 📋 Produkt-Briefing (Original)
${product.content}

---

### 💻 Software-Assessment

${swResult.content}

---

### ☁️ Cloud-Architektur-Assessment

${cloudResult.content}

---

### 📊 Marktforschungs-Assessment

${marketResult.content}

---

### 💰 Business Case (Controller)

${controllerResult.content}

---

### 🤝 Team-Konsens

${teamConsensus}

---`;

    const planId = await appendDetailedPlan(planBlock);
    await markProductDone(product.id, this.agentId);

    this.setStatus('idle', `Plan ${planId} für Produkt ${product.id} fertiggestellt`);
    this.emit('backlog_update', { type: 'plan', planId, sourceProductId: product.id });
    this.emit('team_completed', { planId, productId: product.id, title: product.title });
  }
}
