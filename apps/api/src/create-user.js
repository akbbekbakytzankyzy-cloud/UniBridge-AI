import { pool } from "./db.js";
import { hashPassword } from "./security.js";
import { z } from "zod";
const [email, name, role] = process.argv.slice(2);
const input = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    name: z.string().min(1).max(120),
    role: z.enum(["teacher", "student"]),
    password: z.string().min(12).max(128),
  })
  .parse({ email, name, role, password: process.env.UB_INITIAL_PASSWORD });
try {
  await pool.query(
    "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4)",
    [input.email, input.name, input.role, await hashPassword(input.password)],
  );
  console.log("Account created. Clear UB_INITIAL_PASSWORD from your shell.");
} finally {
  await pool.end();
}
