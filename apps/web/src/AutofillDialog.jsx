import React, { useEffect, useState } from "react";
import { api } from "./api.js";

// "Автозаполнение с помощью ИИ": the owner picks the sources, then the model
// (cloud models first, then local), reviews the suggestions and ticks what to fill.
// Nothing is saved until "Fill selected fields".
export default function AutofillButton({ profile, onApplied, setNotice }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Автозаполнение с помощью ИИ
      </button>
      {open && (
        <AutofillDialog
          profile={profile}
          onClose={() => setOpen(false)}
          onApplied={(next, message) => {
            onApplied(next);
            setNotice(message);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function AutofillDialog({ profile, onClose, onApplied }) {
  const [options, setOptions] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [choice, setChoice] = useState("");
  const [consent, setConsent] = useState(false);
  const [items, setItems] = useState([]);
  const [picked, setPicked] = useState({});
  const [used, setUsed] = useState(null);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/autofill/options")
      .then((o) => {
        setOptions(o);
        setChosen(new Set(o.sources.map((s) => s.key)));
        if (o.cloud.available && o.cloud.models[0]) setChoice(`cloud|${o.cloud.models[0]}`);
        else if (o.local.models.includes(o.local.default)) setChoice(`local|${o.local.default}`);
        else if (o.local.models[0]) setChoice(`local|${o.local.models[0]}`);
      })
      .catch((e) => setError(e.message));
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [provider, ...rest] = choice.split("|");
  const model = rest.join("|");
  const modelOptions = options
    ? [
        ...options.cloud.models.map((m) => ({
          value: `cloud|${m}`,
          label: `${m} · cloud (OpenRouter)`,
          disabled: !options.cloud.available,
        })),
        ...options.local.models.map((m) => ({ value: `local|${m}`, label: `${m} · local (Ollama)` })),
      ]
    : [];
  const toggle = (key) =>
    setChosen((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  async function findValues() {
    setBusy(true);
    setError("");
    setInfo("");
    setItems([]);
    try {
      const r = await api("/autofill/profile/suggest", {
        sources: [...chosen],
        provider,
        model,
        cloudConsent: provider === "cloud" ? consent : undefined,
      });
      setItems(r.suggestions || []);
      setPicked(Object.fromEntries((r.suggestions || []).map((s) => [s.field, true])));
      setUsed({ provider: r.provider, model: r.model });
      setInfo(
        (r.suggestions || []).length
          ? "Every suggestion shows its source. Untick anything you do not want."
          : r.note || "No suggestions found in the chosen sources.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function fill() {
    const values = Object.fromEntries(items.filter((s) => picked[s.field]).map((s) => [s.field, s.value]));
    if (!Object.keys(values).length) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/autofill/profile/apply", { revision: profile.revision, values });
      onApplied(
        { ...profile, revision: r.revision, ...values },
        `Filled ${r.applied.length} field(s). Review and save the profile.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const cloudChosen = provider === "cloud";
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal autofill"
        role="dialog"
        aria-modal="true"
        aria-labelledby="autofill-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="autofill-title">Автозаполнение с помощью ИИ</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="muted">
          Fills only empty fields, from the sources you choose. Nothing is saved until you fill the selected fields.
        </p>
        {!options && !error && <p>Loading sources…</p>}
        {options && (
          <>
            <fieldset className="autofill-sources">
              <legend>Sources</legend>
              {options.sources.length === 0 && (
                <p className="empty">No accepted imports or confirmed records yet.</p>
              )}
              {options.sources.map((s) => (
                <label key={s.key} className="inline-check">
                  <input
                    type="checkbox"
                    checked={chosen.has(s.key)}
                    disabled={busy}
                    onChange={() => toggle(s.key)}
                  />{" "}
                  {s.label} <small className="muted">({s.count})</small>
                </label>
              ))}
            </fieldset>
            <label>
              AI model (cloud first)
              <select value={choice} disabled={busy} onChange={(e) => setChoice(e.target.value)}>
                {modelOptions.map((m) => (
                  <option key={m.value} value={m.value} disabled={m.disabled}>
                    {m.label}
                    {m.disabled ? " (not configured on the server)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {cloudChosen && (
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                Send the selected sources to OpenRouter for this request.
              </label>
            )}
            {!modelOptions.length && (
              <p role="alert" className="error">
                No AI model is available. Start Ollama on this computer or configure OpenRouter on the server.
              </p>
            )}
            <button
              type="button"
              disabled={busy || !chosen.size || !choice || (cloudChosen && !consent)}
              onClick={findValues}
            >
              {busy && !items.length ? "Working…" : "Find values"}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {info && <p role="status">{info}</p>}
        {used && items.length > 0 && (
          <p className="muted">
            Suggested by {used.provider === "cloud" ? "cloud" : "local"} model {used.model}
          </p>
        )}
        {items.map((s) => (
          <label key={s.field} className="suggestion">
            <input
              type="checkbox"
              checked={!!picked[s.field]}
              disabled={busy}
              onChange={(e) => setPicked((p) => ({ ...p, [s.field]: e.target.checked }))}
            />
            <span>
              <strong>{s.field}</strong>: {s.value}
              <small className="muted"> · source {s.source}: {s.reason}</small>
            </span>
          </label>
        ))}
        {items.length > 0 && (
          <button type="button" disabled={busy} onClick={fill}>
            Fill selected fields
          </button>
        )}
      </section>
    </div>
  );
}
