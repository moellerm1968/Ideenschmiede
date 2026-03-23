import { BaseAgent } from './agents/base.agent';

// Registry populated in main.ts — routes.ts imports this to serve /api/agents/status
export const agentRegistry: BaseAgent[] = [];
