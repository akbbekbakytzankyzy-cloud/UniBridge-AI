// Collects a DU teacher profile (du.astanait.edu.kz/teacher/<id>) as structured
// data: the header block plus every tab's table on every page, keeping links.
// DU renders only the active tab and 10 rows per page, so this clicks through
// tabs and pagination like a person would. Read-only: it never submits forms.
// Exposed as window.__unibridgeDuCapture for page-bridge.js (and tests).
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) =>
    String(s || "")
      .replace(/ /g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const activePane = () => document.querySelector(".ant-tabs-tabpane-active");
  const firstRowText = () =>
    activePane()?.querySelector("tbody tr")?.textContent || "";

  async function waitForChange(before, timeout = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await sleep(150);
      const now = firstRowText();
      if (now && now !== before) return true;
    }
    return false;
  }

  function readTable(pane) {
    const table = pane.querySelector("table");
    if (!table) return null;
    const headers = [...table.querySelectorAll("thead th")].map((th) =>
      clean(th.textContent),
    );
    const rows = [...table.querySelectorAll("tbody tr")]
      .filter(
        (tr) =>
          !tr.classList.contains("ant-table-placeholder") &&
          !tr.querySelector(".ant-empty"),
      )
      .map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => ({
          text: clean(td.innerText || td.textContent),
          links: [...td.querySelectorAll("a[href]")]
            .map((a) => a.href)
            .filter((h) => /^https?:/i.test(h))
            .slice(0, 10),
        })),
      );
    return { headers, rows };
  }

  async function readAllPages(pane) {
    const first = readTable(pane);
    if (!first)
      return {
        headers: [],
        rows: [],
        text: clean(pane.innerText).slice(0, 20000),
      };
    const rows = [...first.rows];
    // Long lists hide page numbers behind "…", so use the "next page" button.
    let pagesRead = 1;
    for (; pagesRead < 100; pagesRead++) {
      const next = activePane()?.querySelector(".ant-pagination-next");
      if (
        !next ||
        next.classList.contains("ant-pagination-disabled") ||
        next.getAttribute("aria-disabled") === "true"
      )
        break;
      const before = firstRowText();
      (next.querySelector("button, a") || next).click();
      if (!(await waitForChange(before))) break;
      const page = readTable(activePane());
      if (page) rows.push(...page.rows);
    }
    // Go back to page 1 so the page looks as the teacher left it.
    activePane()?.querySelector(".ant-pagination-item-1")?.click();
    return { headers: first.headers, rows, pages: pagesRead };
  }

  async function capture(onProgress = () => {}) {
    const main = document.querySelector("main") || document.body;
    const tabs = [...document.querySelectorAll(".ant-tabs [role=tab]")];
    // innerText keeps line breaks only on the live page, so cut the visible text
    // where the schedule/tabs start instead of cloning.
    const full = main.innerText || "";
    const markers = [
      document.querySelector(".ant-collapse")?.innerText.split("\n")[0],
      tabs[0]?.textContent,
    ].filter((m) => m && m.trim());
    const cut = Math.min(
      ...markers.map((m) => full.indexOf(m.trim())).filter((i) => i > 0),
      full.length,
    );
    const tabsBox = document.querySelector(".ant-tabs");
    const header = {
      text: clean(full.slice(0, cut)).slice(0, 20000),
      links: [...main.querySelectorAll("a[href]")]
        .filter((a) => !tabsBox?.contains(a))
        .map((a) => a.href)
        .filter((h) => /^(https?|mailto):/i.test(h))
        .slice(0, 20),
    };
    const original = tabs.find(
      (t) => t.getAttribute("aria-selected") === "true",
    );
    const sections = {};
    for (const [i, tab] of tabs.entries()) {
      const name = clean(tab.textContent);
      onProgress(`${i + 1}/${tabs.length}: ${name}`);
      const before = activePane()?.innerText || "";
      tab.click();
      const start = Date.now();
      while (
        Date.now() - start < 4000 &&
        tab.getAttribute("aria-selected") !== "true"
      )
        await sleep(100);
      await sleep(600);
      if ((activePane()?.innerText || "") === before && i > 0) await sleep(800);
      sections[name] = await readAllPages(activePane());
    }
    original?.click();
    return {
      format: "du-teacher-v1",
      source: location.origin + location.pathname,
      captured_at: new Date().toISOString(),
      header,
      sections,
    };
  }

  window.__unibridgeDuCapture = capture;
})();
