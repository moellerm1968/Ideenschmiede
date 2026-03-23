import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { recordUsage, ApiUsage } from '../../data/costTracker';

const MODEL = 'claude-haiku-4-5';

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
  client: Anthropic,
  emitUsage: (agentId: string, usage: ApiUsage) => void,
): Promise<SpecialistResult> {
  const systemPrompt = await fs.readFile(profilePath, 'utf-8');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3072,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Hier ist das Produkt-Briefing das du als ${agentId} bewerten sollst:

---
${productContent}
---

${task}

Halte dich exakt an dein Output-Format aus deinem Rollenprofil. Antworte nur mit dem Assessment-Abschnitt — kein Einleitungstext.`,
      },
    ],
  });

  await recordUsage(agentId, response.usage as ApiUsage);
  emitUsage(agentId, response.usage as ApiUsage);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return { agentId, content: text };
}

// ──────────────────────────────────────────────────────────────
// Individual specialist wrappers
// ──────────────────────────────────────────────────────────────

export function evaluateSoftwareEngineer(
  productContent: string,
  client: Anthropic,
  emit: (agentId: string, usage: ApiUsage) => void,
): Promise<SpecialistResult> {
  return evaluateAsSpecialist(
    'SW-Engineer',
    path.join(process.cwd(), 'agents', 'SoftwareEngineer.Agent.md'),
    productContent,
    'Erstelle ein vollständiges Software-Engineering-Assessment inklusive Architektur, Tech-Stack, Aufwandsschätzung und Kostenberechnung.',
    client,
    emit,
  );
}

export function evaluateCloudArchitect(
  productContent: string,
  client: Anthropic,
  emit: (agentId: string, usage: ApiUsage) => void,
): Promise<SpecialistResult> {
  return evaluateAsSpecialist(
    'Cloud-Architect',
    path.join(process.cwd(), 'agents', 'CloudArchitect.Agent.md'),
    productContent,
    'Erstelle ein vollständiges Cloud-Architektur-Assessment: empfohlener Provider (AWS/GCP/Azure), Service-Auswahl, Infrastrukturkosten in 3 Tiers (Startup/Wachstum/Scale), DSGVO-Compliance und Top-3-Cloud-Risiken.',
    client,
    emit,
  );
}

export function evaluateMarketResearcher(
  productContent: string,
  client: Anthropic,
  emit: (agentId: string, usage: ApiUsage) => void,
): Promise<SpecialistResult> {
  return evaluateAsSpecialist(
    'Market-Researcher',
    path.join(process.cwd(), 'agents', 'MarketResearcher.Agent.md'),
    productContent,
    'Erstelle ein vollständiges Marktforschungs-Assessment mit TAM/SAM/SOM, Wettbewerbsanalyse und Umsatzprognose.',
    client,
    emit,
  );
}

export function evaluateController(
  productContent: string,
  swAssessment: string,
  cloudAssessment: string,
  marketAssessment: string,
  client: Anthropic,
  emit: (agentId: string, usage: ApiUsage) => void,
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
    client,
    emit,
  );
}
