// Prepares everything the desktop installer bundles next to the Tauri shell:
//   src-tauri/resources/server/  API source, migrations, schema, built web UI,
//                                production node_modules
//   src-tauri/binaries/node-<target-triple>[.exe]  the Node.js runtime
// Run after `npm ci` and `npm run build`. Nothing here is committed.
import { cp, mkdir, readFile, rm, writeFile, copyFile, chmod } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const tauri = new URL("apps/web/src-tauri/", root);
const server = new URL("resources/server/", tauri);
const at = (base, path) => new URL(path, base);

if (!existsSync(at(root, "apps/web/dist/index.html")))
  throw new Error("Run `npm run build` first: apps/web/dist is missing.");

await rm(server, { recursive: true, force: true });
await mkdir(at(server, "apps/api/"), { recursive: true });
for (const dir of ["src", "migrations"])
  await cp(at(root, `apps/api/${dir}/`), at(server, `apps/api/${dir}/`), { recursive: true });
await cp(at(root, "schema/"), at(server, "schema/"), { recursive: true });
await cp(at(root, "apps/web/dist/"), at(server, "web/"), { recursive: true });

// Pin the exact versions already installed and tested in this checkout.
const api = JSON.parse(await readFile(at(root, "apps/api/package.json"), "utf8"));
const wanted = [
  ...Object.keys(api.dependencies),
  "@electric-sql/pglite",
  "@electric-sql/pglite-pgvector",
];
const dependencies = {};
for (const name of wanted) {
  const pkg = JSON.parse(await readFile(at(root, `node_modules/${name}/package.json`), "utf8"));
  dependencies[name] = pkg.version;
}
await writeFile(
  at(server, "package.json"),
  JSON.stringify({ name: "unibridge-desktop-server", private: true, type: "module", dependencies }, null, 2),
);
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["install", "--omit=dev", "--no-audit", "--no-fund", "--ignore-scripts"],
  { cwd: server, stdio: "inherit", shell: process.platform === "win32" },
);

// The Node runtime that runs this script is the one bundled (same version CI tested).
const triple =
  process.env.TAURI_TARGET_TRIPLE ||
  execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/host: (\S+)/)[1];
const ext = process.platform === "win32" ? ".exe" : "";
await mkdir(at(tauri, "binaries/"), { recursive: true });
const target = at(tauri, `binaries/node-${triple}${ext}`);
await copyFile(process.execPath, target);
await chmod(target, 0o755);
console.log(`Staged server and Node ${process.version} for ${triple}.`);
