import fs from 'fs/promises';
import path from 'path';
import { getCopilotClient, approveAll } from '../../copilotClient';
import { recordUsage } from '../../data/costTracker';

const COPILOT_MODEL = process.env.COPILOT_MODEL ?? 'gpt-4o-mini';

interface SpecialistResult {
  agentId: string;
  content: string;
}

// ──────────────────────────────────────────────────────────────
// Generic specialist evaluation function
// ──────────────────────────────────────────────────────────────

export async function evaluateAsSpecialist(
  agentId: string,
  profilePath: string,
  productContent: string,
  task: string,
  emitCall: (agentId: string) => void,
): Promise<SpecialistResult> {
  const systemPrompt = await fs.readFile(profilePath, 'utf-8');

  const client = getCopilotClient();
  const session = await client.createSession({
    model: COPILOT_MODEL,
    systemMessage: { content: systemPrompt },
    onPermissionRequest: approveAll,
  });

  const userPrompt = `Hier ist das Produkt-Briefing das du als ${agentId} bewerten sollst:

---
${productContent}
---

${task}

Halte dich exakt an dein Output-Format aus deinem Rollenprofil. Antworte nur mit dem Assessment-Abschnitt — kein Einleitungstext.`;

  const response = await session.sendAndWait({ prompt: userPrompt });
  await recordUsage(agentId);
  emitCall(agentId);

  const text = response?.data.content ?? '';
  return { agentId, content: text };
}

// ──────────────────────────────────────────────────────────────
// Individual specialist wrappers
// ──────────────────────────────────────────────────────────────

export function evaluateSoftwareEngineer(
  productContent: string,
  emit: (agentId: string) => void,
): Promise<SpecialistResult> {
  return evaluateAsSpecialist(
    'SW-Engineer',
    path.join(process.cwd(), 'agents', 'SoftwareEngineer.Agent.md'),
    productContent,
    'Erstelle ein vollständiges Software-Engineering-Assessment inklusive Architektur, Tech-Stack, Aufwandsschätzung und Kostenberechnung.',
    emit,
  );
}

export function evaluateCloudArchitect(
  productContent: string,
  emit: (agentId: string) => void,
): Promise<SpecialistResult> {
  return evaluateAsSpecialist(
    'Cloud-Architect',
    path.join(process.cwd(), 'agents', 'CloudArchitect.Agent.md'),
    productContent,
    'Erstelle ein vollständiges Cloud-Architektur-Assessment: empfohlener Provider (AWS/GCP/Azure), Service-Auswahl, Infrastrukturkosten in 3 Tiers (Startup/Wachstum/Scale), DSGVO-Compliance und Top-3-Cloud-Risiken.',
    emit,
  );
}

export function evaluateMarketResearcher(
  productContent: string,
  emit: (agentId: string) => void,
): Promise<SpecialistResult> {
  return evaluateAsSpecialist(
    'Market-Researcher',
    path.join(process.cwd(), 'agents', 'MarketResearcher.Agent.md'),
    productContent,
    'Erstelle ein vollständiges Marktforschungs-Assessment mit TAM/SAM/SOM, Wettbewerbsanalyse und Umsatzprognose.',
    emit,
  );
}

export function evaluateController(
  productContent: string,
  swAssessment: string,
  cloudAssessment: string,
  marketAssessment: string,
  emit: (agentId: string) => void,
): Promise<SpecialistResult> {
  const combinedContext = `
=== PRODUKT-BRIEFING ===
${productContent}

=== SOFTWARE-ASSESSMENT ===
${swAssessment}

=== CLOUD-ARCHITEKTUR-ASSESSMENT ===
${cloudAssessment}

=== MARKTFORSCHUNGS-ASSESSMENT ===
${marketAssessment}
`;

  return evaluateAsSpecialist(
    'Controller',
    path.join(process.cwd(), 'agents', 'Controller.Agent.md'),
    combinedContext,
    'Erstelle einen vollständigen Business Case auf Basis aller vorliegenden Assessments (SW, Cloud, Markt). Berechne NPV, IRR, Break-Even und alle weiteren KPIs. Fasse alle Kostenpositionen zusammen (inkl. Cloud-Infrastrukturkosten aus dem Cloud-Assessment).',
    emit,
  );
}

