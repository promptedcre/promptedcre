import type { z } from "zod";
import type { TraceLine } from "./trace";

// The shape every calculator after the first four shares, so one connector tool
// (calc_run), one test file and one page route can serve them all. A module is
// pure: no I/O, no clock, no randomness.

export type CalcResult = { trace: TraceLine[] };

export type CalcModule<I = unknown, R extends CalcResult = CalcResult> = {
  id: string;
  // strict zod object; every field carries a .describe() (D66)
  input: z.ZodType<I>;
  // parses its own input, so a caller may hand it anything the schema accepts
  run(input: I): R;
  example: I;
};

// Ties the example and run to the schema's type, so a module cannot drift from it.
export function defineModule<S extends z.ZodType, R extends CalcResult>(m: {
  id: string;
  input: S;
  run: (input: z.output<S>) => R;
  example: z.output<S>;
}): CalcModule<z.output<S>, R> {
  return { id: m.id, input: m.input as unknown as z.ZodType<z.output<S>>, run: m.run, example: m.example };
}
