(() => {
  const allowed = new Set([
    "du.astanait.edu.kz", "my-du.astanait.edu.kz", "lms.astanait.edu.kz",
    "linkedin.com", "www.linkedin.com", "scopus.com", "www.scopus.com",
    "researchgate.net", "www.researchgate.net", "orcid.org",
  ]);
  if (location.protocol !== "https:" || !allowed.has(location.hostname) || window.top !== window) return;

  const mount = () => {
    if (!document.body || document.getElementById("unibridge-export-host")) return;
    const host = document.createElement("div");
    host.id = "unibridge-export-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:18px;bottom:18px";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `*{box-sizing:border-box;font:14px system-ui;color:#102446}button{border:0;border-radius:8px;padding:11px 16px;background:#2459e8;color:white;font-weight:650;cursor:pointer;box-shadow:0 4px 20px #0003}button:disabled{opacity:.55}dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);border:0;border-radius:14px;padding:20px;width:min(650px,calc(100vw - 36px));max-height:85vh;box-shadow:0 18px 70px #0007}dialog::backdrop{background:#14233b99}h2{margin:0 0 8px}p{line-height:1.45}textarea{width:100%;height:42vh;resize:vertical;padding:10px;border:1px solid #aab6c8;border-radius:8px}footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.secondary{background:#e9eef8;color:#102446;box-shadow:none}`;
    const button = document.createElement("button");
    button.textContent = "Export page to UniBridgeAI";
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<h2>Review page data</h2><p>Review and edit the text. Continue only if you want to save this snapshot and import it into your UniBridgeAI account.</p><textarea maxlength="30000" aria-label="Text to export"></textarea><footer><button class="secondary" data-action="cancel">Cancel</button><button data-action="send">Save snapshot file</button></footer><p role="status"></p>`;
    const area = dialog.querySelector("textarea");
    const status = dialog.querySelector("[role=status]");
    button.onclick = () => {
      const clone = document.body.cloneNode(true);
      clone.querySelector("#unibridge-export-host")?.remove();
      for (const node of clone.querySelectorAll("script,style,noscript,svg,canvas,iframe,input,textarea,select,button,[hidden],[aria-hidden=true]")) node.remove();
      area.value = (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 30000);
      status.textContent = area.value ? "Only the reviewed text will be saved in a JSON file." : "No readable page text found.";
      if (typeof dialog.showModal === "function") dialog.showModal();
    };
    dialog.querySelector('[data-action="cancel"]').onclick = () => dialog.close();
    dialog.querySelector('[data-action="send"]').onclick = (event) => {
      if (!area.value.trim()) { status.textContent = "There is no text to save."; return; }
      const send = event.currentTarget;
      send.disabled = true;
      status.textContent = "Creating snapshot file…";
      const snapshot = {
        version: 1,
        sourceUrl: location.origin + location.pathname,
        capturedAt: new Date().toISOString(),
        content: area.value.trim(),
      };
      chrome.runtime.sendMessage({ type: "unibridge-download-snapshot", snapshot }, (result) => {
        const error = chrome.runtime.lastError?.message || result?.error;
        status.textContent = error ? `Could not create the file: ${error}` : "Snapshot file saved. Import it in UniBridgeAI.";
        if (!error) setTimeout(() => dialog.close(), 1400);
        send.disabled = false;
      });
    };
    shadow.append(style, button, dialog);
    document.body.append(host);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
