import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeWoff2, staticArchivo, type Font } from "@/lib/og/archivo";

// lib/og/archivo.ts turns Archivo's variable WOFF2 into static TrueType fonts for the
// share image. These read the fonts it writes the way a font reader would: the
// header, the table directory, cmap and hmtx.

const WOFF2 = path.join(process.cwd(), "node_modules", "@fontsource-variable", "archivo", "files", "archivo-latin-wdth-normal.woff2");
const PAGE = path.join(process.cwd(), "app", "opengraph-image.tsx");

// The instances the image asks for, read from its source so this stays in step.
const used = [...fs.readFileSync(PAGE, "utf8").matchAll(/staticArchivo\(\w+, \{ wght: (\d+), wdth: (\d+) \}\)/g)].map((m) => ({
  wght: Number(m[1]),
  wdth: Number(m[2]),
}));

let variable: Font | null = null;
const font = (): Font => (variable ??= decodeWoff2(fs.readFileSync(WOFF2)));

type Table = { tag: string; offset: number; length: number };

function directory(buf: ArrayBuffer): { version: number; tables: Table[] } {
  const v = new DataView(buf);
  const count = v.getUint16(4);
  const tables: Table[] = [];
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
    tables.push({ tag, offset: v.getUint32(at + 8), length: v.getUint32(at + 12) });
  }
  return { version: v.getUint32(0), tables };
}

function table(buf: ArrayBuffer, tag: string): DataView {
  const t = directory(buf).tables.find((x) => x.tag === tag);
  if (!t) throw new Error(`no ${tag} table`);
  return new DataView(buf, t.offset, t.length);
}

// The glyph for a character, from the cmap's Windows Unicode BMP subtable (format 4).
function glyphOf(buf: ArrayBuffer, ch: string): number {
  const cmap = table(buf, "cmap");
  const code = ch.charCodeAt(0);
  for (let i = 0; i < cmap.getUint16(2); i++) {
    const platform = cmap.getUint16(4 + i * 8);
    const encoding = cmap.getUint16(6 + i * 8);
    const off = cmap.getUint32(8 + i * 8);
    if (platform !== 3 || encoding !== 1 || cmap.getUint16(off) !== 4) continue;
    const segs = cmap.getUint16(off + 6) / 2;
    const ends = off + 14;
    const starts = ends + segs * 2 + 2;
    const deltas = starts + segs * 2;
    const ranges = deltas + segs * 2;
    for (let s = 0; s < segs; s++) {
      if (code > cmap.getUint16(ends + s * 2)) continue;
      const start = cmap.getUint16(starts + s * 2);
      if (code < start) return 0;
      const delta = cmap.getInt16(deltas + s * 2);
      const range = cmap.getUint16(ranges + s * 2);
      if (range === 0) return (code + delta) & 0xffff;
      const g = cmap.getUint16(ranges + s * 2 + range + (code - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
  }
  throw new Error("no format 4 Unicode cmap");
}

function advanceOf(buf: ArrayBuffer, glyph: number): number {
  const metrics = table(buf, "hhea").getUint16(34);
  const hmtx = table(buf, "hmtx");
  return hmtx.getUint16(Math.min(glyph, metrics - 1) * 4);
}

describe("Archivo for the share image", () => {
  it("the image asks for three instances, at the weights and widths the design sets", () => {
    expect(used).toEqual([
      { wght: 600, wdth: 110 },
      { wght: 500, wdth: 100 },
      { wght: 620, wdth: 118 },
    ]);
  });

  const REQUIRED = ["cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "post"];

  it.each(used)("an instance at weight $wght, width $wdth is a valid static TrueType font", ({ wght, wdth }) => {
    const buf = staticArchivo(font(), { wght, wdth });
    const { version, tables } = directory(buf);
    expect(version).toBe(0x00010000);
    const tags = tables.map((t) => t.tag);
    for (const tag of REQUIRED) expect(tags, tag).toContain(tag);
    // Static: no variation tables left for the renderer to ignore.
    for (const tag of ["fvar", "gvar", "avar", "HVAR"]) expect(tags).not.toContain(tag);
    // The directory is sorted, and every table lies inside the file.
    expect([...tags].sort()).toEqual(tags);
    for (const t of tables) expect(t.offset + t.length, t.tag).toBeLessThanOrEqual(buf.byteLength);
    // head carries the TrueType magic number and long loca offsets.
    const head = table(buf, "head");
    expect(head.getUint32(12)).toBe(0x5f0f3cf5);
    expect(head.getInt16(50)).toBe(1);
    // loca has one more offset than there are glyphs, and ends at glyf's length.
    const glyphs = table(buf, "maxp").getUint16(4);
    const loca = table(buf, "loca");
    expect(loca.byteLength).toBe((glyphs + 1) * 4);
    expect(loca.getUint32(glyphs * 4)).toBe(table(buf, "glyf").byteLength);
  });

  it("two widths give different advance widths for the same glyph", () => {
    const narrow = staticArchivo(font(), { wght: 600, wdth: 100 });
    const wide = staticArchivo(font(), { wght: 600, wdth: 118 });
    for (const ch of ["M", "o", "8"]) {
      const g = glyphOf(narrow, ch);
      expect(g, ch).toBeGreaterThan(0);
      expect(glyphOf(wide, ch)).toBe(g);
      expect(advanceOf(wide, g), ch).toBeGreaterThan(advanceOf(narrow, g));
    }
  });
});
