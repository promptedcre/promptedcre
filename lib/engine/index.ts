import type { AnyAction } from "./actions";
import { auditActions } from "./audit";
import { deadlineActions } from "./deadlines";
import { dealActions } from "./deal";
import { firmActions } from "./firm";
import { runActions } from "./run";

// Every action the engine offers. The command line (cli/pcre.ts) and the local
// MCP server (cli/mcp.ts) are both built from this one list.
export const ACTIONS: AnyAction[] = [...firmActions, ...runActions, ...auditActions, ...deadlineActions, ...dealActions];

export function findAction(name: string): AnyAction | undefined {
  return ACTIONS.find((a) => a.name === name);
}

export { defineAction, execute, localDate, logEvent, toolName, type AnyAction, type Ctx } from "./actions";
export { EngineError, parseActor, actorLabel } from "./machine";
export { FirmStore } from "./store";
