// Archivo for the share image (app/opengraph-image.tsx).
//
// The image renderer (next/og) reads TrueType, OpenType and WOFF, never WOFF2, and
// draws a variable font at its default instance only. The Archivo package
// (@fontsource-variable/archivo) ships the variable font as WOFF2 and nothing else.
// So this decodes the WOFF2 (brotli, the transformed glyf and loca tables), applies
// the variation deltas (gvar, through avar) for a chosen weight and width, and writes
// a static TrueType font the renderer can use. It runs once, when the image is built.
//
//   const font = decodeWoff2(bytes);                       // the variable font
//   const ttf = staticArchivo(font, { wght: 600, wdth: 110 }); // one static instance
//
// __tests__/og-font.test.ts checks the instances the image uses.
import { brotliDecompressSync } from "node:zlib";

const WOFF2_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep",
  "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE",
  "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt",
  "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar",
  "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

class Reader {
  constructor(
    readonly b: Uint8Array,
    public pos = 0,
  ) {}
  u8(): number {
    const v = this.b[this.pos];
    if (v === undefined) throw new Error("font: read past the end of a table");
    this.pos += 1;
    return v;
  }
  i8(): number {
    const v = this.u8();
    return v & 0x80 ? v - 0x100 : v;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  i16(): number {
    const v = this.u16();
    return v & 0x8000 ? v - 0x10000 : v;
  }
  u32(): number {
    return this.u16() * 0x10000 + this.u16();
  }
  f2dot14(): number {
    return this.i16() / 16384;
  }
  base128(): number {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const c = this.u8();
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) return v;
    }
    throw new Error("font: bad UIntBase128");
  }
  u255(): number {
    const c = this.u8();
    if (c === 253) return this.u16();
    if (c === 255) return 253 + this.u8();
    if (c === 254) return 506 + this.u8();
    return c;
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.b.length) throw new Error("font: read past the end of a table");
    const out = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

type Simple = { kind: "simple"; ends: number[]; xs: number[]; ys: number[]; on: boolean[] };
type Component = { flags: number; glyph: number; a: number; b: number; scale: Uint8Array };
type Composite = { kind: "composite"; comps: Component[]; box: [number, number, number, number] };
type Glyph = { kind: "empty" } | Simple | Composite;
export type Font = { tables: Map<string, Uint8Array>; glyphs: Glyph[]; advance: number[]; lsb: number[] };

function tripletDelta(flag: number, r: Reader): [number, number] {
  const sign = (f: number, v: number) => (f & 1 ? v : -v);
  if (flag < 10) return [0, sign(flag, ((flag & 14) << 7) + r.u8())];
  if (flag < 20) return [sign(flag, (((flag - 10) & 14) << 7) + r.u8()), 0];
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = r.u8();
    return [sign(flag, 1 + (b0 & 0x30) + (b1 >> 4)), sign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f))];
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const x = r.u8();
    const y = r.u8();
    return [sign(flag, 1 + (Math.floor(b0 / 12) << 8) + x), sign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + y)];
  }
  if (flag < 124) {
    const x = r.u8();
    const b2 = r.u8();
    const y = r.u8();
    return [sign(flag, (x << 4) + (b2 >> 4)), sign(flag >> 1, ((b2 & 0x0f) << 8) + y)];
  }
  const x = r.u16();
  const y = r.u16();
  return [sign(flag, x), sign(flag >> 1, y)];
}

// The WOFF2 transformed glyf table, read into outlines.
function decodeGlyf(data: Uint8Array): Glyph[] {
  const h = new Reader(data);
  h.u16();
  const options = h.u16();
  const numGlyphs = h.u16();
  h.u16();
  const sizes = Array.from({ length: 7 }, () => h.u32());
  const streams: Reader[] = [];
  let at = h.pos;
  for (const n of sizes) {
    streams.push(new Reader(data.subarray(at, at + n)));
    at += n;
  }
  const [nContour, nPoints, flagS, glyphS, compositeS, bboxS, instrS] = streams as [
    Reader, Reader, Reader, Reader, Reader, Reader, Reader,
  ];
  if (options & 1) throw new Error("font: overlap bitmap not handled");
  const bitmap = bboxS.bytes(4 * Math.floor((numGlyphs + 31) / 32));
  const hasBox = (i: number) => ((bitmap[i >> 3] ?? 0) & (0x80 >> (i & 7))) !== 0;
  const readBox = (): [number, number, number, number] => [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()];

  const glyphs: Glyph[] = [];
  for (let g = 0; g < numGlyphs; g++) {
    const contours = nContour.i16();
    if (contours === 0) {
      glyphs.push({ kind: "empty" });
    } else if (contours < 0) {
      const comps: Component[] = [];
      let more = true;
      let instructions = false;
      while (more) {
        const flags = compositeS.u16();
        const glyph = compositeS.u16();
        const words = (flags & 0x1) !== 0;
        const xy = (flags & 0x2) !== 0;
        const a = words ? (xy ? compositeS.i16() : compositeS.u16()) : xy ? compositeS.i8() : compositeS.u8();
        const b = words ? (xy ? compositeS.i16() : compositeS.u16()) : xy ? compositeS.i8() : compositeS.u8();
        const scaleBytes = flags & 0x8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0;
        comps.push({ flags, glyph, a, b, scale: compositeS.bytes(scaleBytes) });
        if (flags & 0x100) instructions = true;
        more = (flags & 0x20) !== 0;
      }
      const box = readBox();
      if (instructions) instrS.bytes(glyphS.u255());
      glyphs.push({ kind: "composite", comps, box });
    } else {
      const ends: number[] = [];
      let total = 0;
      for (let c = 0; c < contours; c++) {
        total += nPoints.u255();
        ends.push(total - 1);
      }
      const xs: number[] = [];
      const ys: number[] = [];
      const on: boolean[] = [];
      let x = 0;
      let y = 0;
      for (let p = 0; p < total; p++) {
        const flag = flagS.u8();
        const [dx, dy] = tripletDelta(flag & 0x7f, glyphS);
        x += dx;
        y += dy;
        xs.push(x);
        ys.push(y);
        on.push((flag & 0x80) === 0);
      }
      instrS.bytes(glyphS.u255());
      if (hasBox(g)) readBox();
      glyphs.push({ kind: "simple", ends, xs, ys, on });
    }
  }
  return glyphs;
}

export function decodeWoff2(file: Uint8Array): Font {
  const r = new Reader(file);
  if (r.u32() !== 0x774f4632) throw new Error("font: not a WOFF2 file");
  r.pos = 12;
  const numTables = r.u16();
  r.pos = 48;
  const dir: Array<{ tag: string; length: number }> = [];
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8();
    const known = flags & 0x3f;
    const tag = known === 0x3f ? String.fromCharCode(...r.bytes(4)) : WOFF2_TAGS[known];
    if (tag === undefined) throw new Error("font: unknown table tag");
    const version = flags >> 6;
    const orig = r.base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    const length = transformed ? r.base128() : orig;
    if (transformed && tag !== "glyf" && tag !== "loca") throw new Error(`font: transformed ${tag} not handled`);
    if (tag === "glyf" && !transformed) throw new Error("font: untransformed glyf not handled");
    dir.push({ tag, length });
  }
  const stream = brotliDecompressSync(file.subarray(r.pos));
  const tables = new Map<string, Uint8Array>();
  let at = 0;
  for (const { tag, length } of dir) {
    tables.set(tag, new Uint8Array(stream.buffer, stream.byteOffset + at, length));
    at += length;
  }
  const glyf = tables.get("glyf");
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  if (!glyf || !hhea || !hmtx) throw new Error("font: missing glyf, hhea or hmtx");
  const glyphs = decodeGlyf(glyf);
  const numHMetrics = new Reader(hhea, 34).u16();
  const m = new Reader(hmtx);
  const advance: number[] = [];
  const lsb: number[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    if (i < numHMetrics) advance.push(m.u16());
    else advance.push(advance[advance.length - 1] ?? 0);
    lsb.push(m.i16());
  }
  return { tables, glyphs, advance, lsb };
}

function normalizedCoords(font: Font, at: Record<string, number>): number[] {
  const fvar = font.tables.get("fvar");
  if (!fvar) throw new Error("font: not a variable font");
  const r = new Reader(fvar, 4);
  const axesOffset = r.u16();
  r.u16();
  const axisCount = r.u16();
  const axisSize = r.u16();
  const coords: number[] = [];
  for (let i = 0; i < axisCount; i++) {
    const a = new Reader(fvar, axesOffset + i * axisSize);
    const tag = String.fromCharCode(...a.bytes(4));
    const min = a.u32() / 65536;
    const def = a.u32() / 65536;
    const max = a.u32() / 65536;
    const v = Math.min(max, Math.max(min, at[tag] ?? def));
    coords.push(v < def ? (v - def) / (def - min) : v > def ? (v - def) / (max - def) : 0);
  }
  const avar = font.tables.get("avar");
  if (avar) {
    const ar = new Reader(avar, 8);
    for (let i = 0; i < axisCount; i++) {
      const pairs = ar.u16();
      const map: Array<[number, number]> = [];
      for (let p = 0; p < pairs; p++) map.push([ar.f2dot14(), ar.f2dot14()]);
      const v = coords[i] ?? 0;
      for (let p = 1; p < map.length; p++) {
        const [f0, t0] = map[p - 1] as [number, number];
        const [f1, t1] = map[p] as [number, number];
        if (v <= f1) {
          coords[i] = f1 === f0 ? t0 : t0 + ((v - f0) * (t1 - t0)) / (f1 - f0);
          break;
        }
      }
    }
  }
  return coords;
}

function packedPoints(r: Reader): number[] | null {
  const first = r.u8();
  if (first === 0) return null;
  const count = first & 0x80 ? ((first & 0x7f) << 8) | r.u8() : first;
  const points: number[] = [];
  let last = 0;
  while (points.length < count) {
    const control = r.u8();
    const run = (control & 0x7f) + 1;
    for (let i = 0; i < run && points.length < count; i++) {
      last += control & 0x80 ? r.u16() : r.u8();
      points.push(last);
    }
  }
  return points;
}

function packedDeltas(r: Reader, count: number): number[] {
  const out: number[] = [];
  while (out.length < count) {
    const control = r.u8();
    const run = (control & 0x3f) + 1;
    for (let i = 0; i < run && out.length < count; i++) {
      out.push(control & 0x80 ? 0 : control & 0x40 ? r.i16() : r.i8());
    }
  }
  return out;
}

function tupleScalar(coords: number[], peak: number[], start: number[] | null, end: number[] | null): number {
  let scalar = 1;
  for (let i = 0; i < coords.length; i++) {
    const p = peak[i] ?? 0;
    if (p === 0) continue;
    const v = coords[i] ?? 0;
    if (v === 0) return 0;
    if (start && end) {
      const s = start[i] ?? 0;
      const e = end[i] ?? 0;
      if (v < s || v > e) return 0;
      if (v < p) scalar *= (v - s) / (p - s);
      else if (v > p) scalar *= (e - v) / (e - p);
    } else {
      if (v < Math.min(0, p) || v > Math.max(0, p)) return 0;
      scalar *= v / p;
    }
  }
  return scalar;
}

// The deltas of points a tuple leaves out, inferred contour by contour (IUP).
function inferDeltas(orig: number[], ends: number[], touched: boolean[], d: number[]): void {
  let startPt = 0;
  for (const end of ends) {
    const refs: number[] = [];
    for (let p = startPt; p <= end; p++) if (touched[p]) refs.push(p);
    if (refs.length > 0) {
      const lastRef = refs[refs.length - 1] as number;
      for (let p = startPt; p <= end; p++) {
        if (touched[p]) continue;
        let prev = lastRef;
        let next = refs[0] as number;
        for (const ref of refs) {
          if (ref < p) prev = ref;
          else {
            next = ref;
            break;
          }
        }
        if (p > lastRef) next = refs[0] as number;
        let i1 = orig[prev] as number;
        let i2 = orig[next] as number;
        let d1 = d[prev] as number;
        let d2 = d[next] as number;
        if (i1 > i2) [i1, i2, d1, d2] = [i2, i1, d2, d1];
        const x = orig[p] as number;
        d[p] = i1 === i2 ? (d1 === d2 ? d1 : 0) : x <= i1 ? d1 : x >= i2 ? d2 : d1 + ((x - i1) * (d2 - d1)) / (i2 - i1);
      }
    }
    startPt = end + 1;
  }
}

// A glyph's points with the four phantom points (origin, advance, top, bottom) appended.
function glyphPoints(font: Font, g: number): { xs: number[]; ys: number[]; ends: number[] } {
  const glyph = font.glyphs[g];
  const adv = font.advance[g] ?? 0;
  const lsb = font.lsb[g] ?? 0;
  let xs: number[] = [];
  let ys: number[] = [];
  let ends: number[] = [];
  let xMin = 0;
  if (glyph?.kind === "simple") {
    xs = [...glyph.xs];
    ys = [...glyph.ys];
    ends = glyph.ends;
    xMin = Math.min(...xs);
  } else if (glyph?.kind === "composite") {
    xs = glyph.comps.map((c) => c.a);
    ys = glyph.comps.map((c) => c.b);
    ends = xs.map((_, i) => i);
    xMin = glyph.box[0];
  }
  const origin = xMin - lsb;
  xs.push(origin, origin + adv, 0, 0);
  ys.push(0, 0, 0, 0);
  return { xs, ys, ends };
}

function instance(font: Font, coords: number[]): Font {
  const gvar = font.tables.get("gvar");
  if (!gvar) throw new Error("font: no gvar");
  const h = new Reader(gvar, 4);
  const axisCount = h.u16();
  const sharedCount = h.u16();
  const sharedOffset = h.u32();
  const glyphCount = h.u16();
  const long = (h.u16() & 1) !== 0;
  const dataOffset = h.u32();
  const offsets = Array.from({ length: glyphCount + 1 }, () => (long ? h.u32() : h.u16() * 2));
  const sr = new Reader(gvar, sharedOffset);
  const shared = Array.from({ length: sharedCount }, () => Array.from({ length: axisCount }, () => sr.f2dot14()));

  const glyphs: Glyph[] = [];
  const advance: number[] = [];
  const lsb: number[] = [];
  for (let g = 0; g < font.glyphs.length; g++) {
    const glyph = font.glyphs[g] as Glyph;
    const { xs, ys, ends } = glyphPoints(font, g);
    const n = xs.length;
    const dx = new Array<number>(n).fill(0);
    const dy = new Array<number>(n).fill(0);
    const begin = offsets[g] ?? 0;
    const stop = offsets[g + 1] ?? begin;
    if (g < glyphCount && stop > begin) {
      const base = dataOffset + begin;
      const r = new Reader(gvar, base);
      const countWord = r.u16();
      const serialized = new Reader(gvar, base + r.u16());
      const sharedPoints = countWord & 0x8000 ? packedPoints(serialized) : null;
      for (let t = 0; t < (countWord & 0x0fff); t++) {
        const dataSize = r.u16();
        const index = r.u16();
        const peak = index & 0x8000 ? Array.from({ length: axisCount }, () => r.f2dot14()) : (shared[index & 0x0fff] ?? []);
        const inter = (index & 0x4000) !== 0;
        const startT = inter ? Array.from({ length: axisCount }, () => r.f2dot14()) : null;
        const endT = inter ? Array.from({ length: axisCount }, () => r.f2dot14()) : null;
        const next = serialized.pos + dataSize;
        const scalar = tupleScalar(coords, peak, startT, endT);
        if (scalar !== 0) {
          const points = index & 0x2000 ? packedPoints(serialized) : sharedPoints;
          const count = points ? points.length : n;
          const tx = packedDeltas(serialized, count);
          const ty = packedDeltas(serialized, count);
          const ddx = new Array<number>(n).fill(0);
          const ddy = new Array<number>(n).fill(0);
          if (!points) {
            for (let p = 0; p < n; p++) {
              ddx[p] = tx[p] ?? 0;
              ddy[p] = ty[p] ?? 0;
            }
          } else {
            const touched = new Array<boolean>(n).fill(false);
            points.forEach((p, i) => {
              if (p >= n) return;
              ddx[p] = tx[i] ?? 0;
              ddy[p] = ty[i] ?? 0;
              touched[p] = true;
            });
            if (glyph.kind === "simple") {
              inferDeltas(xs, ends, touched, ddx);
              inferDeltas(ys, ends, touched, ddy);
            }
          }
          for (let p = 0; p < n; p++) {
            dx[p] = (dx[p] ?? 0) + scalar * (ddx[p] ?? 0);
            dy[p] = (dy[p] ?? 0) + scalar * (ddy[p] ?? 0);
          }
        }
        serialized.pos = next;
      }
    }
    const nx = xs.map((x, i) => Math.round(x + (dx[i] ?? 0)));
    const ny = ys.map((y, i) => Math.round(y + (dy[i] ?? 0)));
    const origin = nx[n - 4] ?? 0;
    advance.push((nx[n - 3] ?? 0) - origin);
    if (glyph.kind === "simple") {
      const px = nx.slice(0, n - 4).map((x) => x - origin);
      glyphs.push({ kind: "simple", ends: glyph.ends, xs: px, ys: ny.slice(0, n - 4), on: glyph.on });
      lsb.push(Math.min(...px));
    } else if (glyph.kind === "composite") {
      const comps = glyph.comps.map((c, i) => (c.flags & 0x2 ? { ...c, a: (nx[i] ?? 0) - origin, b: ny[i] ?? 0 } : c));
      glyphs.push({ kind: "composite", comps, box: glyph.box });
      lsb.push(glyph.box[0]);
    } else {
      glyphs.push(glyph);
      lsb.push(0);
    }
  }
  return { tables: font.tables, glyphs, advance, lsb };
}

class Writer {
  bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  u32(v: number) {
    this.u16(Math.floor(v / 0x10000));
    this.u16(v & 0xffff);
  }
  pad() {
    while (this.bytes.length % 4) this.u8(0);
  }
}

// Composite boxes are kept from the default instance; the renderer draws from points.
function boxOf(glyph: Glyph): [number, number, number, number] {
  if (glyph.kind === "composite") return glyph.box;
  if (glyph.kind !== "simple") return [0, 0, 0, 0];
  return [Math.min(...glyph.xs), Math.min(...glyph.ys), Math.max(...glyph.xs), Math.max(...glyph.ys)];
}

function writeTtf(font: Font): ArrayBuffer {
  const glyf = new Writer();
  const loca = new Writer();
  for (const glyph of font.glyphs) {
    loca.u32(glyf.bytes.length);
    if (glyph.kind === "empty") continue;
    glyf.u16(glyph.kind === "simple" ? glyph.ends.length : 0xffff);
    for (const v of boxOf(glyph)) glyf.u16(v);
    if (glyph.kind === "simple") {
      for (const e of glyph.ends) glyf.u16(e);
      glyf.u16(0);
      for (const o of glyph.on) glyf.u8(o ? 1 : 0);
      let last = 0;
      for (const x of glyph.xs) {
        glyf.u16(x - last);
        last = x;
      }
      last = 0;
      for (const y of glyph.ys) {
        glyf.u16(y - last);
        last = y;
      }
    } else {
      glyph.comps.forEach((c, i) => {
        const more = i < glyph.comps.length - 1 ? 0x20 : 0;
        glyf.u16((c.flags & ~(0x20 | 0x100)) | 0x1 | more);
        glyf.u16(c.glyph);
        glyf.u16(c.a);
        glyf.u16(c.b);
        for (const byte of c.scale) glyf.u8(byte);
      });
    }
    glyf.pad();
  }
  loca.u32(glyf.bytes.length);

  const hmtx = new Writer();
  font.glyphs.forEach((_, i) => {
    hmtx.u16(font.advance[i] ?? 0);
    hmtx.u16(font.lsb[i] ?? 0);
  });

  const patch = (tag: string, edit: (b: Uint8Array) => void): Uint8Array => {
    const src = font.tables.get(tag);
    if (!src) throw new Error(`font: missing ${tag}`);
    const copy = new Uint8Array(src);
    edit(copy);
    return copy;
  };
  const out = new Map<string, Uint8Array>();
  for (const tag of ["cmap", "maxp", "name", "OS/2", "post", "GSUB", "GPOS"]) {
    const t = font.tables.get(tag);
    if (t) out.set(tag, t);
  }
  // head: no checksum adjustment, long loca offsets. hhea: a metric for every glyph.
  out.set("head", patch("head", (b) => {
    b.fill(0, 8, 12);
    b[50] = 0;
    b[51] = 1;
  }));
  out.set("hhea", patch("hhea", (b) => {
    b[34] = font.glyphs.length >> 8;
    b[35] = font.glyphs.length & 0xff;
  }));
  out.set("glyf", Uint8Array.from(glyf.bytes));
  out.set("loca", Uint8Array.from(loca.bytes));
  out.set("hmtx", Uint8Array.from(hmtx.bytes));

  const tags = [...out.keys()].sort();
  const file = new Writer();
  file.u32(0x00010000);
  file.u16(tags.length);
  const pow = 2 ** Math.floor(Math.log2(tags.length));
  file.u16(pow * 16);
  file.u16(Math.log2(pow));
  file.u16(tags.length * 16 - pow * 16);
  let offset = 12 + tags.length * 16;
  for (const tag of tags) {
    const data = out.get(tag) as Uint8Array;
    for (let i = 0; i < 4; i++) file.u8(tag.charCodeAt(i));
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum = (sum + (((data[i] ?? 0) << 24) >>> 0) + ((data[i + 1] ?? 0) << 16) + ((data[i + 2] ?? 0) << 8) + (data[i + 3] ?? 0)) >>> 0;
    }
    file.u32(sum);
    file.u32(offset);
    file.u32(data.length);
    offset += Math.ceil(data.length / 4) * 4;
  }
  for (const tag of tags) {
    for (const byte of out.get(tag) as Uint8Array) file.u8(byte);
    file.pad();
  }
  return Uint8Array.from(file.bytes).buffer;
}

export function staticArchivo(font: Font, at: Record<string, number>): ArrayBuffer {
  return writeTtf(instance(font, normalizedCoords(font, at)));
}
