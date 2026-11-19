import type { ReactNode } from "react";

// How the engine's text is set wherever the recorded run shows it: the fold under a row of
// the board, and the transcript. Pure, so server and client components share it. The classes
// (nb, eo-h*) are in run-styles.tsx.

// A piece longer than this may break anywhere, so it can never push a phone sideways.
// 30 leaves room for a hanging indent in a phone's ~37-character column.
const LONGEST_KEPT = 30;

// Engine output, and the command typed, wrap only between words and after a slash, never
// inside an identifier or a flag at its hyphens: each piece between those points is kept
// whole. Plain words need no markup, so runs of them stay one text node: the page carries
// the whole recording, and every span counts. The text is set in one ink: who does a step
// is said by the engine's own words, "(agent)" or "(principal)", not by a color.
export function OutputText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let plain = "";
  text.split(/(\s+)/).forEach((tok, i) => {
    if (!/[-/]/.test(tok)) {
      plain += tok;
      return;
    }
    if (plain) out.push(plain);
    plain = "";
    tok.split(/(?<=\/)/).forEach((p, j) => {
      if (j > 0) out.push(<wbr key={`${i}w${j}`} />);
      out.push(
        p.length <= LONGEST_KEPT && p.includes("-") ? (
          <span key={`${i}p${j}`} className="nb">
            {p}
          </span>
        ) : (
          p
        ),
      );
    });
  });
  if (plain) out.push(plain);
  return <>{out}</>;
}

// A wrapped output line hangs under its first word: continuation lines sit two characters
// in from where the line's own text starts. The class sets how far the line itself is in.
const HANG: Record<number, string> = { 0: "eo-l", 2: "eo-l eo-h2", 4: "eo-l eo-h4", 6: "eo-l eo-h6" };
export function hangOf(line: string): string {
  const lead = Math.min(6, (/^ */.exec(line)?.[0].length ?? 0) & ~1);
  return HANG[lead] ?? "eo-l";
}

// The lines of a block of output, without the trailing blank line the engine prints.
export function outputLines(output: string): string[] {
  const text = output.replace(/\s+$/, "");
  return text === "" ? [] : text.split("\n");
}
