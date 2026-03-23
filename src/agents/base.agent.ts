import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { recordUsage, ApiUsage } from '../data/costTracker';

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
  protected client: Anthropic;
  protected status: AgentStatus;
  protected running = false;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public readonly agentId: string,
    public readonly role: string,
    protected readonly intervalMs: number,
  ) {
    super();
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
   * Call the Anthropic API, handle `pause_turn` continuation for server tools,
   * and record token usage automatically.
   */
  protected async callAnthropic(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    let response = await this.client.messages.create(params);
    await recordUsage(this.agentId, response.usage as ApiUsage);
    this.emit('api_call', { agentId: this.agentId, usage: response.usage });

    // Continue if server tool (web_search) fills its iteration budget
    // `pause_turn` is a valid stop reason for server tools but not yet in SDK 0.39 types
    while ((response.stop_reason as string) === 'pause_turn') {
      const messages: Anthropic.MessageParam[] = [
        ...(params.messages as Anthropic.MessageParam[]),
        { role: 'assistant', content: response.content },
      ];
      response = await this.client.messages.create({ ...params, messages });
      await recordUsage(this.agentId, response.usage as ApiUsage);
      this.emit('api_call', { agentId: this.agentId, usage: response.usage });
    }

    return response;
  }

  /** Extract plain text from an Anthropic response. */
  protected extractText(response: Anthropic.Message): string {
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
}
