import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { invoke } from "@tauri-apps/api/core";
import DuImportReview from "./DuImportReview.jsx";
import { useI18n } from "./i18n.jsx";

function Source({ item, refresh }) {
  const { t } = useI18n();
  const [consent, setConsent] = useState(false);
  const [question, setQuestion] = useState(
    "Summarise my education, publications and achievements from this source. Cite [S1].",
  );
  const [answer, setAnswer] = useState("");
  const [fullText, setFullText] = useState(null);
  const loadFullText = async (e) => {
    if (!e.currentTarget.open || fullText !== null) return;
    try {
      setFullText((await api(`/browser-imports/${item.id}`)).import.content);
    } catch (err) {
      setFullText(t("Could not load the text: ") + err.message);
    }
  };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  // A full DU profile gets its own structured review instead of raw text.
  if (item.kind === "du-profile")
    return (
      <article className="panel">
        <span className="tag">{t("DU profile")}</span>{" "}
        <a href={item.source_url} target="_blank" rel="noopener noreferrer">
          {item.source_url}
        </a>
        <p className="muted">
          {item.status === "accepted"
            ? t("Added to your profile")
            : t("Waiting for your review")}{" "}
          · {new Date(item.created_at).toLocaleString()}
        </p>
        <DuImportReview importId={item.id} onApplied={refresh} />
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await api(`/browser-imports/${item.id}`, undefined, "DELETE");
              await refresh();
            })
          }
        >
          {t("Delete this DU snapshot")}
        </button>
        {error && <p className="error">{error}</p>}
      </article>
    );
  return (
    <article className="panel">
      {item.origin === "onedrive" && <span className="tag">OneDrive</span>}{" "}
      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
        {item.title || item.source_url}
      </a>
      <p>
        {item.status === "accepted"
          ? t("Accepted snapshot")
          : t("Pending your review")}{" "}
        · {new Date(item.created_at).toLocaleString()}
      </p>
      <details onToggle={loadFullText}>
        <summary>{t("Review imported text")}</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {fullText ?? t("Loading…")}
        </pre>
      </details>
      {item.status === "pending" && (
        <button
          disabled={busy}
          onClick={() =>
            act(async () => {
              await api(`/browser-imports/${item.id}/accept`, {});
              await refresh();
            })
          }
        >
          {t("Accept this snapshot")}
        </button>
      )}{" "}
      <button
        disabled={busy}
        onClick={() =>
          act(async () => {
            await api(`/browser-imports/${item.id}`, undefined, "DELETE");
            await refresh();
          })
        }
      >
        {t("Delete snapshot")}
      </button>
      {item.status === "accepted" && (
        <ExtractButton item={item} act={act} busy={busy} />
      )}
      {item.status === "accepted" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const status = await api("/ai/status");
              const preferred =
                status.defaultProvider === "cloud" ? "cloud" : "local";
              const model = (
                status.models?.find((m) => m.provider === preferred) ||
                status.models?.[0]
              )?.name;
              if (!model) throw new Error(t("No AI model configured"));
              const result = await api("/ai/chat", {
                model,
                sourceId: item.id,
                cloudConsent: consent,
                messages: [{ role: "user", content: question }],
              });
              setAnswer(result.message.content);
            });
          }}
        >
          <label>
            {t("Question about this source")}
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={8000}
              required
              disabled={busy}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy}
            />{" "}
            {t("Allow sending this snapshot (up to 14,000 characters) and my question to the configured AI provider, including OpenRouter for cloud AI.")}
          </label>
          <button disabled={busy || !consent}>{t("Ask AI about this source")}</button>
          <p>
            {t("Answers use this saved snapshot, not live account data. Accepting a snapshot does not automatically fill your profile.")}
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {answer && <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>}
    </article>
  );
}
export default function BrowserImports() {
  const { t } = useI18n();
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [desktop] = useState(() => Boolean(window.__TAURI_INTERNALS__));
  const load = async () => setItems((await api("/browser-imports")).imports);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(url) {
    await run(async () => {
      const { code } = await api("/browser-imports/code", {});
      await invoke("open_university_browser", { url, code });
    });
  }
  return (
    <section className="panel">
      <h2>{t("Import through your browser")}</h2>
      <p>
        {t("Open an official site in the UniBridgeAI desktop window. Sign in there yourself. On a profile or publication page, choose “Import this page to UniBridgeAI”, review the text and send it for approval. Passwords stay on the official site.")}
      </p>
      {!desktop && (
        <p role="status">
          {t("The built-in browser is available in the installed Windows/macOS desktop app. This web preview cannot inspect other tabs.")}
        </p>
      )}
      {desktop && (
        <div className="actions">
          {[
            ["Digital University", "https://du.astanait.edu.kz/"],
            ["AITU LMS", "https://lms.astanait.edu.kz/"],
            ["MyDU", "https://my-du.astanait.edu.kz/"],
            ["LinkedIn", "https://www.linkedin.com/"],
            ["Scopus", "https://www.scopus.com/"],
            ["ResearchGate", "https://www.researchgate.net/"],
            ["ORCID", "https://orcid.org/"],
          ].map(([name, url]) => (
            <button key={url} disabled={busy} onClick={() => connect(url)}>
              {t("Open ")}{name}{t(" inside UniBridgeAI")}
            </button>
          ))}
        </div>
      )}
      <button disabled={busy} onClick={() => run(load)}>
        {t("Refresh imports")}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!items.length && <p>{t("No snapshots imported yet.")}</p>}
      {items.map((item) => (
        <Source key={item.id} item={item} refresh={load} />
      ))}
    </section>
  );
}

function ExtractButton({ item, act, busy }) {
  const { t } = useI18n();
  const [cloudConsent, setCloudConsent] = useState(false);
  const [provider, setProvider] = useState("local");
  const [result, setResult] = useState("");
  return (
    <div>
      <label>
        <input
          type="radio"
          name={`provider-${item.id}`}
          checked={provider === "local"}
          onChange={() => setProvider("local")}
          disabled={busy}
        />{" "}
        {t("Analyse locally (Ollama, qwen3:4b)")}
      </label>{" "}
      <label>
        <input
          type="radio"
          name={`provider-${item.id}`}
          checked={provider === "cloud"}
          onChange={() => setProvider("cloud")}
          disabled={busy}
        />{" "}
        {t("Analyse in the cloud (Claude Haiku 5.5)")}
      </label>
      {provider === "cloud" && (
        <label>
          <br />
          <input
            type="checkbox"
            checked={cloudConsent}
            onChange={(e) => setCloudConsent(e.target.checked)}
            disabled={busy}
          />{" "}
          {t("I agree to send this page text to OpenRouter.")}
        </label>
      )}
      <br />
      <button
        disabled={busy || (provider === "cloud" && !cloudConsent)}
        onClick={() =>
          act(async () => {
            const r = await api(`/extraction/sources/${item.id}/extract`, {
              provider,
              cloudConsent,
            });
            setResult(
              `${r.drafts} ${t("draft record(s) created. Review them in \"Drafts to confirm\" below.")}`,
            );
          })
        }
      >
        {t("Read records from this page")}
      </button>
      {result && <p role="status">{result}</p>}
    </div>
  );
}

export function DraftsToConfirm() {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState("");
  const load = () =>
    api("/extraction/drafts")
      .then((d) => setDrafts(d.drafts))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const decide = async (id, action) => {
    try {
      await api(`/extraction/drafts/${id}/${action}`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <section className="panel">
      <h2>{t("Drafts to confirm")}</h2>
      <p className="muted">
        {t("Nothing here is saved to your records until you confirm it.")}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {drafts.map((d) => (
        <article className="panel" key={d.id}>
          <span className="tag">
            {d.record_type} · from {d.model}
          </span>
          <h3>{d.data.title}</h3>
          <ul>
            {Object.entries(d.data)
              .filter(([k]) => k !== "title")
              .map(([k, v]) => (
                <li key={k}>
                  {k}: {String(v)}
                </li>
              ))}
          </ul>
          {d.missing_fields.length > 0 && (
            <p>{t("Not found on the page: ")} {d.missing_fields.join(", ")}</p>
          )}
          {d.warnings.map((w) => (
            <p key={w} className="error">
              {w}
            </p>
          ))}
          <button onClick={() => decide(d.id, "confirm")}>{t("Confirm")}</button>{" "}
          <button className="secondary" onClick={() => decide(d.id, "reject")}>
            {t("Reject")}
          </button>
        </article>
      ))}
      {!drafts.length && <p className="empty">{t("No drafts waiting.")}</p>}
    </section>
  );
}
