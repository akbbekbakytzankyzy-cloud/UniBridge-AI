import { Router } from "express";
import { z } from "zod";

const providers = [
  { id: "du", name: "Digital University", url: "https://du.astanait.edu.kz/" },
  { id: "lms", name: "AITU LMS", url: "https://lms.astanait.edu.kz/" },
  { id: "mydu", name: "MyDU", url: "https://my-du.astanait.edu.kz/" },
];
const provider = z.enum(["du", "lms", "mydu"]);

// Login hints are user declarations, never proof of ownership or API access.
export function universityAccountsRouter(pool) {
  const router = Router();
  router.get("/", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT provider,login_hint,status,updated_at FROM university_accounts WHERE user_id=$1 ORDER BY provider",
      [req.user.id],
    );
    res.json({ providers, accounts: rows, connectionAvailable: false });
  });
  router.put("/:provider", async (req, res) => {
    const id = provider.parse(req.params.provider);
    const input = z
      .object({ loginHint: z.string().trim().min(1).max(254) })
      .strict()
      .parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO university_accounts(user_id,provider,login_hint) VALUES($1,$2,$3)
       ON CONFLICT(user_id,provider) DO UPDATE SET login_hint=excluded.login_hint,updated_at=now()
       RETURNING provider,login_hint,status,updated_at`,
      [req.user.id, id, input.loginHint],
    );
    res.json({ account: rows[0] });
  });
  router.delete("/:provider", async (req, res) => {
    await pool.query(
      "DELETE FROM university_accounts WHERE user_id=$1 AND provider=$2",
      [req.user.id, provider.parse(req.params.provider)],
    );
    res.status(204).end();
  });
  return router;
}
