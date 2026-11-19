import { z } from "zod";
import { isoDate, slug } from "./common";

// A recorded run of the engine on the fictional example firm
// (content/demo/run.json). tools/demo-run.ts writes it by running the real
// command line in process; a test regenerates it and fails when it differs.

export const demoStep = z
  .object({
    command: z.string().regex(/^pcre \S/, "expected a command that starts with \"pcre \""), // what a person types
    by: z.string().min(1).nullable(), // the person named with --by; null when the agent acts
    exit: z.number().int().min(0), // 0 done · 1 refused · 2 not understood
    output: z.string(), // what it printed, with the firm folder's path written as "firm"
    caption: z.string().min(1).nullable(),
  })
  .strict();

export const demoFile = z
  .object({
    path: z.string().min(1), // relative to the firm folder
    text: z.string(),
  })
  .strict();

export const demoScene = z
  .object({
    id: slug,
    title: z.string().min(1),
    summary: z.string().min(1),
    steps: z.array(demoStep).min(1),
    files: z.array(demoFile),
  })
  .strict();

export const demoRun = z
  .object({
    recordedOn: isoDate,
    firm: z.string().min(1),
    scenes: z.array(demoScene).min(1),
  })
  .strict();

export type DemoStep = z.output<typeof demoStep>;
export type DemoFile = z.output<typeof demoFile>;
export type DemoScene = z.output<typeof demoScene>;
export type DemoRun = z.output<typeof demoRun>;
