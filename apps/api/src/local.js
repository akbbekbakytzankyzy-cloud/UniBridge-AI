// Development preview only. The deployed database remains PostgreSQL via pg.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "./migrations.js";
import { createApp } from "./app.js";
import { hashPassword, newToken } from "./security.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Embedded preview is disabled in production");
const data = new URL("../../../data/", import.meta.url);
await mkdir(data, { recursive: true });
const db = new PGlite(fileURLToPath(new URL("local-preview/", data)), {
  extensions: { vector },
});
await applyMigrations(db);
const credentials = [];
for (const role of ["teacher", "student"]) {
  const email = `${role}@local.unibridge.test`;
  if (
    (await db.query("SELECT id FROM users WHERE email=$1", [email])).rows.length
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
const app = await createApp(db);
const server = app.listen(3001, "127.0.0.1", () =>
  console.log(
    "Local embedded PostgreSQL preview on port 3001. Credentials: data/local-access.txt. This is not the Docker service.",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
