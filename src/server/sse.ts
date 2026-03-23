import { Response } from 'express';
import { AgentStatus } from '../agents/base.agent';

export interface SSEClient {
  id: string;
  res: Response;
}

export type SSEEventType =
  | 'status_update'
  | 'backlog_update'
  | 'api_call'
  | 'team_started'
  | 'team_completed'
  | 'costs_update'
  | 'connected';

const clients: SSEClient[] = [];
let clientIdCounter = 0;

export function registerSSEClient(res: Response): string {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const id = String(++clientIdCounter);
  clients.push({ id, res });

  // Keep-alive ping every 15 s
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 15_000);

  res.on('close', () => {
    clearInterval(keepAlive);
    const idx = clients.findIndex((c) => c.id === id);
    if (idx !== -1) clients.splice(idx, 1);
  });

  broadcast('connected', { clientId: id, timestamp: Date.now() });
  return id;
}

export function broadcast(event: SSEEventType | string, data: object): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  // Write to a copy in case a client disconnects mid-loop
  for (const client of [...clients]) {
    try {
      client.res.write(payload);
    } catch {
      // Client already disconnected — will be cleaned up on 'close' event
    }
  }
}

export function broadcastAgentStatus(status: AgentStatus): void {
  broadcast('status_update', status);
}

export function getClientCount(): number {
  return clients.length;
}
