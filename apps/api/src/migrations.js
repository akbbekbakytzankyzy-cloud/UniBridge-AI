import { readdir, readFile } from "node:fs/promises";
export async function applyMigrations(client) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(17012026)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    const directory = new URL("../migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort()) {
      const version = file.split("_")[0];
      const { rows } = await client.query(
        "SELECT version FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (rows.length) continue;
      const sql = await readFile(new URL(file, directory), "utf8");
      // PGlite uses exec for multi-statement SQL; pg uses query.
      if (client.exec) await client.exec(sql);
      else await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        version,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
