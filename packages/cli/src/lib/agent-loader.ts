import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AgentFunction } from "@agentura/types";

const sdkAgentCache = new Map<string, AgentFunction>();

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function pickSdkExport(moduleNamespace: unknown, modulePath: string): AgentFunction {
  if (typeof moduleNamespace === "function") {
    return moduleNamespace as AgentFunction;
  }

  if (moduleNamespace && typeof moduleNamespace === "object") {
    const record = moduleNamespace as Record<string, unknown>;
    const candidate = record.default ?? record.agent ?? record.run;
    if (typeof candidate === "function") {
      return candidate as AgentFunction;
    }
  }

  throw new Error(
    `SDK agent module ${modulePath} must export a function as default, agent, or run`
  );
}

export async function loadSdkAgentFunction(
  modulePath: string,
  cwd: string
): Promise<AgentFunction> {
  const absolutePath = path.resolve(cwd, modulePath);
  const cached = sdkAgentCache.get(absolutePath);
  if (cached) {
    return cached;
  }

  let moduleNamespace: unknown;
  try {
    moduleNamespace = await import(pathToFileURL(absolutePath).href);
  } catch (error) {
    throw new Error(`Unable to import SDK agent module ${modulePath}: ${getErrorMessage(error)}`);
  }

  const agentFn = pickSdkExport(moduleNamespace, modulePath);
  sdkAgentCache.set(absolutePath, agentFn);
  return agentFn;
}
