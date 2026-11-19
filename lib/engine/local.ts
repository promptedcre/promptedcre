import { z } from "zod";
import { jobSentences } from "../agent-job";
import type { Corpus } from "../content/load";
import { isoDate } from "../schemas/common";
import { execute, localDate, toolName, type AnyAction, type Ctx } from "./actions";
import { ACTIONS } from "./index";
import { EngineError, parseActor } from "./machine";
import { FirmStore } from "./store";

// The engine as MCP tools for one firm folder, on the operator's own machine.
// Everything here is a pure function over the action list; cli/mcp.ts only
// connects it to stdio. The hosted server stays read-only and never sees a firm
// folder: these tools exist only in the process the operator starts.

export const LOCAL_SERVER = { name: "promptedcre-local", version: "0.1.0" } as const;

// The agent's job first (CH05, from lib/agent-job.ts), then how this server records.
export const LOCAL_INSTRUCTIONS = [
  "PromptedCRE's engine, running on this machine for one firm folder.",
  jobSentences("local"),
  "run_next and audit_next say what can be done now, who does it and the exact call that records it.",
  "Record only what happened. A step or check a person must do stays with that person: when a call is refused, hand it over, and give `by` (or approvedBy) a person's name only after that person says they did or approved it. The engine records it in their name, on your word.",
  "Say where the proof is. Never put a tax id, an account number or a password in any field.",
].join(" ");

// Two inputs every tool takes, the way every command takes --by and --date.
const COMMON = {
  by: z
    .string()
    .min(1)
    .optional()
    .describe("Who is acting. Leave out for the agent. Give a person's name or role only for what that person did or approved, after they said so: it is recorded in their name, on your word."),
  date: isoDate.optional().describe("The date to record the event under, as YYYY-MM-DD. Default: today."),
};
export const RESERVED_INPUTS = ["by", "date", "firm", "json", "help"] as const;

export type LocalTool = { name: string; title: string; description: string; inputSchema: z.ZodObject; readOnly: boolean; action: AnyAction };

export function localTools(): LocalTool[] {
  return ACTIONS.map((action) => {
    const [group = "", verb = ""] = action.name.split(".");
    return {
      name: toolName(action),
      title: `${group.charAt(0).toUpperCase()}${group.slice(1)}: ${verb.replace(/-/g, " ")}`,
      description: action.summary,
      inputSchema: action.input.extend(COMMON),
      readOnly: !action.mutates,
      action,
    };
  });
}

export type LocalEnv = { firmDir: string; repoRoot: string; corpus: Corpus; now?: () => Date };

export type LocalResult =
  | { ok: true; action: string; result: unknown }
  | { ok: false; action: string; error: { code: string; message: string } & Record<string, unknown> };

// Runs one action the way a tool call does. A refusal comes back as data, with
// its code, so an agent can act on it; only a bug is thrown.
export function callLocal(env: LocalEnv, action: AnyAction, raw: Record<string, unknown> | undefined): LocalResult {
  const { by, date, ...args } = raw ?? {};
  const now = env.now ?? (() => new Date());
  const today = localDate(now());
  try {
    if (date !== undefined && !isoDate.safeParse(date).success) {
      throw new EngineError("invalid-input", "date is written like 2026-11-12.", {});
    }
    const ctx: Ctx = {
      store: new FirmStore(env.firmDir),
      corpus: env.corpus,
      actor: parseActor(typeof by === "string" ? by : undefined),
      date: typeof date === "string" ? date : today,
      today,
      now,
      repoRoot: env.repoRoot,
    };
    return { ok: true, action: action.name, result: execute(action, ctx, args) };
  } catch (err) {
    if (err instanceof EngineError) return { ok: false, action: action.name, error: { code: err.code, message: err.message, ...err.details } };
    throw err;
  }
}
