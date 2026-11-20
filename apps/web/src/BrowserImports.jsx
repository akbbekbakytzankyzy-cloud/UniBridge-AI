import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { invoke } from "@tauri-apps/api/core";

function Source({ item, refresh }) {
  const [consent, setConsent] = useState(false);
  const [question, setQuestion] = useState(
    "Summarise my education, publications and achievements from this source. Cite [S1].",
  );
  const [answer, setAnswer] = useState("");
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
  return (
    <article className="panel">
      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
        {item.source_url}
      </a>
      <p>
        {item.status === "accepted"
          ? "Accepted snapshot"
          : "Pending your review"}{" "}
        · {new Date(item.created_at).toLocaleString()}
      </p>
      <details>
        <summary>Review imported text</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {item.content}
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
          Accept this snapshot
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
        Delete snapshot
      </button>
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
              if (!model) throw new Error("No AI model configured");
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
            Question about this source
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
            Allow sending this snapshot (up to 14,000 characters) and my
            question to the configured AI provider, including OpenRouter for
            cloud AI.
          </label>
          <button disabled={busy || !consent}>Ask AI about this source</button>
          <p>
            Answers use this saved snapshot, not live account data. Accepting a
            snapshot does not automatically fill your profile.
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
      <h2>Import through your browser</h2>
      <p>
        Open an official site in the UniBridgeAI desktop window. Sign in there
        yourself. On a profile or publication page, choose “Import this page to
        UniBridgeAI”, review the text and send it for approval. Passwords stay
        on the official site.
      </p>
      {!desktop && (
        <p role="status">
          The built-in browser is available in the installed Windows/macOS
          desktop app. This web preview cannot inspect other tabs.
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
              Open {name} inside UniBridgeAI
            </button>
          ))}
        </div>
      )}
      <button disabled={busy} onClick={() => run(load)}>
        Refresh imports
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!items.length && <p>No snapshots imported yet.</p>}
      {items.map((item) => (
        <Source key={item.id} item={item} refresh={load} />
      ))}
    </section>
  );
}
