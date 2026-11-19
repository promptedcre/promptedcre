# Third-party notices

The code in this repository is Apache-2.0 (`LICENSE`). Most of the packages it depends on
carry permissive open-source licences of their own, listed in each package's
`package.json`. The runtime dependencies below are under other terms, so they are named
here.

## GSAP

- Packages: `gsap` 3.15.0 and `@gsap/react` 2.1.2 (versions from `package.json`).
- Licence: GreenSock's standard "no charge" licence, its own licence and not Apache-2.0.
  The packages' `package.json` files point to it: https://gsap.com/standard-license
- Used for: `lib/motion/loader.ts` loads `gsap` on demand, with a dynamic `import()`, to
  sequence the animations that replay the recorded run (`docs/MOTION.md`). It is in no
  first-load chunk. The loader can also load `@gsap/react` and the `DrawSVGPlugin` that
  ships inside `gsap`; the current sequences use neither.
- The repository lists these packages as dependencies and does not include or
  redistribute their source. Anyone who installs them takes them under GreenSock's terms.

## Fonts

| Font | Package | Version | Licence |
|---|---|---|---|
| Archivo (variable, weight and width axes) | `@fontsource-variable/archivo` | 5.3.0 | OFL-1.1 (SIL Open Font License 1.1) |
| IBM Plex Mono (400 and 500) | `@fontsource/ibm-plex-mono` | 5.3.0 | OFL-1.1 (SIL Open Font License 1.1) |

The licence is as each package's `package.json` states it; the full licence text and the
font copyright lines ship in each package's `LICENSE` file. The site serves the font files
from these packages: `app/layout.tsx` loads Archivo through `next/font/local` and imports
the two Plex Mono weights.
