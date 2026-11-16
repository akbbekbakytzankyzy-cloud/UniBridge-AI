// Resets passwords of accounts in the LOCAL embedded preview database.
// Usage (stop `npm run dev:local` first):
//   npm run local:reset-password                      -> both local accounts
//   npm run local:reset-password -- someone@example   -> one account
// New passwords are printed and written to data/local-access.txt.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashPassword, newToken } from "./security.js";

const data = process.env.UB_DATA_DIR
  ? pathToFileURL(process.env.UB_DATA_DIR.replace(/[\\/]*$/, "/"))
  : new URL("../../../data/", import.meta.url);
const port = Number(process.env.UB_PORT || 3001);

// The embedded database must never be opened by two processes at once.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () =>
    reject(
      new Error(
        `Port ${port} is in use. Stop the running UniBridgeAI preview (Ctrl+C) and try again.`,
      ),
    ),
  );
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
}).catch((e) => {
  console.error(e.message);
  process.exit(1);
});

const config = JSON.parse(
  await readFile(new URL("local-preview.json", data), "utf8").catch(() => "{}"),
);
const directory = config.directory || "local-preview";
if (!/^[a-zA-Z0-9_-]+$/.test(directory)) throw new Error("Invalid directory");
const dbPath = fileURLToPath(new URL(`${directory}/`, data));
const db = new PGlite(dbPath, { extensions: { vector } });
try {
  const wanted = process.argv.slice(2);
  const { rows } = wanted.length
    ? await db.query("SELECT id,email,role FROM users WHERE email = ANY($1)", [wanted])
    : await db.query(
        "SELECT id,email,role FROM users WHERE email LIKE '%@local.unibridge.test' ORDER BY role DESC",
      );
  if (!rows.length) {
    const all = await db.query("SELECT email,role FROM users ORDER BY email");
    console.error("No matching accounts. Accounts in this database:");
    for (const u of all.rows) console.error(`  ${u.role}: ${u.email}`);
    process.exitCode = 1;
  } else {
    const lines = [];
    for (const u of rows) {
      const password = newToken().slice(0, 24);
      await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        await hashPassword(password),
        u.id,
      ]);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
      lines.push(`${u.role}: ${u.email}\nPassword: ${password}`);
    }
    await writeFile(new URL("local-access.txt", data), lines.join("\n\n") + "\n");
    console.log(`Database: ${dbPath}\n\n${lines.join("\n\n")}\n`);
    console.log("Saved to data/local-access.txt. Start the app again with: npm run dev:local");
  }
} finally {
  await db.close();
}
