// Desktop and command-line check: for an app that runs on the user's own computer (a screen recorder, an editor, a tool), "fast"
// means it starts quickly, stays light while it waits, and is a small download. This starts the app, times how long until it is
// ready, then watches the memory and processor use of the app and every process it started, and stops it again. For a
// command-line tool it times a full run instead.
// Run: node desktop-check.mjs --cmd "<start command>" [--ready-text "<text the app prints when ready>" | --ready-port 5173 |
//        --ready-file <path> | --until-exit] [--watch-seconds 10] [--build <installer or app folder>] [--project <dir>]
//        [--max-start-ms N] [--max-idle-mb N] [--max-idle-cpu N] [--max-download-mb N]
// Budgets come from the flags, else .claude/scale.json "budgets", else defaults by kind. Results go to .claude/desktop-results.json.
// Exit 0 = within budget, 1 = over budget or never became ready. Measures what the operating system reports; GPU memory and the
// app's own windows are not seen.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile } from "./scale-profile.mjs";

export const BUDGETS = {
  desktop: { startMs: 2000, idleMb: 250, idleCpu: 2, downloadMb: 150 },
  cli: { startMs: 1000, idleMb: 100, idleCpu: 100, downloadMb: 50 }, // a whole run; Node alone can take ~0.5 s to start on Windows
  default: { startMs: 3000, idleMb: 300, idleCpu: 5, downloadMb: 200 },
};

// Every process: id, parent id, memory in bytes, processor seconds used so far.
export function processTable() {
  if (process.platform === "win32") {
    const ps = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime | ConvertTo-Json -Compress"], { encoding: "utf8", maxBuffer: 1 << 26, windowsHide: true });
    if (ps.status !== 0) return null;
    try {
      return JSON.parse(ps.stdout).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, bytes: Number(p.WorkingSetSize) || 0, cpuSec: ((Number(p.KernelModeTime) || 0) + (Number(p.UserModeTime) || 0)) / 1e7 }));
    } catch {
      return null;
    }
  }
  const ps = spawnSync("ps", ["-A", "-o", "pid=,ppid=,rss=,time="], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (ps.status !== 0) return null;
  const secs = (t) => t.replace(/^(\d+)-/, (_, d) => `${d * 24}:`).split(":").map(Number).reduce((s, x) => s * 60 + x, 0);
  return ps.stdout
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((x) => x.length >= 4)
    .map(([pid, ppid, rss, time]) => ({ pid: Number(pid), ppid: Number(ppid), bytes: Number(rss) * 1024, cpuSec: secs(time) }));
}

// A stream of process tables, about one a second. On Windows, starting PowerShell for every sample takes seconds, so one
// PowerShell keeps running and prints a table per line; elsewhere `ps` is quick enough to call each time.
export function startSampler(onTable) {
  if (process.platform !== "win32") {
    let stop = false;
    (async () => {
      while (!stop) {
        const t = processTable();
        if (t) onTable(t);
        await new Promise((w) => setTimeout(w, 1000));
      }
    })();
    return () => (stop = true);
  }
  const script = "while ($true) { Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime | ConvertTo-Json -Compress; Start-Sleep -Milliseconds 900 }";
  const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  let buf = "";
  ps.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("[")) continue;
      try {
        onTable(JSON.parse(line).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, bytes: Number(p.WorkingSetSize) || 0, cpuSec: ((Number(p.KernelModeTime) || 0) + (Number(p.UserModeTime) || 0)) / 1e7 })));
      } catch {
        /* a partial line */
      }
    }
  });
  return () => spawnSync("taskkill", ["/pid", String(ps.pid), "/T", "/F"], { windowsHide: true });
}

export function treeOf(table, rootPid) {
  const kids = new Map();
  for (const p of table) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p);
  }
  const out = [];
  const seen = new Set();
  const walk = (pid) => {
    for (const c of kids.get(pid) ?? []) {
      if (seen.has(c.pid)) continue;
      seen.add(c.pid);
      out.push(c);
      walk(c.pid);
    }
  };
  const self = table.find((p) => p.pid === rootPid);
  if (self) out.push(self);
  walk(rootPid);
  return out;
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  }
}

const portOpen = (port) =>
  new Promise((res) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), res(true)));
    s.once("error", () => res(false));
  });

export function sizeOf(path) {
  if (!existsSync(path)) return null;
  const st = statSync(path);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const e of readdirSync(path, { withFileTypes: true })) total += sizeOf(join(path, e.name)) ?? 0;
  return total;
}

export async function measure({ cmd, cwd, readyText, readyPort, readyFile, untilExit, watchSeconds = 10, timeoutMs = 60000 }) {
  const started = performance.now();
  const child = spawn(cmd, { cwd, shell: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let out = "";
  let exited = null;
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("exit", (code) => (exited = code ?? 0));
  const result = { readyMs: null, idleMb: null, peakMb: null, idleCpu: null, exitCode: null, error: null, samples: 0 };
  // Start watching at once (the sampler itself takes a moment to start); only samples after "ready" count.
  const all = [];
  const stopSampler = untilExit
    ? () => {}
    : startSampler((table) => {
        const tree = treeOf(table, child.pid);
        if (tree.length) all.push({ t: performance.now(), bytes: tree.reduce((s, p) => s + p.bytes, 0), cpuSec: tree.reduce((s, p) => s + p.cpuSec, 0) });
      });
  try {
    // 1. ready
    while (true) {
      const ms = performance.now() - started;
      if (untilExit && exited !== null) {
        result.readyMs = Math.round(ms);
        result.exitCode = exited;
        return result;
      }
      if (!untilExit && exited !== null) {
        result.error = `the app stopped before it was ready (exit ${exited})${out.trim() ? `: ${out.trim().split("\n").slice(-1)[0].slice(0, 160)}` : ""}`;
        return result;
      }
      if ((readyText && out.includes(readyText)) || (readyPort && (await portOpen(readyPort))) || (readyFile && existsSync(readyFile))) {
        result.readyMs = Math.round(ms);
        break;
      }
      if (!readyText && !readyPort && !readyFile && !untilExit && ms > 1500) {
        result.readyMs = null; // no ready signal given: just watch it
        break;
      }
      if (ms > timeoutMs) {
        result.error = `never became ready within ${timeoutMs / 1000} s`;
        return result;
      }
      await new Promise((w) => setTimeout(w, 25));
    }
    // 2. idle: the whole process tree (the app and everything it started), from "ready" on
    const readyAt = performance.now();
    const until = readyAt + watchSeconds * 1000;
    while (performance.now() < until && exited === null) await new Promise((w) => setTimeout(w, 200));
    const samples = all.filter((s) => s.t >= readyAt);
    result.samples = samples.length;
    if (samples.length) {
      const mb = (b) => Math.round((b / 1048576) * 10) / 10;
      result.idleMb = mb(samples.reduce((s, x) => s + x.bytes, 0) / samples.length);
      result.peakMb = mb(Math.max(...samples.map((x) => x.bytes)));
      if (samples.length >= 2) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        result.idleCpu = Math.round(Math.max(0, ((b.cpuSec - a.cpuSec) / ((b.t - a.t) / 1000)) * 100) * 10) / 10;
      }
    } else if (exited !== null) result.error = `the app stopped while being watched (exit ${exited})`;
    else result.error = "could not read process memory on this system";
    return result;
  } finally {
    stopSampler();
    if (exited === null) killTree(child);
  }
}

export function judgeDesktop(m, budget, downloadBytes) {
  const problems = [];
  if (m.error) problems.push(m.error);
  if (m.readyMs !== null && m.readyMs > budget.startMs) problems.push(`takes ${m.readyMs} ms to be ready (budget ${budget.startMs} ms): show the first screen before loading anything heavy`);
  if (m.idleMb !== null && m.idleMb > budget.idleMb) problems.push(`uses ${m.idleMb} MB while idle (budget ${budget.idleMb} MB): release large buffers, load features on demand, check for a leak`);
  if (m.idleCpu !== null && m.idleCpu > budget.idleCpu) problems.push(`uses ${m.idleCpu}% of a processor while idle (budget ${budget.idleCpu}%): stop polling loops and timers when nothing is happening`);
  if (downloadBytes !== null && downloadBytes !== undefined && downloadBytes / 1048576 > budget.downloadMb) problems.push(`the download is ${Math.round(downloadBytes / 1048576)} MB (budget ${budget.downloadMb} MB): drop unused libraries and bundled tools`);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const root = resolve(get("--project", "."));
  const cmd = get("--cmd");
  if (!cmd) {
    console.log('Give the start command with --cmd "<command>" (and how to tell it is ready: --ready-text, --ready-port, --ready-file or --until-exit).');
    process.exit(64);
  }
  const profile = loadProfile(root);
  const base = BUDGETS[profile.kind] ?? BUDGETS.default;
  const budget = { ...base, ...(profile.budgets ?? {}) };
  for (const [flag, key] of [["--max-start-ms", "startMs"], ["--max-idle-mb", "idleMb"], ["--max-idle-cpu", "idleCpu"], ["--max-download-mb", "downloadMb"]]) if (a.includes(flag)) budget[key] = Number(get(flag));
  const m = await measure({ cmd, cwd: root, readyText: get("--ready-text"), readyPort: a.includes("--ready-port") ? Number(get("--ready-port")) : null, readyFile: get("--ready-file") ? resolve(root, get("--ready-file")) : null, untilExit: a.includes("--until-exit"), watchSeconds: Number(get("--watch-seconds", 10)) });
  const downloadBytes = get("--build") ? sizeOf(resolve(root, get("--build"))) : null;
  const problems = judgeDesktop(m, budget, downloadBytes);
  console.log(`Ready in: ${m.readyMs ?? "?"} ms   idle memory: ${m.idleMb ?? "?"} MB (peak ${m.peakMb ?? "?"})   idle processor: ${m.idleCpu ?? "?"}%${downloadBytes !== null ? `   download: ${Math.round(downloadBytes / 1048576)} MB` : ""}`);
  console.log(problems.length ? problems.map((x) => `- ${x}`).join("\n") : "Within budget: starts fast, stays light.");
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "desktop-results.json"), JSON.stringify({ measuredAt: new Date().toISOString(), budget, ...m, downloadBytes, problems }, null, 2));
  process.exitCode = problems.length ? 1 : 0;
}
