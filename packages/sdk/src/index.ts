export interface AgenturaClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export class AgenturaClient {
  constructor(private readonly config: AgenturaClientConfig) {}

  getConfig(): AgenturaClientConfig {
    return this.config;
  }
}
