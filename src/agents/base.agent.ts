import { EventEmitter } from 'events';
import { getCopilotClient, approveAll } from '../copilotClient';
import { recordUsage } from '../data/costTracker';

const COPILOT_MODEL = process.env.COPILOT_MODEL ?? 'gpt-4o-mini';

export interface AgentStatus {
  id: string;
  role: string;
  status: 'idle' | 'running' | 'error';
  lastRun: string | null;
  lastMessage: string;
  runCount: number;
  errorCount: number;
}

export abstract class BaseAgent extends EventEmitter {
  protected status: AgentStatus;
  protected running = false;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public readonly agentId: string,
    public readonly role: string,
    protected readonly intervalMs: number,
  ) {
    super();
    this.status = {
      id: agentId,
      role,
      status: 'idle',
      lastRun: null,
      lastMessage: 'Bereit',
      runCount: 0,
      errorCount: 0,
    };
  }

  /** Override in subclass to implement agent logic. */
  protected abstract runCycle(): Promise<void>;

  start(): void {
    if (this.running) return;
    this.running = true;
    // Stagger first run by a random offset to avoid thundering herd
    const jitter = Math.floor(Math.random() * 15_000);
    this.loopTimer = setTimeout(() => this.loop(), jitter);
  }

  stop(): void {
    this.running = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  getStatus(): AgentStatus {
    return { ...this.status };
  }

  // ──────────────────────────────────────────────────────────
  // Internal loop
  // ──────────────────────────────────────────────────────────

  private async loop(): Promise<void> {
    if (!this.running) return;

    this.setStatus('running', 'Starte Zyklus…');
    try {
      await this.runCycle();
      this.status.runCount++;
      this.status.lastRun = new Date().toISOString();
      this.setStatus('idle', 'Zyklus abgeschlossen');
    } catch (err: unknown) {
      this.status.errorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus('error', `Fehler: ${msg}`);
      console.error(`[${this.agentId}] Fehler im Zyklus:`, err);
    }

    if (this.running) {
      this.loopTimer = setTimeout(() => this.loop(), this.intervalMs);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────

  protected setStatus(
    status: AgentStatus['status'],
    message: string,
  ): void {
    this.status.status = status;
    this.status.lastMessage = message;
    this.emit('status_update', this.getStatus());
  }

  /**
   * Call the GitHub Copilot SDK with a system prompt and user message.
   * Creates a new session per call (stateless invocation pattern).
   */
  protected async callCopilot(systemPrompt: string, userPrompt: string): Promise<string> {
    const client = getCopilotClient();
    const session = await client.createSession({
      model: COPILOT_MODEL,
      systemMessage: { content: systemPrompt },
      onPermissionRequest: approveAll,
    });

    const response = await session.sendAndWait({ prompt: userPrompt });
    await recordUsage(this.agentId);
    this.emit('api_call', { agentId: this.agentId });

    return response?.data.content ?? '';
  }
}
