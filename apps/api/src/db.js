import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required. Copy .env.example to .env.");
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
