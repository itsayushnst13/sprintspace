import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sourceRoot = resolve("src");
const files = [];

function collectJavaScript(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScript(fullPath);
    else if (entry.isFile() && fullPath.endsWith(".js")) files.push(fullPath);
  }
}

collectJavaScript(sourceRoot);
if (files.length === 0) {
  console.error("No JavaScript source files were found under backend/src.");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.info(`Checked ${files.length} JavaScript source files successfully.`);
