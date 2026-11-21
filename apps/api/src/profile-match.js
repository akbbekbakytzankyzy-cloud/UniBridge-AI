// Finds profile values in the teacher's own imported files (OneDrive, page
// imports) by matching field labels — no AI model, so the result is exact and
// repeatable. Works for "Label: value" lines, two-column rows
// ("Label<TAB>value", the usual HR spreadsheet) and a header row followed by
// one data row. Every value is validated against the profile field rules.

const LABELS = {
  name_cyrillic: ["фио", "ф.и.о.", "ф.и.о", "аты-жөні", "аты жөні", "full name (cyrillic)", "фамилия имя отчество", "фамилия, имя, отчество"],
  name_latin: ["full name (latin)", "full name", "фио латиницей", "фио (латиница)", "name in latin", "name (latin)", "латиница"],
  phone: ["телефон", "тел.", "тел", "phone", "mobile", "мобильный телефон", "контактный телефон", "ұялы телефон"],
  department: ["кафедра", "department", "подразделение", "структурное подразделение", "школа", "school", "факультет", "faculty", "бөлім"],
  position: ["должность", "position", "job title", "лауазымы", "занимаемая должность"],
  employment_fraction: ["ставка", "доля ставки", "employment fraction", "fte", "объем ставки", "мөлшерлеме"],
  hire_date: ["дата приема", "дата приёма", "дата приема на работу", "дата приёма на работу", "employment start date", "hire date", "start date", "жұмысқа қабылданған күні"],
  degree: ["ученая степень", "учёная степень", "academic degree", "degree", "ғылыми дәреже", "степень"],
  degree_field: ["отрасль науки", "специальность степени", "degree field", "field of degree", "шифр специальности", "ғылым саласы"],
  academic_title: ["ученое звание", "учёное звание", "academic title", "ғылыми атақ", "звание"],
  orcid: ["orcid", "orcid id"],
  openalex_id: ["openalex", "openalex id", "openalex author id"],
};

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[*:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const lookup = new Map();
for (const [field, labels] of Object.entries(LABELS))
  for (const label of labels) lookup.set(norm(label), field);

function fieldForLabel(label) {
  const key = norm(label);
  if (!key || key.length > 60) return null;
  if (lookup.has(key)) return lookup.get(key);
  // "Ученая степень (если есть)" → strip a bracketed note.
  const bare = key.replace(/\s*\(.*\)\s*$/, "").trim();
  return lookup.get(bare) || null;
}

// Returns the value in the profile's storage format, or null if it is not valid.
export function normalizeValue(field, raw) {
  let v = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!v || v === "-" || v === "—" || /^(нет|жоқ|none|n\/a)$/i.test(v)) return null;
  if (field === "orcid") {
    const m = v.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i);
    return m ? m[0].toUpperCase() : null;
  }
  if (field === "openalex_id") {
    const m = v.match(/\bA\d{5,}\b/);
    return m ? m[0] : null;
  }
  if (field === "employment_fraction") {
    const m = v.replace(",", ".").match(/\d+(\.\d+)?/);
    if (!m) return null;
    let n = Number(m[0]);
    if (n > 2 && n <= 100 && /%/.test(v)) n = n / 100;
    return n >= 0.01 && n <= 2 ? Math.round(n * 100) / 100 : null;
  }
  if (field === "hire_date") {
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return isoDate(m[1], m[2], m[3]);
    m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); // day first, as written in Kazakhstan
    if (m) return isoDate(m[3], m[2], m[1]);
    return null;
  }
  return v.length <= 300 ? v : null;
}
function isoDate(y, m, d) {
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

// text → [{ field, value, label }]; the first valid value per field wins.
export function matchProfileFields(text) {
  const found = new Map();
  const add = (field, raw, label) => {
    if (!field || found.has(field)) return;
    const value = normalizeValue(field, raw);
    if (value !== null) found.set(field, { field, value, label: String(label).trim() });
  };
  const lines = String(text).split(/\r?\n/);
  const rows = lines.map((l) => (l.includes("\t") ? l.split("\t") : l.includes(";") ? l.split(";") : l.split(",")));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "Label: value"
    const colon = line.match(/^\s*([^:\t]{2,60}):\s*(.+)$/);
    if (colon) add(fieldForLabel(colon[1]), colon[2], colon[1]);
    const cells = rows[i].map((c) => c.trim());
    // "Label<TAB>value" (two-column sheet)
    if (cells.length >= 2 && fieldForLabel(cells[0]))
      add(fieldForLabel(cells[0]), cells.slice(1).find((c) => c) || "", cells[0]);
    // Header row + next row of values
    const headerFields = cells.map(fieldForLabel);
    if (headerFields.filter(Boolean).length >= 2 && rows[i + 1]) {
      const values = rows[i + 1].map((c) => c.trim());
      headerFields.forEach((f, j) => f && add(f, values[j], cells[j]));
    }
  }
  // An ORCID iD anywhere in the text is unambiguous.
  if (!found.has("orcid")) {
    const m = String(text).match(/\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/i);
    if (m) add("orcid", m[0], "ORCID iD in text");
  }
  return [...found.values()];
}

export const MATCHABLE_FIELDS = Object.keys(LABELS);

// ---------- tables: education, training, awards, publications ----------
const TABLES = {
  education: {
    level: ["уровень", "уровень образования", "степень образования", "образование", "degree level", "level", "квалификация", "академическая степень", "білім деңгейі"],
    institution: ["учебное заведение", "вуз", "университет", "наименование учебного заведения", "institution", "university", "оқу орны"],
    specialty: ["специальность", "направление", "specialty", "speciality", "major", "мамандық"],
    year: ["год окончания", "год выпуска", "graduation year", "year of graduation", "бітірген жылы"],
    diploma_number: ["номер диплома", "№ диплома", "диплом", "diploma number", "diploma no", "диплом нөмірі"],
  },
  training: {
    title: ["название программы", "наименование курса", "курс", "программа", "тема", "programme title", "program title", "course", "training", "курс атауы"],
    organization: ["организация", "организатор", "место прохождения", "organization", "organisation", "provider", "ұйым"],
    hours: ["часы", "кол-во часов", "количество часов", "объем часов", "hours", "сағат"],
    completed_at: ["дата окончания", "дата завершения", "дата", "completion date", "completed", "date", "аяқталған күні"],
    certificate_reference: ["сертификат", "номер сертификата", "№ сертификата", "certificate", "certificate number", "сертификат нөмірі"],
  },
  awards: {
    title: ["награда", "наименование награды", "название награды", "award", "award title", "марапат"],
    issuer: ["кем выдана", "кем награжден", "кем присуждена", "организация", "awarded by", "issuer", "кім берді"],
    year: ["год", "год награждения", "year", "жылы"],
    evidence_reference: ["документ", "номер документа", "подтверждение", "evidence", "evidence reference", "приказ"],
  },
  publications: {
    title: ["название", "название статьи", "наименование работы", "наименование", "title", "paper title", "мақала атауы", "тақырыбы"],
    year: ["год", "год публикации", "year", "publication year", "жылы"],
    doi: ["doi"],
    venue: ["журнал", "издание", "конференция", "журнал/конференция", "journal", "venue", "conference", "source", "журнал атауы"],
    authors: ["авторы", "соавторы", "authors", "co-authors", "авторлар"],
  },
};
const REQUIRED = {
  education: ["institution"],
  training: ["title"],
  awards: ["title"],
  publications: ["title"],
};
// Columns that only appear in one table type decide ties.
const DISTINCT = {
  education: ["institution", "diploma_number", "level"],
  training: ["hours", "certificate_reference", "organization"],
  awards: ["issuer", "evidence_reference"],
  publications: ["doi", "venue", "authors"],
};
const tableLookup = Object.fromEntries(
  Object.entries(TABLES).map(([t, cols]) => {
    const m = new Map();
    for (const [col, names] of Object.entries(cols)) for (const n of names) m.set(norm(n), col);
    return [t, m];
  }),
);
const colFor = (table, label) => {
  const key = norm(label).replace(/^№\s*п\/п$/, "");
  return tableLookup[table].get(key) || tableLookup[table].get(key.replace(/\s*\(.*\)\s*$/, "")) || null;
};

function cellValue(table, col, raw) {
  const v = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!v || v === "-" || v === "—") return null;
  if (col === "year") {
    const m = v.match(/\b(18|19|20|21)\d{2}\b/);
    return m ? Number(m[0]) : null;
  }
  if (col === "hours") {
    const n = Number(v.replace(",", ".").match(/\d+(\.\d+)?/)?.[0]);
    return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : null;
  }
  if (col === "completed_at") return normalizeValue("hire_date", v);
  if (col === "doi") {
    const m = v.match(/10\.\d{4,9}\/\S+/i);
    return m ? m[0].replace(/[.,;]+$/, "").toLowerCase() : null;
  }
  return v.slice(0, table === "publications" && col === "authors" ? 2000 : table === "publications" && col === "title" ? 500 : 300);
}

const splitRow = (line) =>
  (line.includes("\t") ? line.split("\t") : line.includes(";") ? line.split(";") : line.split(",")).map((c) => c.trim());

// text → { education: [...], training: [...], awards: [...], publications: [...] }
export function matchTables(text) {
  const out = { education: [], training: [], awards: [], publications: [] };
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length < 2) continue;
    // Pick the table type whose columns match this header row best.
    let best = null;
    for (const table of Object.keys(TABLES)) {
      const cols = cells.map((c) => colFor(table, c));
      const hits = cols.filter(Boolean).length;
      if (hits < 2 || !REQUIRED[table].every((r) => cols.includes(r))) continue;
      const score = hits + cols.filter((c) => DISTINCT[table].includes(c)).length;
      if (!best || score > best.score) best = { table, cols, score };
    }
    if (!best) continue;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const row = splitRow(lines[j]);
      if (!row.some(Boolean) || lines[j].startsWith("## ")) break;
      const record = {};
      best.cols.forEach((col, k) => {
        if (!col || record[col] !== undefined) return;
        const v = cellValue(best.table, col, row[k]);
        if (v !== null) record[col] = v;
      });
      if (REQUIRED[best.table].every((r) => record[r])) out[best.table].push(record);
    }
    i = j - 1;
  }
  return out;
}
