import React, { useState } from "react";
import { api } from "./api.js";
import { useI18n } from "./i18n.jsx";

// Proposes where each column of an uploaded export belongs. It saves nothing:
// the owner reviews the proposals and then fills the profile manually or with autofill.
export default function FieldMapping() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [provider, setProvider] = useState("local");
  const [consent, setConsent] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const columns = text
    .split(/[\n,;]/)
    .map((c) => c.trim())
    .filter(Boolean);
  async function propose() {
    setBusy(true);
    setError("");
    try {
      const r = await api("/field-mapping/propose", {
        columns,
        provider,
        cloudConsent: consent,
      });
      setRows(r.mappings);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>{t("Map an export to my profile")}</h2>
      <p className="muted">
        {t("Paste the column names of a spreadsheet export (one per line or comma-separated). The AI only suggests where each column belongs; nothing is imported. Private columns such as birth date, phone or supervisor are never mapped.")}
      </p>
      <label>
        {t("Column names")}
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder={"Fio\nKafedra\nDolzhnost\nTelefon"}
        />
      </label>
      <label>
        <input
          type="radio"
          name="map-provider"
          checked={provider === "local"}
          onChange={() => setProvider("local")}
        />{" "}
        {t("Local model (Ollama)")}
      </label>{" "}
      <label>
        <input
          type="radio"
          name="map-provider"
          checked={provider === "cloud"}
          onChange={() => setProvider("cloud")}
        />{" "}
        {t("Cloud model (Claude Opus 5.5)")}
      </label>
      {provider === "cloud" && (
        <label className="inline-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          {t("I agree to send these column names to OpenRouter.")}
        </label>
      )}
      <button
        type="button"
        disabled={busy || !columns.length || (provider === "cloud" && !consent)}
        onClick={propose}
      >
        {busy ? t("Analysing…") : t("Propose mapping")}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t("Column")}</th>
              <th>{t("Proposed field")}</th>
              <th>{t("Status")}</th>
              <th>{t("Reason")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.legacy}>
                <td>{r.legacy}</td>
                <td>{r.target || "—"}</td>
                <td>{r.status}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
