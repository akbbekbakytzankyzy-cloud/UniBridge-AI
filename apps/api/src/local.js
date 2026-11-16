// Development preview only. The deployed database remains PostgreSQL via pg.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "./migrations.js";
import { createApp } from "./app.js";
import { hashPassword, newToken } from "./security.js";
import { backupLocalDatabase } from "./local-backup.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Embedded preview is disabled in production");
const data = new URL("../../../data/", import.meta.url);
await mkdir(data, { recursive: true });
// Reserve the API port BEFORE opening PGlite: two processes must never open it.
let app;
const server = createServer((req, res) => {
  if (app) return app(req, res);
  res.writeHead(503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Local database is starting" }));
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(3001, "127.0.0.1", resolve);
});
let db;
try {
  const config = JSON.parse(
    await readFile(new URL("local-preview.json", data), "utf8").catch(
      (error) => {
        if (error.code === "ENOENT") return "{}";
        throw error;
      },
    ),
  );
  const directory = config.directory || "local-preview";
  if (!/^[a-zA-Z0-9_-]+$/.test(directory))
    throw new Error("Invalid local database directory");
  console.log(`Local database: data/${directory}`);
  db = new PGlite(fileURLToPath(new URL(`${directory}/`, data)), {
    extensions: { vector },
  });
  await applyMigrations(db);
  const credentials = [];
  for (const role of ["teacher", "student"]) {
    const email = `${role}@local.unibridge.test`;
    if (
      (await db.query("SELECT id FROM users WHERE email=$1", [email])).rows
        .length
    )
      continue;
    const password = newToken().slice(0, 24);
    await db.query(
      "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4)",
      [email, `Local ${role}`, role, await hashPassword(password)],
    );
    credentials.push(`${role}: ${email}\nPassword: ${password}`);
  }
  if (credentials.length)
    await writeFile(
      new URL("local-access.txt", data),
      credentials.join("\n\n") + "\n",
    );
  // Save a consistent restore point before serving requests on each startup.
  await backupLocalDatabase(db, new URL(`backups/${directory}/`, data));
  console.log("Local database snapshot saved under data/backups.");
  app = await createApp(db);
  console.log(
    "Local embedded PostgreSQL preview on port 3001. Credentials: data/local-access.txt. This is not the Docker service.",
  );
} catch (error) {
  server.close();
  console.error(
    "Local preview startup failed. Existing database files were not replaced.",
    error.message,
  );
  process.exit(1);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
