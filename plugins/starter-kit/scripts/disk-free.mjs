// Is there enough free disk space for what's about to be installed?
//   node disk-free.mjs --path <folder> --need-mb <megabytes>
//
// Browser test tooling and dependency folders can run to hundreds of megabytes; installing onto a full drive fails halfway
// and can leave tools half-installed. Check first. Exit 0 = enough, 1 = not enough (the message says how much is free).
import { statfsSync } from "node:fs";
import { basename, resolve } from "node:path";

export function freeMb(path) {
  const s = statfsSync(resolve(path));
  return Math.floor((Number(s.bavail) * Number(s.bsize)) / (1024 * 1024));
}

if (process.argv[1] && basename(process.argv[1]) === "disk-free.mjs") {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : d;
  };
  const path = arg("--path", ".");
  const need = Number(arg("--need-mb", 500));
  let free;
  try {
    free = freeMb(path);
  } catch (e) {
    console.log(`Could not check free space at ${path} (${e.code ?? e.message}).`);
    process.exit(2);
  }
  if (free >= need * 2) console.log(`OK: ${free} MB free at ${path}, need about ${need} MB.`);
  else if (free >= need) console.log(`TIGHT: ${free} MB free at ${path}, need about ${need} MB. It would fit, but leave no room to spare; consider another drive.`);
  else {
    console.log(`NOT ENOUGH: ${free} MB free at ${path}, need about ${need} MB. Free up space or install to another drive.`);
    process.exitCode = 1;
  }
}
