import { pool } from "./db.js";
import { applyMigrations } from "./migrations.js";
const client = await pool.connect();
try {
  await applyMigrations(client);
  console.log("Database schema is up to date.");
} finally {
  client.release();
  await pool.end();
}
