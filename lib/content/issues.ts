import type { z } from "zod";

// Turns zod issues into one readable line each:
//   content/playbooks/x.json › steps[3].mode: Invalid option: expected one of ... (got "robot")

export function pathToString(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out || "(root)";
}

function valueAt(data: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let cur: unknown = data;
  for (const part of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[part as string];
  }
  return cur;
}

function describe(value: unknown): string | null {
  if (typeof value === "string") return JSON.stringify(value.length > 60 ? `${value.slice(0, 57)}...` : value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return null;
}

export function formatIssues(file: string, error: z.ZodError, data: unknown): string[] {
  return error.issues.map((issue) => {
    const where = pathToString(issue.path);
    const got = describe(valueAt(data, issue.path));
    const suffix = got !== null && !issue.message.includes("got") ? ` (got ${got})` : "";
    return `${file} › ${where}: ${issue.message}${suffix}`;
  });
}
