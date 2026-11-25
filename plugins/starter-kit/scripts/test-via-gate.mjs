// Test helper: with KIT_VIA_GATE=1 the hook tests run each hook through the merged entry point (hooks/gate.mjs) instead of
// starting it alone, so the whole existing test suite proves that merging changed no decision. `hookPath(dir, "safety-guard.mjs")`
// returns the real script normally, or a tiny stub that runs only that hook through the gate.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MODE = {
  "safety-guard": "pre", "db-guard": "pre", "secret-guard": "pre", "push-gate": "pre", "package-guard": "pre", "file-guard": "pre",
  "verify-gate": "stop", "docs-gate": "stop", "test-related": "post", "session-start": "start", "auto-update": "start", "flight-recorder": "pre", "subagent-start": "subagent",
  "agent-route": "pre", "scout-check": "substop",
};

export function hookPath(hooksDir, file) {
  if (!process.env.KIT_VIA_GATE) return join(hooksDir, file);
  const name = file.replace(/\.mjs$/, "");
  const dir = join(tmpdir(), "kit-via-gate");
  mkdirSync(dir, { recursive: true });
  const stub = join(dir, `${name}.${process.pid}.mjs`);
  const gate = pathToFileURL(join(hooksDir, "gate.mjs")).href;
  writeFileSync(stub, `import { main } from ${JSON.stringify(gate)};\nawait main(${JSON.stringify(MODE[name])}, [${JSON.stringify(name)}]);\n`);
  return stub;
}
