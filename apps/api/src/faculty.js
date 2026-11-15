import { Router } from "express";
import { readFileSync } from "node:fs";
import { z } from "zod";
export const profileSchema = JSON.parse(
  readFileSync(
    new URL("../../../schema/profile_schema.json", import.meta.url),
    "utf8",
  ),
);
function fieldValidator(field) {
  let rule;
  if (field.type === "number" || field.type === "year") {
    rule = z
      .number()
      .finite()
      .min(field.min ?? 1800)
      .max(field.max ?? 2200);
    if (field.type === "year") rule = rule.int();
  } else if (field.type === "date") rule = z.iso.date();
  else rule = z.string().trim().max(300);
  if (field.key === "orcid")
    rule = z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);
  if (field.key === "openalex_id") rule = z.string().regex(/^A\d+$/);
  if (field.required && field.type === undefined) rule = rule.min(1);
  return field.required ? rule : z.union([rule, z.literal("")]).optional();
}
const objectFor = (fields) =>
  z
    .object(Object.fromEntries(fields.map((f) => [f.key, fieldValidator(f)])))
    .strict();
const profileInput = z
  .object({
    revision: z.number().int().nonnegative(),
    details: objectFor(profileSchema.fields),
    ...Object.fromEntries(
      Object.entries(profileSchema.collections).map(([key, c]) => [
        key,
        z.array(objectFor(c.fields)).max(100),
      ]),
    ),
  })
  .strict();
const publicationInput = z
  .object({
    title: z.string().trim().min(1).max(500),
    year: z.number().int().min(1800).max(2200).nullable(),
    doi: z
      .string()
      .trim()
      .max(300)
      .refine(
        (v) => !v || /^10\.\d{4,9}\/\S+$/i.test(v),
        "Use a DOI such as 10.1234/example",
      )
      .transform((v) => v.toLowerCase() || null),
    venue: z.string().trim().max(300),
    authors: z.string().trim().max(2000),
  })
  .strict();
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function snapshotCsv(snapshot) {
  const rows = [
    ["UniBridgeAI draft export", snapshot.template_id],
    ["Template version", snapshot.template_version],
    ["Account name", snapshot.name],
    ["Work email", snapshot.email],
  ];
  for (const [section, value] of Object.entries(snapshot.data)) {
    rows.push([], [section]);
    if (Array.isArray(value))
      for (const [i, item] of value.entries())
        for (const [key, v] of Object.entries(item)) rows.push([i + 1, key, v]);
    else for (const [key, v] of Object.entries(value)) rows.push([key, v]);
  }
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
export function facultyRouter(pool) {
  const router = Router();
  router.use((req, res, next) =>
    req.user.role === "teacher"
      ? next()
      : res.status(403).json({ error: "Faculty access required" }),
  );
  router.get("/schema", (req, res) => res.json(profileSchema));
  router.get("/profile", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT details,education,training,awards,revision,updated_at FROM faculty_profiles WHERE user_id=$1",
      [req.user.id],
    );
    res.json({
      profile: rows[0] || {
        details: {},
        education: [],
        training: [],
        awards: [],
        revision: 0,
      },
    });
  });
  router.put("/profile", async (req, res) => {
    const v = profileInput.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO faculty_profiles(user_id,details,education,training,awards)
      SELECT $1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb WHERE $6=0 OR EXISTS(SELECT 1 FROM faculty_profiles WHERE user_id=$1)
      ON CONFLICT(user_id) DO UPDATE SET details=EXCLUDED.details,education=EXCLUDED.education,training=EXCLUDED.training,awards=EXCLUDED.awards,revision=faculty_profiles.revision+1,updated_at=now()
      WHERE faculty_profiles.revision=$6 RETURNING details,education,training,awards,revision,updated_at`,
      [
        req.user.id,
        JSON.stringify(v.details),
        JSON.stringify(v.education),
        JSON.stringify(v.training),
        JSON.stringify(v.awards),
        v.revision,
      ],
    );
    if (!rows.length)
      return res
        .status(409)
        .json({
          error: "Profile changed in another session. Reload before saving.",
        });
    res.json({ profile: rows[0] });
  });
  router.get("/publications", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM publications WHERE owner_id=$1 ORDER BY year DESC NULLS LAST,created_at DESC",
      [req.user.id],
    );
    res.json({ publications: rows });
  });
  router.post("/publications", async (req, res) => {
    const v = publicationInput.parse(req.body);
    const { rows } = await pool.query(
      "INSERT INTO publications(owner_id,title,year,doi,venue,authors) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [req.user.id, v.title, v.year, v.doi, v.venue, v.authors],
    );
    res.status(201).json({ publication: rows[0] });
  });
  router.delete("/publications/:id", async (req, res) => {
    const { rows } = await pool.query(
      "DELETE FROM publications WHERE id=$1 AND owner_id=$2 RETURNING id",
      [z.uuid().parse(req.params.id), req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ error: "Publication not found" });
    res.status(204).end();
  });
  router.get("/exports", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,template_id,template_version,created_at FROM department_exports WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id],
    );
    res.json({ exports: rows });
  });
  router.post("/exports", async (req, res) => {
    const { template_id } = z
      .object({ template_id: z.enum(profileSchema.templates.map((t) => t.id)) })
      .strict()
      .parse(req.body);
    const template = profileSchema.templates.find((t) => t.id === template_id);
    const { rows } = await pool.query(
      `SELECT p.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('title',title,'year',year,'doi',doi,'venue',venue,'authors',authors,'source',source,'verification_status',verification_status) ORDER BY year DESC NULLS LAST,created_at) FROM publications WHERE owner_id=$1),'[]'::jsonb) AS publications FROM faculty_profiles p WHERE user_id=$1`,
      [req.user.id],
    );
    if (!rows.length)
      return res
        .status(409)
        .json({
          error: "Save your faculty profile before generating an export",
        });
    const snapshot = {
      template_id,
      template_version: template.version,
      name: req.user.name,
      email: req.user.email,
      profile_revision: rows[0].revision,
      data: Object.fromEntries(template.sections.map((s) => [s, rows[0][s]])),
    };
    const result = await pool.query(
      "INSERT INTO department_exports(owner_id,template_id,template_version,snapshot) VALUES($1,$2,$3,$4::jsonb) RETURNING id,template_id,template_version,created_at",
      [req.user.id, template_id, template.version, JSON.stringify(snapshot)],
    );
    res.status(201).json({ export: result.rows[0] });
  });
  router.get("/exports/:id/download", async (req, res) => {
    const format = z.enum(["json", "csv"]).parse(req.query.format || "csv");
    const id = z.uuid().parse(req.params.id);
    const { rows } = await pool.query(
      "SELECT snapshot FROM department_exports WHERE id=$1 AND owner_id=$2",
      [id, req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ error: "Export not found" });
    res.attachment(`unibridge-${id}.${format}`);
    if (format === "json") res.json(rows[0].snapshot);
    else res.type("text/csv").send(snapshotCsv(rows[0].snapshot));
  });
  return router;
}
