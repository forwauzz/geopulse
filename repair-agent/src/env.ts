import type { Sandbox as SandboxClass } from '@cloudflare/sandbox';
import type { RepairAgent } from './agent';

export type RepairWorkerEnv = Env & {
  REPAIR_AGENT: DurableObjectNamespace<RepairAgent>;
  Sandbox: DurableObjectNamespace<SandboxClass>;
  REPAIR_AGENT_API_TOKEN?: string;
};
