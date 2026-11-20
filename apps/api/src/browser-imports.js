import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { newToken, tokenHash } from "./security.js";
import { timingSafeEqual } from "node:crypto";

const hosts = new Set([
  "du.astanait.edu.kz",
  "my-du.astanait.edu.kz",
  "lms.astanait.edu.kz",
  "www.linkedin.com",
  "linkedin.com",
  "www.scopus.com",
  "scopus.com",
  "www.researchgate.net",
  "researchgate.net",
  "orcid.org",
]);
export function cleanSource(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !hosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Unsupported source");
  return url.origin + url.pathname; // Never persist query tokens or fragments.
}

// The native bridge holds a process-only secret and accepts only expiring,
// single-use codes for page snapshots reviewed by the user.
export function browserCaptureRouter(pool, nativeCaptureToken = "") {
  const router = Router();
  router.post(
    "/native-capture",
    rateLimit({ windowMs: 60000, limit: 20 }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const presented = req.get("x-unibridge-capture") || "";
      const expected = Buffer.from(nativeCaptureToken);
      const candidate = Buffer.from(presented);
      if (
        !nativeCaptureToken ||
        candidate.length !== expected.length ||
        !timingSafeEqual(candidate, expected)
      )
        return res.status(403).json({ error: "Native capture is unavailable" });
      const input = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          sourceUrl: z.string().max(2000),
          content: z.string().trim().min(1).max(30000),
        })
        .strict()
        .parse(req.body);
      let source;
      try {
        source = cleanSource(input.sourceUrl);
      } catch {
        return res.status(400).json({ error: "Unsupported source" });
      }
      const { rows } = await pool.query(
        `WITH used AS (DELETE FROM browser_import_tokens WHERE token_hash=$1 AND expires_at>now() RETURNING user_id)
         INSERT INTO browser_imports(user_id,source_url,content) SELECT user_id,$2,$3 FROM used RETURNING id`,
        [tokenHash(input.token), source, input.content],
      );
      if (!rows.length)
        return res
          .status(401)
          .json({ error: "Import code expired. Generate a new one." });
      res.status(201).json({ status: "pending_review" });
    },
  );
  return router;
}

export function browserImportsRouter(pool) {
  const router = Router();
  router.post(
    "/code",
    rateLimit({ windowMs: 60000, limit: 5 }),
    async (req, res) => {
      await pool.query(
        "DELETE FROM browser_import_tokens WHERE user_id=$1 OR expires_at<now()",
        [req.user.id],
      );
      const token = newToken();
      await pool.query(
        "INSERT INTO browser_import_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
        [tokenHash(token), req.user.id],
      );
      res.json({ code: token, expiresInSeconds: 600 });
    },
  );
  router.get("/", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,source_url,content,status,created_at FROM browser_imports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id],
    );
    res.json({ imports: rows });
  });
  router.post("/:id/accept", async (req, res) => {
    const { rows } = await pool.query(
      "UPDATE browser_imports SET status='accepted' WHERE id=$1 AND user_id=$2 RETURNING id",
      [z.uuid().parse(req.params.id), req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ error: "Import not found" });
    res.json({ status: "accepted" });
  });
  router.delete("/:id", async (req, res) => {
    await pool.query("DELETE FROM browser_imports WHERE id=$1 AND user_id=$2", [
      z.uuid().parse(req.params.id),
      req.user.id,
    ]);
    res.status(204).end();
  });
  return router;
}
