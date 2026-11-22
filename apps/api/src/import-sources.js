// Groups imported snapshots by where they came from, so the autofill dialog and
// the import history use the same names. Pure functions, no I/O.
export const IMPORT_SOURCE_LABELS = {
  du: "Digital University (DU)",
  mydu: "MyDU",
  lms: "AITU LMS",
  scopus: "Scopus",
  researchgate: "ResearchGate",
  linkedin: "LinkedIn",
  orcid: "ORCID page",
  onedrive: "OneDrive folder",
  other: "Other page",
};

export function sourceGroup(url, origin = "browser") {
  if (origin === "onedrive") return "onedrive";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "other";
  }
  if (host === "my-du.astanait.edu.kz") return "mydu";
  if (host === "du.astanait.edu.kz") return "du";
  if (host === "lms.astanait.edu.kz") return "lms";
  if (host.endsWith("scopus.com")) return "scopus";
  if (host.endsWith("researchgate.net")) return "researchgate";
  if (host.endsWith("linkedin.com")) return "linkedin";
  if (host === "orcid.org") return "orcid";
  return "other";
}

// Short name used in the history table and the export file name.
export const sourceLabel = (group) => IMPORT_SOURCE_LABELS[group] || IMPORT_SOURCE_LABELS.other;
