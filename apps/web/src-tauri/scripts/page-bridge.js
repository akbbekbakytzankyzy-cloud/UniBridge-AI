(() => {
  const allowed = new Set([
    "du.astanait.edu.kz", "lms.astanait.edu.kz", "my-du.astanait.edu.kz",
    "linkedin.com", "www.linkedin.com", "scopus.com", "www.scopus.com",
    "researchgate.net", "www.researchgate.net", "orcid.org",
  ]);
  if (location.protocol !== "https:" || !allowed.has(location.hostname) || window.top !== window) return;

  const mount = () => {
    if (!document.body || document.getElementById("unibridge-import-host")) return;
    const host = document.createElement("div");
    host.id = "unibridge-import-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:18px;bottom:18px";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `*{box-sizing:border-box;font:14px system-ui;color:#102446}button{border:0;border-radius:8px;padding:11px 16px;background:#2459e8;color:white;font-weight:650;cursor:pointer;box-shadow:0 4px 20px #0003}button:disabled{opacity:.55}dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);border:0;border-radius:14px;padding:20px;width:min(650px,calc(100vw - 36px));max-height:85vh;box-shadow:0 18px 70px #0007}dialog::backdrop{background:#14233b99}h2{margin:0 0 8px}p{line-height:1.45}textarea{width:100%;height:42vh;resize:vertical;padding:10px;border:1px solid #aab6c8;border-radius:8px}footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.secondary{background:#e9eef8;color:#102446;box-shadow:none}`;
    const button = document.createElement("button");
    button.textContent = "Import all information from this page";
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<h2>Review page data</h2><p>Check and edit this text. It will be saved to your UniBridgeAI account only after you choose Send.</p><textarea maxlength="300000" aria-label="Text to import"></textarea><footer><button class="secondary" data-action="cancel">Cancel</button><button data-action="send">Send for review</button></footer><p role="status"></p>`;
    const area = dialog.querySelector("textarea");
    const status = dialog.querySelector("[role=status]");
    // On a DU teacher profile the whole profile (all tabs and pages) is collected.
    const duProfile = location.hostname === "du.astanait.edu.kz" && typeof window.__unibridgeDuCapture === "function";
    if (duProfile) button.textContent = "Import full DU profile to UniBridgeAI";
    button.onclick = async () => {
      if (duProfile && document.querySelector(".ant-tabs [role=tab]")) {
        button.disabled = true;
        try {
          const data = await window.__unibridgeDuCapture((step) => { button.textContent = "Reading " + step; status.textContent = "Reading the DU profile: " + step + ". Please keep this page open."; });
          area.value = JSON.stringify(data);
          const counts = Object.entries(data.sections).map(([k, v]) => k + ": " + v.rows.length).join(", ");
          area.readOnly = true;
          status.textContent = "Collected the whole DU profile (" + counts + "). UniBridgeAI will show every item for review before saving.";
        } catch (error) {
          area.readOnly = false;
          area.value = "";
          status.textContent = "Could not read the DU profile: " + String(error).slice(0, 200);
        } finally {
          button.disabled = false;
          button.textContent = "Import full DU profile to UniBridgeAI";
        }
        if (typeof dialog.showModal === "function") dialog.showModal();
        return;
      }
      area.readOnly = false;
      const clone = document.body.cloneNode(true);
      clone.querySelector("#unibridge-import-host")?.remove();
      for (const node of clone.querySelectorAll("script,style,noscript,svg,canvas,iframe,input,textarea,select,button,[hidden],[aria-hidden=true]")) node.remove();
      // Every table on the page is kept row by row (cells tab-separated, links kept), then the page text.
      const tables = [...document.querySelectorAll("table")]
        .filter((t) => !host.contains(t))
        .map((t) => [...t.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => {
          const link = c.querySelector("a[href]");
          return String(c.innerText || "").replace(/\s+/g, " ").trim() + (link ? " " + link.href : "");
        }).join("\t")).join("\n"))
        .filter(Boolean);
      const pageText = (clone.innerText || clone.textContent || "").replace(/\n{3,}/g,"\n\n").trim();
      area.value = (tables.length ? "TABLES\n" + tables.join("\n\n") + "\n\nPAGE TEXT\n" : "") + pageText;
      area.value = area.value.slice(0,300000);
      status.textContent = area.value ? "Review the text before sending." : "No readable page text found.";
      if (typeof dialog.showModal === "function") dialog.showModal();
    };
    dialog.querySelector('[data-action="cancel"]').onclick = () => dialog.close();
    dialog.querySelector('[data-action="send"]').onclick = async event => {
      const send = event.currentTarget;
      if (!area.value.trim()) { status.textContent = "There is no text to send."; return; }
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== "function") { status.textContent = "Return to UniBridgeAI and reopen this page."; return; }
      send.disabled = true;
      status.textContent = "Sending the reviewed snapshot…";
      try {
        await invoke("capture_university_page", { content: area.value });
        status.textContent = "Saved as a pending snapshot. Return to UniBridgeAI and refresh imports.";
        setTimeout(() => dialog.close(), 1400);
      } catch (error) {
        status.textContent = String(error).slice(0,250);
        send.disabled = false;
      }
    };
    shadow.append(style,button,dialog);
    document.body.append(host);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",mount,{once:true}); else mount();
})();
