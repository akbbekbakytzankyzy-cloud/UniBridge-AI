// Sets the desktop version from a release tag such as v0.2.0.
import { readFile, writeFile } from "node:fs/promises";
const version = (process.argv[2] || "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Usage: set-version.mjs v1.2.3");
const conf = new URL("../apps/web/src-tauri/tauri.conf.json", import.meta.url);
const cargo = new URL("../apps/web/src-tauri/Cargo.toml", import.meta.url);
const json = JSON.parse(await readFile(conf, "utf8"));
json.version = version;
await writeFile(conf, JSON.stringify(json, null, 2) + "\n");
await writeFile(cargo, (await readFile(cargo, "utf8")).replace(/^version = ".*"$/m, `version = "${version}"`));
console.log("Desktop version set to " + version);
