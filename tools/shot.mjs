#!/usr/bin/env node
// shot.mjs: page screenshots through Chrome's DevTools protocol. No dependencies.
//
//   node shot.mjs --url http://127.0.0.1:3302/ --out C:/path/home.png
//   node shot.mjs --url ... --out ... --mobile            (390 x 844 at 2x, touch)
//   node shot.mjs --url ... --out ... --mode tiles        (one file per screenful: home-01.png, home-02.png ...)
//   node shot.mjs --url ... --out ... --mode full         (one tall image, capped at 12000 px)
//   node shot.mjs --url ... --out ... --selector "#demo"  (just that element)
//   node shot.mjs --url ... --out ... --eval "document.querySelector('button').click()" --wait 800
//   node shot.mjs --jobs C:/path/jobs.json                (an array of jobs with the same field names)
//
//   node shot.mjs --url ... --out C:/path/page.pdf --mode pdf   (what "Print, save as PDF" produces)
//
// Other flags: --width 1440 --height 900 --dpr 1 --scheme dark|light --motion
// (motion is reduced by default so a shot shows the settled state) --maxTiles 14
// --nojs (load with scripts off; --eval cannot be used with it) --media print
// (lay the page out with its print styles before the shot).
//
// Prints one JSON array: for each job the files written, the page title, the
// document height, horizontal overflow in px (0 is what you want), console
// errors and failed requests. Read the PNGs to look at the page.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean).find((p) => fs.existsSync(p));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Windows lockout guard (2026-11-13). Do not remove, and carry it into any copy.
// A brand-new Chrome profile tests the Windows account once with an empty password
// to learn whether the password is blank. Windows counts that as a failed sign-in,
// and ten in ten minutes locks the account for ten minutes. Chrome skips the test
// when the profile already holds the answer, so every throwaway profile is seeded
// with the answer from the everyday Chrome profile (or the one saved by the last run).
const OS_CHECK_SEED = path.join(os.homedir(), ".shot-chrome-os-check.json");

function readOsCheck(file) {
  try {
    const pm = JSON.parse(fs.readFileSync(file, "utf8")).password_manager;
    if (pm && typeof pm.os_password_blank === "boolean" && /^\d+$/.test(pm.os_password_last_changed ?? "")) {
      return { os_password_blank: pm.os_password_blank, os_password_last_changed: pm.os_password_last_changed };
    }
  } catch {
    /* missing or mid-write: try the next source */
  }
  return null;
}

function seedOsCheck(profile) {
  if (process.platform !== "win32") return;
  try {
    const local = process.env.LOCALAPPDATA || "";
    const sources = [
      path.join(local, "Google/Chrome/User Data/Local State"),
      path.join(local, "Microsoft/Edge/User Data/Local State"),
      OS_CHECK_SEED,
    ];
    let best = null;
    for (const file of sources) {
      const pm = readOsCheck(file);
      // The newest password-change time wins, so a stale source cannot undo the seed.
      if (pm && (!best || BigInt(pm.os_password_last_changed) > BigInt(best.os_password_last_changed))) best = pm;
    }
    if (best) fs.writeFileSync(path.join(profile, "Local State"), JSON.stringify({ password_manager: best }));
  } catch {
    /* never let the guard stop a screenshot */
  }
}

function rememberOsCheck(profile) {
  if (process.platform !== "win32") return;
  const pm = readOsCheck(path.join(profile, "Local State"));
  if (!pm) return;
  try {
    fs.writeFileSync(OS_CHECK_SEED, JSON.stringify({ password_manager: pm }));
  } catch {
    /* best effort */
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!CHROME) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
  let jobs;
  if (args.jobs) jobs = JSON.parse(fs.readFileSync(args.jobs, "utf8"));
  else if (args.url && args.out) jobs = [args];
  else throw new Error("Give --url and --out, or --jobs <file.json>.");

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shot-"));
  seedOsCheck(profile);
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      "--mute-audio",
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const results = [];
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    let lines = null;
    for (let i = 0; i < 150 && !lines; i++) {
      await sleep(100);
      if (fs.existsSync(portFile)) {
        const text = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
        if (text.length >= 2) lines = text;
      }
    }
    if (!lines) throw new Error("Chrome did not open its debugging port.");
    const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("Could not connect to Chrome.")), { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    const listeners = new Set();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of listeners) fn(msg);
      }
    });
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });

    for (const raw of jobs) {
      results.push(await runJob(raw, send, listeners));
    }
    try {
      await send("Browser.close");
    } catch {
      /* already gone */
    }
  } finally {
    await sleep(300);
    try {
      chrome.kill();
    } catch {
      /* ignore */
    }
    await sleep(300);
    rememberOsCheck(profile);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Chrome may still hold a file; the temp folder is cleaned later */
    }
  }
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}

async function runJob(raw, send, listeners) {
  const mobile = raw.mobile === true || raw.mobile === "true";
  const width = Number(raw.width ?? (mobile ? 390 : 1440));
  const height = Number(raw.height ?? (mobile ? 844 : 900));
  const dpr = Number(raw.dpr ?? (mobile ? 2 : 1));
  const mode = raw.mode ?? "viewport";
  const wait = Number(raw.wait ?? 700);
  const maxTiles = Number(raw.maxTiles ?? 14);
  const out = path.resolve(String(raw.out));
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const result = { url: raw.url, files: [], title: null, docHeight: null, overflowX: null, consoleErrors: [], failedRequests: [] };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (method, params = {}) => send(method, params, sessionId);

  let loaded = null;
  const loadPromise = new Promise((r) => (loaded = r));
  const onEvent = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Page.loadEventFired") loaded();
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      result.consoleErrors.push(String(d.exception?.description ?? d.text).slice(0, 400));
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      result.consoleErrors.push(`${msg.params.entry.text} ${msg.params.entry.url ?? ""}`.trim().slice(0, 400));
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      result.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
    }
    if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) {
      result.failedRequests.push(`${msg.params.response.status} ${msg.params.response.url}`.slice(0, 300));
    }
  };
  listeners.add(onEvent);

  try {
    await S("Page.enable");
    await S("Runtime.enable");
    await S("Log.enable");
    await S("Network.enable");
    await S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
    if (mobile) await S("Emulation.setTouchEmulationEnabled", { enabled: true });
    const features = [{ name: "prefers-reduced-motion", value: raw.motion ? "no-preference" : "reduce" }];
    if (raw.scheme) features.push({ name: "prefers-color-scheme", value: String(raw.scheme) });
    // --media print: lay the page out with its print styles, to look at the print view in a screenshot.
    await S("Emulation.setEmulatedMedia", { features, ...(raw.media ? { media: String(raw.media) } : {}) });
    // --nojs: load the page with scripts off, to check that it still reads.
    if (raw.nojs) await S("Emulation.setScriptExecutionDisabled", { value: true });

    await S("Page.navigate", { url: String(raw.url) });
    await Promise.race([loadPromise, sleep(30000)]);
    const evaluate = async (expression) => {
      const r = await S("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    };
    await evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
    await sleep(wait);
    if (raw.eval) {
      await evaluate(String(raw.eval));
      await sleep(wait);
    }

    const info = await evaluate(
      "({ title: document.title, h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0), ox: Math.max(0, document.documentElement.scrollWidth - window.innerWidth) })",
    );
    result.title = info.title;
    result.docHeight = info.h;
    result.overflowX = info.ox;

    const write = (file, data) => {
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      result.files.push(file);
    };
    const ext = path.extname(out) || ".png";
    const stem = out.slice(0, out.length - path.extname(out).length);

    if (mode === "pdf") {
      // --mode pdf: what "Print, save as PDF" produces (Letter, the page's own print styles and margins).
      const pdf = await S("Page.printToPDF", { printBackground: false, preferCSSPageSize: true, paperWidth: 8.5, paperHeight: 11 });
      write(`${stem}.pdf`, pdf.data);
    } else if (raw.selector) {
      const box = await evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(String(raw.selector))}); if (!el) return null; el.scrollIntoView({ block: "start" }); const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }; })()`,
      );
      if (!box) throw new Error(`selector not found: ${raw.selector}`);
      await sleep(350);
      const shot = await S("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.min(12000, Math.max(1, box.height)), scale: 1 },
      });
      write(out, shot.data);
    } else if (mode === "tiles") {
      const count = Math.min(maxTiles, Math.max(1, Math.ceil(info.h / height)));
      for (let i = 0; i < count; i++) {
        await evaluate(`window.scrollTo(0, ${i * height})`);
        await sleep(350);
        const shot = await S("Page.captureScreenshot", { format: "png" });
        write(`${stem}-${String(i + 1).padStart(2, "0")}${ext}`, shot.data);
      }
      if (Math.ceil(info.h / height) > count) result.truncated = `${count} of ${Math.ceil(info.h / height)} screens`;
    } else if (mode === "full") {
      for (let y = 0; y < info.h; y += height) {
        await evaluate(`window.scrollTo(0, ${y})`);
        await sleep(120);
      }
      await evaluate("window.scrollTo(0, 0)");
      await sleep(300);
      const h = Math.min(12000, info.h);
      const shot = await S("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: h, scale: 1 },
      });
      write(out, shot.data);
      if (info.h > h) result.truncated = `${h} of ${info.h} px`;
    } else {
      const shot = await S("Page.captureScreenshot", { format: "png" });
      write(out, shot.data);
    }
  } catch (err) {
    result.error = String(err && err.message ? err.message : err);
  } finally {
    listeners.delete(onEvent);
    try {
      await send("Target.closeTarget", { targetId });
    } catch {
      /* ignore */
    }
  }
  return result;
}

main().catch((err) => {
  process.stderr.write(`shot: ${err.message}\n`);
  process.exit(1);
});
