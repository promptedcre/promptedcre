// The one door GSAP comes through, and the door the rest of a sequence's playing code
// comes through with it. Every import here is a dynamic import(), so the bundler puts
// each in a chunk of its own that a page asks for only when a sequence nears the viewport
// or is told to play: none of it is in a page's first-load JavaScript or in a shared chunk.
// Nothing else in the repository may import "gsap" or "@gsap/react"
// (__tests__/motion-imports.test.ts fails when a file does), and no server component may
// import this file: it is reached only from "use client" modules.
//
// Each promise is kept, so a module is fetched and its plugins registered once per page
// view however many sequences ask. A failed load is forgotten, so the next sequence that
// asks tries again.

export type Gsap = typeof import("gsap").gsap;
export type Playback = typeof import("./playback");
type GsapReact = { gsap: Gsap; useGSAP: typeof import("@gsap/react").useGSAP };

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let kept: Promise<T> | null = null;
  return () => {
    kept ??= load().catch((err: unknown) => {
      kept = null;
      throw err;
    });
    return kept;
  };
}

/** GSAP's core with its CSS plugin: all the sequences in components/motion need. */
export const loadGsap: () => Promise<Gsap> = once(() => import("gsap").then((m) => m.gsap));

/** Reading the markup, the choreographies, the plan and the timeline builder (lib/motion/playback.ts). */
export const loadPlayback: () => Promise<Playback> = once(() => import("./playback"));

/**
 * GSAP with DrawSVGPlugin registered. The sequences here do not use it: a drawable draws
 * itself from --draw in CSS (docs/MOTION.md). It is for a later drawing whose stroke
 * cannot follow that contract.
 */
export const loadDrawSVG: () => Promise<Gsap> = once(() =>
  Promise.all([loadGsap(), import("gsap/DrawSVGPlugin")]).then(([gsap, m]) => {
    gsap.registerPlugin(m.DrawSVGPlugin);
    return gsap;
  }),
);

/**
 * GSAP and @gsap/react's useGSAP, registered. For a client component that is itself loaded
 * lazily and awaits this before it renders its animated part; the enhancer in
 * components/motion does not use it (a hook cannot wait for an import, so the controller
 * keeps its one timeline and kills it by hand).
 */
export const loadGsapReact: () => Promise<GsapReact> = once(() =>
  Promise.all([loadGsap(), import("@gsap/react")]).then(([gsap, m]) => {
    gsap.registerPlugin(m.useGSAP);
    return { gsap, useGSAP: m.useGSAP };
  }),
);

/** `promise`, or a rejection after `ms`: a sequence does not wait for ever on a slow network. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
