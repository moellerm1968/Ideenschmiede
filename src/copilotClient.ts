import { CopilotClient, approveAll } from '@github/copilot-sdk';

export { approveAll };

let _client: CopilotClient | null = null;

export function getCopilotClient(): CopilotClient {
  if (!_client) {
    _client = new CopilotClient();
  }
  return _client;
}

export async function stopCopilotClient(): Promise<void> {
  if (_client) {
    await _client.stop();
    _client = null;
  }
}
