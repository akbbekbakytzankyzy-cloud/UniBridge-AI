// Automatic import of a teacher's own files from Microsoft OneDrive.
//
// Flow: the teacher signs in with Microsoft (OAuth 2.0 authorization code +
// PKCE, delegated scopes Files.Read/User.Read) and picks one folder. A sync —
// on demand or every few minutes — lists that folder through Microsoft Graph,
// converts new or changed files to text and adds them to the existing review
// queue (browser_imports, origin 'onedrive'). From there the existing
// extraction → drafts → confirm flow applies, so nothing becomes a record
// without the teacher's confirmation.
import { Router } from "express";
import { z } from "zod";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { newToken, tokenHash } from "./security.js";

const SCOPES = "offline_access User.Read Files.Read";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_SYNC = 100;
const MAX_TEXT = 30000;
export const SUPPORTED_EXTENSIONS = [".xlsx", ".csv", ".docx", ".txt", ".md"];

export function onedriveConfig(env = process.env, overrides = {}) {
  return {
    clientId: env.MS_CLIENT_ID || "",
    clientSecret: env.MS_CLIENT_SECRET || "",
    tenant: env.MS_TENANT || "organizations",
    redirectUri: env.MS_REDIRECT_URI || "",
    authority: "https://login.microsoftonline.com",
    graph: "https://graph.microsoft.com/v1.0",
    fetch: globalThis.fetch,
    secretKey: env.UB_SECRET_KEY || "",
    ...overrides,
  };
}

// ---------- refresh token encryption (AES-256-GCM) ----------
function key(cfg) {
  if (!cfg.secretKey) throw new Error("UB_SECRET_KEY is not configured");
  return createHash("sha256").update(String(cfg.secretKey)).digest();
}
export function encrypt(cfg, text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(cfg), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
export function decrypt(cfg, value) {
  const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(cfg), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ---------- file → text ----------
export async function fileToText(name, buffer) {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if ([".csv", ".txt", ".md"].includes(ext)) return buffer.toString("utf8");
  if (ext === ".docx") {
    const mammoth = (await import("mammoth")).default;
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (ext === ".xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const lines = [];
    book.eachSheet((sheet) => {
      lines.push(`## Sheet: ${sheet.name}`);
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells = row.values
          .slice(1)
          .map((v) => {
            if (v === null || v === undefined) return "";
            if (v instanceof Date) return v.toISOString().slice(0, 10);
            if (typeof v === "object")
              return v.text ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join("") : "");
            return String(v);
          })
          .map((s) => String(s).replace(/[\t\r\n]+/g, " ").trim());
        lines.push(cells.join("\t"));
      });
    });
    return lines.join("\n");
  }
  throw new Error("Unsupported file type");
}

// ---------- Microsoft identity + Graph ----------
async function tokenRequest(cfg, params) {
  const body = new URLSearchParams({ client_id: cfg.clientId, scope: SCOPES, ...params });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  const response = await cfg.fetch(
    `${cfg.authority}/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token)
    throw new Error(
      data.error === "invalid_grant"
        ? "Microsoft sign-in expired. Connect OneDrive again."
        : "Microsoft did not accept the sign-in",
    );
  return data;
}

async function accessFor(pool, cfg, userId) {
  const { rows } = await pool.query(
    "SELECT refresh_token_enc FROM onedrive_connections WHERE user_id=$1",
    [userId],
  );
  if (!rows[0]) throw Object.assign(new Error("OneDrive is not connected"), { status: 404 });
  let refresh;
  try {
    refresh = decrypt(cfg, rows[0].refresh_token_enc);
  } catch {
    throw new Error("Stored Microsoft sign-in can no longer be read. Connect OneDrive again.");
  }
  const t = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refresh });
  if (t.refresh_token && t.refresh_token !== refresh)
    await pool.query("UPDATE onedrive_connections SET refresh_token_enc=$2 WHERE user_id=$1", [
      userId,
      encrypt(cfg, t.refresh_token),
    ]);
  return t.access_token;
}

async function graph(cfg, accessToken, path, { raw = false } = {}) {
  const url = path.startsWith("https://") ? path : cfg.graph + path;
  // Only Microsoft Graph URLs (including its own nextLink pages) are followed.
  if (!url.startsWith(cfg.graph + "/")) throw new Error("Unexpected Microsoft Graph address");
  const response = await cfg.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const error = new Error(
      response.status === 403
        ? "Microsoft refused access to this OneDrive item"
        : response.status === 404
          ? "The OneDrive folder no longer exists. Choose another folder."
          : "Microsoft Graph request failed",
    );
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
}

async function listFolder(cfg, accessToken, folderId) {
  const items = [];
  let next = `/me/drive/items/${encodeURIComponent(folderId)}/children?$top=200&$select=id,name,size,eTag,file,folder,webUrl,lastModifiedDateTime`;
  while (next && items.length < 1000) {
    const page = await graph(cfg, accessToken, next);
    items.push(...(page.value || []));
    next = page["@odata.nextLink"] || null;
  }
  return items;
}

const supported = (name) =>
  SUPPORTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

// Imports new or changed files from the chosen folder (and one level of subfolders).
export async function syncUser(pool, cfg, userId) {
  const { rows } = await pool.query(
    "SELECT folder_id FROM onedrive_connections WHERE user_id=$1",
    [userId],
  );
  if (!rows[0]?.folder_id) throw Object.assign(new Error("Choose a OneDrive folder first"), { status: 400 });
  const summary = { imported: 0, updated: 0, unchanged: 0, skipped: [] };
  try {
    const access = await accessFor(pool, cfg, userId);
    const top = await listFolder(cfg, access, rows[0].folder_id);
    const files = top.filter((i) => i.file);
    for (const sub of top.filter((i) => i.folder).slice(0, 20))
      files.push(...(await listFolder(cfg, access, sub.id)).filter((i) => i.file));
    for (const item of files.slice(0, MAX_FILES_PER_SYNC)) {
      if (!supported(item.name)) {
        summary.skipped.push({ name: item.name, reason: "unsupported type" });
        continue;
      }
      if (item.size > MAX_FILE_BYTES) {
        summary.skipped.push({ name: item.name, reason: "larger than 5 MB" });
        continue;
      }
      const known = (
        await pool.query("SELECT etag,import_id FROM onedrive_files WHERE user_id=$1 AND item_id=$2", [
          userId,
          item.id,
        ])
      ).rows[0];
      if (known?.etag === item.eTag) {
        summary.unchanged++;
        continue;
      }
      let text;
      try {
        const content = await graph(cfg, access, `/me/drive/items/${encodeURIComponent(item.id)}/content`, { raw: true });
        text = (await fileToText(item.name, content)).trim();
      } catch {
        summary.skipped.push({ name: item.name, reason: "could not be read" });
        continue;
      }
      if (!text) {
        summary.skipped.push({ name: item.name, reason: "no text found" });
        continue;
      }
      // A changed file replaces its earlier, still-unreviewed import; reviewed
      // imports and confirmed records are left as they are.
      if (known?.import_id)
        await pool.query(
          "DELETE FROM browser_imports WHERE id=$1 AND user_id=$2 AND status='pending'",
          [known.import_id, userId],
        );
      const imported = await pool.query(
        `INSERT INTO browser_imports(user_id,source_url,content,origin,title)
         VALUES($1,$2,$3,'onedrive',$4) RETURNING id`,
        [userId, String(item.webUrl || "").slice(0, 2000), text.slice(0, MAX_TEXT), item.name.slice(0, 255)],
      );
      await pool.query(
        `INSERT INTO onedrive_files(user_id,item_id,etag,name,import_id) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(user_id,item_id) DO UPDATE SET etag=EXCLUDED.etag,name=EXCLUDED.name,import_id=EXCLUDED.import_id,synced_at=now()`,
        [userId, item.id, item.eTag, item.name.slice(0, 255), imported.rows[0].id],
      );
      if (known) summary.updated++;
      else summary.imported++;
    }
    await pool.query(
      "UPDATE onedrive_connections SET last_sync_at=now(), last_error='' WHERE user_id=$1",
      [userId],
    );
    return summary;
  } catch (error) {
    await pool.query("UPDATE onedrive_connections SET last_error=$2 WHERE user_id=$1", [
      userId,
      String(error.message).slice(0, 300),
    ]);
    throw error;
  }
}

export async function syncAll(pool, cfg) {
  const { rows } = await pool.query(
    "SELECT user_id FROM onedrive_connections WHERE folder_id IS NOT NULL",
  );
  for (const { user_id } of rows) await syncUser(pool, cfg, user_id).catch(() => {});
}

const configured = (cfg) => Boolean(cfg.clientId && cfg.secretKey && cfg.redirectUri);
const pkce = (verifier) => createHash("sha256").update(verifier).digest("base64url");

// Public: Microsoft redirects the browser here after sign-in. The session cookie
// is SameSite=Strict and is not sent on this cross-site redirect, so the user is
// identified by the single-use OAuth state instead.
export function onedriveCallbackRouter(pool, cfg) {
  const router = Router();
  router.get("/", async (req, res) => {
    const done = (status) => res.redirect(302, `/?onedrive=${status}`);
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!/^[a-f0-9]{64}$/.test(state)) return done("error");
    const { rows } = await pool.query(
      "DELETE FROM onedrive_auth_states WHERE state_hash=$1 AND expires_at>now() RETURNING user_id,code_verifier",
      [tokenHash(state)],
    );
    if (!rows[0] || !code) return done(req.query.error === "access_denied" ? "denied" : "error");
    try {
      const t = await tokenRequest(cfg, {
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.redirectUri,
        code_verifier: rows[0].code_verifier,
      });
      if (!t.refresh_token) return done("error");
      let name = "";
      try {
        const me = await graph(cfg, t.access_token, "/me?$select=displayName,userPrincipalName");
        name = String(me.userPrincipalName || me.displayName || "").slice(0, 254);
      } catch {
        /* the account name is only shown for orientation */
      }
      await pool.query(
        `INSERT INTO onedrive_connections(user_id,account_name,refresh_token_enc) VALUES($1,$2,$3)
         ON CONFLICT(user_id) DO UPDATE SET account_name=EXCLUDED.account_name, refresh_token_enc=EXCLUDED.refresh_token_enc, last_error=''`,
        [rows[0].user_id, name, encrypt(cfg, t.refresh_token)],
      );
      done("connected");
    } catch {
      done("error");
    }
  });
  return router;
}

export function onedriveRouter(pool, cfg) {
  const router = Router();
  router.use((req, res, next) =>
    req.user.role === "teacher"
      ? next()
      : res.status(403).json({ error: "Teacher access required" }),
  );

  router.get("/status", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT account_name,folder_id,folder_path,last_sync_at,last_error,
        (SELECT count(*)::int FROM onedrive_files f WHERE f.user_id=c.user_id) AS files
       FROM onedrive_connections c WHERE user_id=$1`,
      [req.user.id],
    );
    res.json({
      configured: configured(cfg),
      connected: Boolean(rows[0]),
      connection: rows[0] || null,
      supported: SUPPORTED_EXTENSIONS,
    });
  });

  router.post("/connect", async (req, res) => {
    if (!configured(cfg))
      return res.status(503).json({ error: "OneDrive is not configured on this server. See docs/ONEDRIVE.md." });
    const state = newToken();
    const verifier = randomBytes(32).toString("base64url");
    await pool.query("DELETE FROM onedrive_auth_states WHERE user_id=$1 OR expires_at<now()", [req.user.id]);
    await pool.query(
      "INSERT INTO onedrive_auth_states(state_hash,user_id,code_verifier,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [tokenHash(state), req.user.id, verifier],
    );
    const url = new URL(`${cfg.authority}/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: "code",
      redirect_uri: cfg.redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
      code_challenge: pkce(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    res.json({ url: url.toString() });
  });

  router.get("/folders", async (req, res) => {
    const parent = z.string().max(200).regex(/^[A-Za-z0-9!._-]*$/).parse(req.query.parent || "");
    let items;
    try {
      items = await listFolder(cfg, await accessFor(pool, cfg, req.user.id), parent || "root");
    } catch (error) {
      return res.status(error.status || 502).json({ error: error.message });
    }
    res.json({
      folders: items
        .filter((i) => i.folder)
        .map((i) => ({ id: i.id, name: i.name, children: i.folder.childCount ?? 0 })),
      files: items.filter((i) => i.file).length,
    });
  });

  router.put("/folder", async (req, res) => {
    const v = z
      .object({ id: z.string().min(1).max(200).regex(/^[A-Za-z0-9!._-]+$/), path: z.string().trim().max(500) })
      .strict()
      .parse(req.body);
    const { rowCount } = await pool.query(
      "UPDATE onedrive_connections SET folder_id=$2, folder_path=$3 WHERE user_id=$1",
      [req.user.id, v.id, v.path],
    );
    if (!rowCount) return res.status(404).json({ error: "OneDrive is not connected" });
    // A different folder starts a fresh file history.
    await pool.query("DELETE FROM onedrive_files WHERE user_id=$1", [req.user.id]);
    res.json({ folder_id: v.id, folder_path: v.path });
  });

  router.post("/sync", async (req, res) => {
    try {
      res.json(await syncUser(pool, cfg, req.user.id));
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message });
    }
  });

  router.delete("/", async (req, res) => {
    // Imported review items stay; only the connection and file history are removed.
    await pool.query("DELETE FROM onedrive_files WHERE user_id=$1", [req.user.id]);
    await pool.query("DELETE FROM onedrive_connections WHERE user_id=$1", [req.user.id]);
    res.status(204).end();
  });

  return router;
}
