import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { invoke } from "@tauri-apps/api/core";

const pad = (n) => String(n).padStart(2, "0");
const dayOf = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const timeOf = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const sizeOf = (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);
const STATUS = {
  current: "Current",
  outdated: "Outdated",
  duplicate: "Duplicate re-download",
};

// "Check my imported data": every snapshot as a row, newest first.
export default function ImportHistory() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState("");
  const load = () =>
    api("/browser-imports")
      .then((d) => setRows(d.imports))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function download(row) {
    setError("");
    try {
      const r = await fetch(`/api/browser-imports/${row.id}/download`, { credentials: "same-origin" });
      if (!r.ok) throw new Error("Download failed");
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || `import.${row.format.toLowerCase()}`;
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(row) {
    if (!window.confirm("Delete this import? Records already confirmed from it stay.")) return;
    setBusy(true);
    try {
      await api(`/browser-imports/${row.id}`, undefined, "DELETE");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel import-history">
      <h2>Check my imported data</h2>
      <p className="muted">
        Every snapshot you imported, newest first. Download a copy to your computer or ask AI what it contains.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {rows === null && !error && <p>Loading history…</p>}
      {rows && rows.length === 0 && <p className="empty">Nothing imported yet.</p>}
      {rows && rows.length > 0 && (
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Date</th>
                <th>Source</th>
                <th>Size</th>
                <th>Format</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr>
                    <td>{timeOf(row.created_at)}</td>
                    <td>{dayOf(row.created_at)}</td>
                    <td title={row.source_url}>{row.source}</td>
                    <td>{sizeOf(row.size_bytes)}</td>
                    <td>{row.format}</td>
                    <td>
                      <span className={"tag tag-" + row.version}>{STATUS[row.version] || row.version}</span>
                      <br />
                      <small className="muted">{row.status === "accepted" ? "accepted" : "pending review"}</small>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="What is in this import?"
                        aria-expanded={openId === row.id}
                        title="What is in this import?"
                        onClick={() => setOpenId(openId === row.id ? "" : row.id)}
                      >
                        ?
                      </button>
                      <button type="button" className="secondary" onClick={() => download(row)}>
                        Download
                      </button>
                      <button type="button" className="secondary" disabled={busy} onClick={() => remove(row)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  {openId === row.id && (
                    <tr className="history-detail">
                      <td colSpan={7}>
                        <ImportDescription row={row} onSaved={load} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Short AI description of one snapshot. Local is the default; cloud is offered first when configured.
function ImportDescription({ row, onSaved }) {
  const [summary, setSummary] = useState(row.ai_summary || "");
  const [model, setModel] = useState(row.ai_summary_model || "");
  const [cloud, setCloud] = useState(null);
  const [provider, setProvider] = useState("local");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/ai/status")
      .then((s) => {
        const available = Boolean(s.cloud?.available);
        setCloud(available);
        setProvider(available ? "cloud" : "local");
      })
      .catch(() => setCloud(false));
  }, []);
  async function describe(refresh = false) {
    setBusy(true);
    setError("");
    try {
      const r = await api(`/browser-imports/${row.id}/describe`, {
        provider,
        cloudConsent: provider === "cloud" ? consent : undefined,
        refresh,
      });
      setSummary(r.summary);
      setModel(r.model);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (summary)
    return (
      <div>
        <p>{summary}</p>
        <small className="muted">Described by {model}.</small>{" "}
        <button type="button" className="link-button" disabled={busy} onClick={() => describe(true)}>
          Describe again
        </button>
        {error && <p role="alert" className="error">{error}</p>}
      </div>
    );
  return (
    <div>
      <p className="muted">Ask AI for a short description of this snapshot. It reads the saved text only.</p>
      {cloud !== null && (
        <fieldset className="inline-fieldset">
          <legend>Model</legend>
          {cloud && (
            <label className="inline-check">
              <input type="radio" checked={provider === "cloud"} disabled={busy} onChange={() => setProvider("cloud")} />{" "}
              Cloud (OpenRouter)
            </label>
          )}
          <label className="inline-check">
            <input type="radio" checked={provider === "local"} disabled={busy} onChange={() => setProvider("local")} />{" "}
            Local (Ollama)
          </label>
        </fieldset>
      )}
      {provider === "cloud" && (
        <label className="inline-check">
          <input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />{" "}
          Send this snapshot text to OpenRouter.
        </label>
      )}
      <button
        type="button"
        disabled={busy || cloud === null || (provider === "cloud" && !consent)}
        onClick={() => describe(false)}
      >
        {busy ? "Describing…" : "Describe with AI"}
      </button>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

// "Импорт всей информации": one button per linked platform.
export function ImportAllPanel({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const desktop = Boolean(window.__TAURI_INTERNALS__);
  // Same flow as the page import: a single-use code is requested first, then the window opens.
  async function openInApp(url) {
    setError("");
    setMessage("");
    try {
      const { code } = await api("/browser-imports/code", {});
      await invoke("open_university_browser", { url, code });
    } catch (e) {
      setError(String(e.message || e));
    }
  }
  async function syncOneDrive() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api("/onedrive/sync", {});
      setMessage("OneDrive synced. Files already imported and unchanged are skipped.");
      onDone?.();
      return r;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Import all information</h2>
      <p className="muted">
        Each button brings in everything the platform makes available. Imported data is marked green in the app.
      </p>
      <div className="import-all">
        <article className="import-card">
          <strong>Digital University (DU)</strong>
          <p>
            Opens your DU profile in the UniBridgeAI window. On the profile page choose
            “Import full DU profile to UniBridgeAI”.
          </p>
          <button type="button" disabled={!desktop} onClick={() => openInApp("https://du.astanait.edu.kz/")}>
            Импорт всей информации
          </button>
        </article>
        <article className="import-card">
          <strong>OneDrive</strong>
          <p>Reads every file in the folder you chose. Unchanged files are not read again.</p>
          <button type="button" disabled={busy} onClick={syncOneDrive}>
            Импорт всей информации
          </button>
        </article>
        <article className="import-card">
          <strong>AITU LMS</strong>
          <p>Opens LMS in the UniBridgeAI window. Whole-course capture is not built yet; import page by page.</p>
          <button type="button" disabled={!desktop} onClick={() => openInApp("https://lms.astanait.edu.kz/")}>
            Импорт всей информации
          </button>
        </article>
        <article className="import-card">
          <strong>MyDU</strong>
          <p>Opens MyDU in the UniBridgeAI window. Whole-page capture is not built yet; import page by page.</p>
          <button type="button" disabled={!desktop} onClick={() => openInApp("https://my-du.astanait.edu.kz/")}>
            Импорт всей информации
          </button>
        </article>
      </div>
      {!desktop && (
        <p role="status" className="muted">
          Opening university sites needs the installed desktop app. OneDrive works in the browser.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
