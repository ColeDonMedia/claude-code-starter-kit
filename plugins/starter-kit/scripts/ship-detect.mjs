// What a command line sends away from this computer, read with the guards' shared command reader (shell-lib.mjs), so a push on
// the second line, after `FOO=1`, `time` or `command`, inside `bash -c`, or as `git.exe` is still a push. Used by the push gate
// (nothing ships before the pre-ship scan) and the secret guard (nothing ships with a secret in it). Reads only.
import { commandsIn, gitSubcommand } from "./shell-lib.mjs";

const RUNNERS = new Set(["npx", "pnpx", "bunx"]); // `npx vercel --prod`: the tool is the first argument
const PKG = new Set(["npm", "pnpm", "yarn", "bun"]);

// { push, pr, gist, deploy, commit, commitAll, adds: [paths], broadAdd, gistFiles: [paths] } for a whole command line.
export function shipActions(command, ps = false) {
  const a = { push: false, pr: false, gist: false, deploy: false, commit: false, commitAll: false, adds: [], broadAdd: false, gistFiles: [] };
  if (typeof command !== "string") return a;
  for (let { cmd, args } of commandsIn(command, ps)) {
    if (RUNNERS.has(cmd) && args.length) [cmd, ...args] = [args[0].toLowerCase(), ...args.slice(1)];
    if (PKG.has(cmd) && ["dlx", "exec", "x"].includes(args[0]) && args[1]) [cmd, ...args] = [args[1].toLowerCase(), ...args.slice(2)];
    const dry = args.includes("--dry-run") || (cmd === "git" && args.includes("-n") && gitSubcommand(args).sub === "push");
    const has = (...w) => w.every((x, i) => args[i] === x);
    if (cmd === "git") {
      const { sub, rest } = gitSubcommand(args);
      if (sub === "push" && !dry) a.push = true;
      if (sub === "commit") {
        a.commit = true;
        if (rest.some((f) => f === "--all" || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(f))) a.commitAll = true;
      }
      if (sub === "add") {
        const plain = rest.filter((t) => !t.startsWith("-"));
        if (rest.some((t) => ["-A", "--all", "-u", "--update"].includes(t) || /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(t)) || plain.includes(".")) a.broadAdd = true;
        a.adds.push(...plain.filter((t) => t !== "."));
      }
    } else if (cmd === "gh") {
      if (has("pr", "create") || has("pr", "merge") || has("release", "create")) a.pr = true;
      if (has("repo", "create") && args.includes("--push")) a.push = true;
      if (has("gist", "create")) {
        a.gist = true;
        const VALUE = new Set(["-d", "--desc", "-f", "--filename"]);
        for (let i = 2; i < args.length; i++) {
          if (VALUE.has(args[i])) i++;
          else if (!args[i].startsWith("-")) a.gistFiles.push(args[i]);
        }
      }
    } else if (!dry) {
      const words = `${cmd} ${args.join(" ")}`;
      if (
        (PKG.has(cmd) && args[0] === "publish") ||
        /^(cargo publish|twine upload|gem push|dotnet nuget push|docker push|podman push|docker buildx build\b.*--push|(fly|flyctl) deploy|firebase deploy|wrangler (deploy|publish)|railway up|(heroku|render) (deploy|releases:create))/.test(words) ||
        ((cmd === "vercel" || (cmd === "netlify" && args[0] === "deploy")) && args.includes("--prod"))
      )
        a.deploy = true;
    }
  }
  return a;
}
