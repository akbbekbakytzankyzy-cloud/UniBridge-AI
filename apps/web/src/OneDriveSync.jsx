import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { useI18n } from "./i18n.jsx";

// Teacher panel: connect Microsoft OneDrive, pick a folder, sync files into
// the review queue below. Hidden for students (the API answers 403).
const results = {
  connected: "OneDrive connected. Now choose the folder with your files.",
  denied: "Microsoft sign-in was cancelled.",
  error: "Microsoft sign-in did not complete. Try again.",
};

export default function OneDriveSync({ onSynced }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(null),
    [hidden, setHidden] = useState(false),
    [path, setPath] = useState([{ id: "", name: "OneDrive" }]),
    [folders, setFolders] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);

  const load = () =>
    api("/onedrive/status")
      .then(setStatus)
      .catch((e) => (/Teacher access/.test(e.message) ? setHidden(true) : setError(e.message)));

  useEffect(() => {
    load();
    // Microsoft sends the browser back to /?onedrive=<result>.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("onedrive");
    if (result) {
      (result === "connected" ? setNotice : setError)(t(results[result] || results.error));
      params.delete("onedrive");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, []);

  async function run(action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openFolder(trail) {
    setPath(trail);
    setFolders(null);
    const parent = trail[trail.length - 1].id;
    const d = await api(`/onedrive/folders${parent ? `?parent=${encodeURIComponent(parent)}` : ""}`);
    setFolders(d);
  }

  if (hidden) return null;
  const c = status?.connection;
  const current = path[path.length - 1];

  return (
    <section className="panel onedrive-panel">
      <div className="section-heading">
        <h2>{t("OneDrive automatic import")}</h2>
        {status?.connected && <span className="tag">{t("Connected")}</span>}
      </div>
      <p className="muted">
        {t("Connect your Microsoft account and choose one folder.")} {t("New and changed files")} (
        {status?.supported?.join(", ") || ".xlsx, .csv, .docx, .txt"}) {t("are imported automatically every 15 minutes and appear below for your review. Nothing becomes a record until you confirm it.")}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {status && !status.configured && (
        <p className="source-note">
          {t("OneDrive is not configured on this server yet. An administrator needs to register the app in Microsoft Entra and set MS_CLIENT_ID (see docs/ONEDRIVE.md).")}
        </p>
      )}
      {status?.configured && !status.connected && (
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const { url } = await api("/onedrive/connect", {});
              window.location.assign(url);
            })
          }
        >
          {t("Connect OneDrive")}
        </button>
      )}
      {status?.connected && (
        <>
          <dl className="onedrive-facts">
            <div>
              <dt>{t("Account")}</dt>
              <dd>{c.account_name || t("Microsoft account")}</dd>
            </div>
            <div>
              <dt>{t("Folder")}</dt>
              <dd>{c.folder_path || t("Not chosen yet")}</dd>
            </div>
            <div>
              <dt>{t("Last sync")}</dt>
              <dd>{c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : t("Never")}</dd>
            </div>
            <div>
              <dt>{t("Files tracked")}</dt>
              <dd>{c.files}</dd>
            </div>
          </dl>
          {c.last_error && <p className="error">{t("Last sync problem: ")} {c.last_error}</p>}
          <div className="button-group">
            {c.folder_id && (
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await api("/onedrive/sync", {});
                    const skipped = r.skipped.length
                      ? ` Skipped: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`
                      : "";
                    setNotice(
                      `${t("Sync finished:")} ${r.imported} ${t("new")}, ${r.updated} ${t("changed")}, ${r.unchanged} ${t("unchanged")}.${skipped}`,
                    );
                    await load();
                    onSynced?.();
                  })
                }
              >
                {busy ? t("Working…") : t("Sync now")}
              </button>
            )}
            <button className="secondary" disabled={busy} onClick={() => run(() => openFolder([{ id: "", name: "OneDrive" }]))}>
              {c.folder_id ? t("Change folder") : t("Choose folder")}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("Disconnect OneDrive? Files already imported stay in your review list.")))
                  return;
                run(async () => {
                  await api("/onedrive", undefined, "DELETE");
                  setFolders(null);
                  await load();
                });
              }}
            >
              {t("Disconnect")}
            </button>
          </div>
          {folders && (
            <div className="folder-picker">
              <p className="breadcrumb">
                {path.map((p, i) => (
                  <React.Fragment key={p.id || "root"}>
                    {i > 0 && " / "}
                    <button type="button" className="text-button" onClick={() => run(() => openFolder(path.slice(0, i + 1)))}>
                      {p.name}
                    </button>
                  </React.Fragment>
                ))}
              </p>
              <ul>
                {folders.folders.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="text-button" onClick={() => run(() => openFolder([...path, f]))}>
                      📁 {f.name}
                    </button>
                    <small> {f.children} {t(" items")}</small>
                  </li>
                ))}
                {!folders.folders.length && <li className="muted">{t("No subfolders here.")}</li>}
              </ul>
              {current.id && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const label = path.slice(1).map((p) => p.name).join(" / ");
                      await api("/onedrive/folder", { id: current.id, path: label }, "PUT");
                      setFolders(null);
                      setNotice(t("Folder selected. Press Sync now to import its files.").replace("{folder}", label));
                      await load();
                    })
                  }
                >
                  {t("Use folder")}: {current.name} ({folders.files} {t("files")})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
