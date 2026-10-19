"use strict";
// Small progressive enhancements. The documentation remains readable without JavaScript.
document.querySelectorAll("main table").forEach(table => {
  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";
  wrapper.tabIndex = 0;
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", "Scrollable reference table");
  table.before(wrapper); wrapper.append(table);
});
document.querySelectorAll("main details").forEach(details => {
  if (details.querySelector("#markdown-toc")) details.open = false;
});
const menu = document.querySelector(".guide-menu");
document.addEventListener("click", event => {
  if (menu && !menu.contains(event.target)) menu.open = false;
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && menu?.open) {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});
const input = document.querySelector("#guide-search");
const results = document.querySelector("#search-results");
const status = document.querySelector("#search-status");
let index;
let generation = 0;
let timer;
input?.addEventListener("input", () => {
  const request = ++generation;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren(); results.hidden = !query;
    if (query.length < 2) { status.textContent = query ? "Type at least two characters." : ""; return; }
    status.textContent = "Searching…";
    try {
      index ??= fetch(document.body.dataset.searchIndex).then(r => { if (!r.ok) throw Error("index"); return r.json(); });
      const pages = await index;
      if (request !== generation) return;
      const words = query.split(/\s+/).slice(0, 8);
      const matches = pages.filter(p => words.every(word => (p.title + " " + p.description + " " + p.text).toLocaleLowerCase().includes(word)))
        .sort((a, b) => Number(b.title.toLocaleLowerCase().includes(query)) - Number(a.title.toLocaleLowerCase().includes(query))).slice(0, 12);
      for (const page of matches) {
        const link = document.createElement("a");
        link.href = page.url; link.textContent = page.title;
        const note = document.createElement("small"); note.textContent = page.description;
        link.append(note); results.append(link);
      }
      status.textContent = matches.length ? matches.length + " matching guides" : "No match. Try a shorter term.";
    } catch {
      index = undefined;
      if (request === generation) status.textContent = "Search is unavailable. Open Guides above to browse the documentation.";
    }
  }, 180);
});
