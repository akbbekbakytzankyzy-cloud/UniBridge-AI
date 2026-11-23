import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import BrowserImports, { DraftsToConfirm } from "./BrowserImports.jsx";
import FieldMapping from "./FieldMapping.jsx";
import OneDriveSync from "./OneDriveSync.jsx";
import ImportHistory, { ImportAllPanel } from "./ImportHistory.jsx";
import { useI18n } from "./i18n.jsx";

export default function UniversityAccounts() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [imports, setImports] = useState(0);
  const load = () => api("/university-accounts").then(setData);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function update(id, loginHint) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        `/university-accounts/${id}`,
        loginHint === null ? undefined : { loginHint },
        loginHint === null ? "DELETE" : "PUT",
      );
      await load();
      setNotice(
        loginHint === null
          ? "Saved account removed."
          : "Account saved. University connection is still pending.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h1>{t("University accounts")}</h1>
      <p>
        {t("Save your AITU logins once. These details belong to your UniBridgeAI account and are remembered after signing out.")}
      </p>
      <p>
        {t("Connection pending: AITU SSO/API integration is not configured. Saving a login or opening a university website does not verify ownership or import data. Do not enter your university password here.")}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{t(notice)}</p>}
      <ImportAllPanel onDone={() => setImports((n) => n + 1)} />
      <OneDriveSync onSynced={() => setImports((n) => n + 1)} />
      <BrowserImports key={imports} />
      <DraftsToConfirm />
      <FieldMapping />
      {!data && !error && <p>{t("Loading accounts…")}</p>}
      {data?.providers.map((p) => {
        const account = data.accounts.find((a) => a.provider === p.id);
        return (
          <form
            key={`${p.id}:${account?.updated_at || "new"}`}
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              update(p.id, new FormData(e.currentTarget).get("loginHint"));
            }}
          >
            <h2>{p.name}</h2>
            <p>
              {account
                ? t("Saved · awaiting university connection")
                : t("No account saved")}
            </p>
            <label>
              {t("University email or username")}
              <input
                name="loginHint"
                autoComplete="off"
                defaultValue={account?.login_hint || ""}
                maxLength={254}
                required
                disabled={busy}
              />
            </label>
            <button disabled={busy} type="submit">
              {t("Save account")}
            </button>{" "}
            {account && (
              <button
                disabled={busy}
                type="button"
                onClick={() => update(p.id, null)}
              >
                {t("Remove")}
              </button>
            )}{" "}
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {t("Open ")}{p.name}
            </a>
          </form>
        );
      })}
      <ImportHistory key={`history-${imports}`} />
    </section>
  );
}
