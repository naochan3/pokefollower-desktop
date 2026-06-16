const DEFAULT_PACK = "retro/gen-1/001-bulbasaur";

function mapKeys(obj) {
  const m = { vcp1_enabled: "enabled", vcp1_pack: "pack", vcp1_scale: "scale", vcp1_offset: "offset", vcp1_lerp: "lerp" };
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[m[k] || k] = v;
  return out;
}

document.addEventListener("DOMContentLoaded", async () => {
  const enabledEl = document.getElementById("enabled");
  const packEl    = document.getElementById("pack");
  const pickerEl  = document.querySelector(".picker");
  const searchBtn = pickerEl ? pickerEl.querySelector(".glass") : null;
  const searchEl  = document.getElementById("packSearch");
  const searchListEl = document.getElementById("packSuggestions");
  const shuffleBtn = document.querySelector(".shuffle");

  // Normalize pack <option>s: sort by Pokédex number and label as "###-Name"
  function titleCaseSlug(name) {
    return String(name || "")
      .split("-")
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
  }
  function formatPackLabel(val) {
    // val looks like "retro/gen-1/009-blastoise"
    const last = (val || "").split("/").pop() || "";
    const dash = last.indexOf("-");
    const numStr = dash >= 0 ? last.slice(0, dash) : last;
    const nameSlug = dash >= 0 ? last.slice(dash + 1) : "";
    const num = (numStr || "").padStart(3, "0");
    const name = nameSlug ? titleCaseSlug(nameSlug) : last;
    return `${num}-${name}`;
  }
  function dexFromValue(val) {
    const last = (val || "").split("/").pop() || "";
    const n = parseInt(last, 10);
    return Number.isFinite(n) ? n : 9999;
  }
  const PACK_META = [];
  function normalizePackOptions() {
    if (!packEl) return;
    const opts = Array.from(packEl.options).map(o => ({ value: o.value }));
    // sort numerically by dex
    opts.sort((a, b) => dexFromValue(a.value) - dexFromValue(b.value));
    // preserve current selection
    const current = packEl.value;
    // rebuild options with formatted labels
    packEl.innerHTML = "";
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = formatPackLabel(o.value);
      packEl.appendChild(opt);
    }
    // restore selection if possible
    if (current) packEl.value = current;
    capturePackMeta();
  }

  // Dynamically build the pack list from a generated index.json; fallback to existing options on error
  async function populatePacksFromIndex(storedValue) {
    try {
      const data = await window.settingsApi.listPacks();
      const list = (data && data.retro) || [];
      if (!Array.isArray(list) || !list.length) throw new Error('index empty');

      const current = storedValue || packEl.value;
      packEl.innerHTML = '';
      for (const item of list) {
        const opt = document.createElement('option');
        opt.value = item.id;                       // e.g., "retro/gen-1/009-blastoise"
        opt.textContent = item.name || formatPackLabel(item.id);
        packEl.appendChild(opt);
      }
      capturePackMeta();
      if (current) {
        packEl.value = current;
        if (packEl.selectedIndex === -1 && packEl.options.length) {
          packEl.selectedIndex = 0;
        }
      }
      return true;
    } catch (e) {
      // Defer to static HTML options if index missing
      return false;
    }
  }

  // Sliders + readouts
  const scaleEl   = document.getElementById("scale");
  const offsetEl  = document.getElementById("offset");
  const lerpEl    = document.getElementById("lerp");

  const scaleVal  = document.getElementById("scaleVal");
  const offsetVal = document.getElementById("offsetVal");
  const lerpVal   = document.getElementById("lerpVal");
  const previewSpriteEl = document.getElementById("previewSprite");

  // Defaults align with current content.js constants
  const DEFAULTS = {
    vcp1_scale: 1.25,   // SCALE
    vcp1_offset: 30,    // OFFSET_PX
    vcp1_lerp: 0.20     // LERP_ALPHA (lower = floatier/slower follow)
  };

  // --- Hot-path local writes + dragging signal for smooth live updates ---
  const setLocal = (patch) => window.settingsApi.setSettings(mapKeys(patch));

  // Forward live config patches to the overlay via the settings API
  function pushConfig(patch, { flush = false } = {}) {
    window.settingsApi.setSettings(mapKeys(patch));
  }

  const asNum = (v) => Number(v);

  // Load saved settings
  const res = await window.settingsApi.getSettings();
  {
      enabledEl.checked = !!res.enabled;
      const storedPack  = res.pack || DEFAULT_PACK;

      const scale  = (typeof res.scale  === "number") ? res.scale  : DEFAULTS.vcp1_scale;
      const offset = (typeof res.offset === "number") ? res.offset : DEFAULTS.vcp1_offset;
      const lerp   = (typeof res.lerp   === "number") ? res.lerp   : DEFAULTS.vcp1_lerp;

      scaleEl.value  = String(scale);
      offsetEl.value = String(offset);

      // UI shows speed as 0.5–5.0 (×10 of internal lerp 0.05–0.50)
      const lerpUI = lerp * 10;
      lerpEl.value = String(lerpUI.toFixed(1));

      scaleVal.textContent  = scale.toFixed(2) + "×";
      offsetVal.textContent = offset + " px";
      lerpVal.textContent   = lerpUI.toFixed(1);

      // Prefer dynamic index.json; fallback to static options then normalize labels/order
      (async () => {
        const ok = await populatePacksFromIndex(storedPack);
        if (!ok) {
          // Use whatever is in HTML, but fix labels/order
          normalizePackOptions();
          packEl.value = storedPack;
          if (packEl.selectedIndex === -1 && packEl.options.length) packEl.selectedIndex = 0;
        }
        setPreviewForPack(packEl.value);
      })();
  }

  // Helper: save but do NOT auto-close (except when toggling enable)
  const save = (obj) => window.settingsApi.setSettings(mapKeys(obj));

  // Toggle enable — close popup (people expect immediate feedback here)
  enabledEl.addEventListener("change", () => {
    save({ vcp1_enabled: enabledEl.checked });
    window.close();
  });

  // Pack select — save but keep popup open, and update preview
  packEl.addEventListener("change", () => {
    save({ vcp1_pack: packEl.value });
    setPreviewForPack(packEl.value);
  });

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      if (!packEl || !packEl.options.length) return;
      const total = packEl.options.length;
      if (!total) return;
      const current = packEl.selectedIndex >= 0 ? packEl.selectedIndex : 0;
      let next = Math.floor(Math.random() * total);
      if (total > 1 && next === current) {
        next = (next + 1) % total;
      }
      packEl.selectedIndex = next;
      packEl.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", () => openPackSearch());
    searchBtn.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        openPackSearch();
      }
    });
  }

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      searchEl.classList.remove("no-match");
    });
    searchEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        commitPackSearch();
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        closePackSearch();
      }
    });
    searchEl.addEventListener("change", () => {
      if (searchEl.value.trim()) commitPackSearch();
    });
    searchEl.addEventListener("blur", () => {
      // Allow other handlers (change) to fire before closing
      setTimeout(() => {
        if (isSearchOpen()) closePackSearch();
      }, 0);
    });
  }

  // function clampFrom helper
  function clampFrom(el) {
    const v = Number(el.value);
    const min = Number(el.min);
    const max = Number(el.max);
    if (!Number.isFinite(v)) {
      if (Number.isFinite(min)) return min;
      if (Number.isFinite(max)) return max;
      return 0;
    }
    if (Number.isFinite(min) && v < min) return min;
    if (Number.isFinite(max) && v > max) return max;
    return v;
  }

  function isPartialNumber(value) {
    return value === "" || value.endsWith(".");
  }

  // --- Preview sprite helpers (robust URL + fallback) ---
  function slugFromPack(pack) {
    // "retro/gen-1/009-blastoise" -> "blastoise"
    const last = (pack || "").split("/").pop() || "";
    return last.replace(/^\d+-/, "");
  }

  function generationFromPack(pack) {
    const parts = (pack || "").split("/");
    if (parts.length < 3) return null;
    const maybe = parts[parts.length - 2] || "";
    return maybe.startsWith("gen-") ? maybe : null;
  }

  function setPreviewForPack(pack) {
    if (!previewSpriteEl) return;

    // Ensure preview never mirrors even if other CSS flips the main sprite
    previewSpriteEl.style.transform = "scaleX(1)";

    const slugFull = (pack || "").split("/").pop() || "";
    const slug = slugFromPack(pack);
    const slugCompact = slugFull.replace(/-/g, "");
    const names = Array.from(new Set([slugFull, slug, slugCompact]));
    const generation = generationFromPack(pack);
    const candidates = [];
    const pushCandidate = (path) => {
      if (!candidates.includes(path)) candidates.push(path);
    };
    for (const name of names) {
      if (generation) {
        pushCandidate("app://bundle/" + (`assets/ui/${generation}/${name}.png`));
      }
      pushCandidate("app://bundle/" + (`assets/ui/${name}.png`));
      pushCandidate("app://bundle/" + (`assets/retro/${name}.png`));
    }

    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) {
        previewSpriteEl.removeAttribute("src");
        previewSpriteEl.alt = "";
        return;
      }
      const url = candidates[i++];
      const img = new Image();
      img.onload = () => {
        previewSpriteEl.src = url;
        previewSpriteEl.alt = `${slug} preview`;
      };
      img.onerror = tryNext;
      img.src = url;
    };

    tryNext();
  }

  // --- Pack search helpers (magnifying glass action) ---
  function normalizeSearch(str) {
    return (str || "").toLowerCase();
  }
  function compactSearch(str) {
    return normalizeSearch(str).replace(/[^a-z0-9]/g, "");
  }

  function rebuildSearchSuggestions() {
    if (!searchListEl) return;
    searchListEl.innerHTML = "";

    const seen = new Set();
    for (const meta of PACK_META) {
      const display = (meta.display && meta.display.trim()) ||
        (meta.label && meta.label.trim()) ||
        (meta.name && meta.name.trim()) ||
        meta.id;
      if (!display || seen.has(display)) continue;
      seen.add(display);
      const opt = document.createElement("option");
      opt.value = display;
      searchListEl.appendChild(opt);
    }
  }

  function capturePackMeta() {
    PACK_META.length = 0;
    if (!packEl) return;
    const opts = Array.from(packEl.options);
    for (const opt of opts) {
      const id = opt.value;
      const label = opt.textContent || formatPackLabel(id);
      const dex = dexFromValue(id);
      const dexStr = Number.isFinite(dex) ? String(dex).padStart(3, "0") : "";
      const formatted = formatPackLabel(id);
      const labelTrimmed = (label || "").replace(/^\s*\d+\s*[-#]?\s*/, "").replace(/\s*\(#\d+\)\s*$/, "").trim();
      const fallbackName = (formatted || "").replace(/^\s*\d+\s*[-#]?\s*/, "").trim();
      const name = labelTrimmed || fallbackName || label || id;
      const lowerName = normalizeSearch(name);
      const lowerLabel = normalizeSearch(label);
      const lowerId = normalizeSearch(id);
      const compactName = compactSearch(name);
      const compactLabel = compactSearch(label);
      const compactId = compactSearch(id);
      const display = dexStr ? `#${dexStr} ${name}` : name;
      const values = new Set([
        lowerName,
        compactName,
        lowerLabel,
        compactLabel,
        lowerId,
        compactId
      ]);
      if (formatted) {
        values.add(normalizeSearch(formatted));
        values.add(compactSearch(formatted));
      }
      if (display) {
        values.add(normalizeSearch(display));
        values.add(compactSearch(display));
      }
      if (dexStr) {
        values.add(String(dex));
        values.add(dexStr);
        values.add(`#${dexStr}`);
      }
      values.delete("");
      PACK_META.push({
        id,
        label,
        name,
        display,
        dex,
        dexStr,
        searchValues: Array.from(values)
      });
    }
    rebuildSearchSuggestions();
  }

  function resolveSearchTerm(term) {
    const raw = (term || "").trim();
    if (!raw) return null;

    const digits = raw.replace(/[^0-9]/g, "");
    if (digits) {
      const num = parseInt(digits, 10);
      if (Number.isFinite(num)) {
        const byDex = PACK_META.find(meta => meta.dex === num);
        if (byDex) return byDex.id;
      }
    }

    const lower = normalizeSearch(raw);
    const compact = compactSearch(raw);

    const exact = PACK_META.find(meta =>
      meta.searchValues.some(val => val === lower || val === compact)
    );
    if (exact) return exact.id;

    const partial = PACK_META.find(meta =>
      meta.searchValues.some(val => val.includes(compact) || val.includes(lower))
    );
    return partial ? partial.id : null;
  }

  function isSearchOpen() {
    return !!(pickerEl && pickerEl.classList.contains("searching"));
  }

  function openPackSearch() {
    if (!pickerEl || !searchEl) return;
    if (!PACK_META.length) capturePackMeta();
    if (isSearchOpen()) {
      searchEl.focus();
      searchEl.select();
      return;
    }
    pickerEl.classList.add("searching");
    if (packEl) packEl.setAttribute("aria-hidden", "true");
    searchEl.value = "";
    searchEl.classList.remove("no-match");
    searchEl.placeholder = "Search name or #";
    requestAnimationFrame(() => {
      searchEl.focus();
    });
  }

  function closePackSearch() {
    if (!pickerEl || !searchEl) return;
    const wasOpen = isSearchOpen();
    pickerEl.classList.remove("searching");
    if (packEl) packEl.removeAttribute("aria-hidden");
    searchEl.classList.remove("no-match");
    searchEl.value = "";
    if (wasOpen && document.activeElement === searchEl && packEl) {
      packEl.focus();
    }
  }

  function commitPackSearch() {
    if (!searchEl || !packEl) return;
    const term = searchEl.value.trim();
    if (!term) {
      closePackSearch();
      return;
    }
    const matchId = resolveSearchTerm(term);
    if (!matchId) {
      searchEl.classList.add("no-match");
      return;
    }
    searchEl.classList.remove("no-match");
    closePackSearch();
    packEl.value = matchId;
    packEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function attachEnterCommit(input, commitFn) {
    if (!input) return;
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        commitFn({ flush: true });
      }
    });
  }

  // Scale
  function previewScale() {
    const raw = scaleEl.value.trim();
    if (isPartialNumber(raw)) {
      scaleVal.textContent = raw;
      return;
    }
    const num = Number(raw);
    if (Number.isFinite(num)) {
      scaleVal.textContent = num.toFixed(2) + "×";
    } else {
      scaleVal.textContent = raw;
    }
  }
  function commitScale({ flush = false } = {}) {
    const v = clampFrom(scaleEl);
    const normalized = Number.isFinite(v) ? Number(v.toFixed(2)) : DEFAULTS.vcp1_scale;
    scaleEl.value = normalized.toFixed(2);
    scaleVal.textContent = normalized.toFixed(2) + "×";
    setLocal({ vcp1_scale: normalized });
    pushConfig({ vcp1_scale: normalized }, { flush });
  }
  scaleEl.addEventListener("input", previewScale);
  scaleEl.addEventListener("change", () => commitScale({ flush: true }));
  attachEnterCommit(scaleEl, commitScale);

  // Offset
  function previewOffset() {
    const raw = offsetEl.value.trim();
    offsetVal.textContent = raw ? raw + " px" : "";
  }
  function commitOffset({ flush = false } = {}) {
    const v = clampFrom(offsetEl);
    const normalized = Number.isFinite(v) ? Math.round(v) : Math.round(DEFAULTS.vcp1_offset);
    offsetEl.value = String(normalized);
    offsetVal.textContent = normalized + " px";
    setLocal({ vcp1_offset: normalized });
    pushConfig({ vcp1_offset: normalized }, { flush });
  }
  offsetEl.addEventListener("input", previewOffset);
  offsetEl.addEventListener("change", () => commitOffset({ flush: true }));
  attachEnterCommit(offsetEl, commitOffset);

  // Lerp
  function previewLerp() {
    const raw = lerpEl.value.trim();
    if (isPartialNumber(raw)) {
      lerpVal.textContent = raw ? raw : "";
      return;
    }
    const num = Number(raw);
    if (Number.isFinite(num)) {
      lerpVal.textContent = num.toFixed(1);
    } else {
      lerpVal.textContent = raw;
    }
  }
  function commitLerp({ flush = false } = {}) {
    const ui = clampFrom(lerpEl);
    const normalized = Number.isFinite(ui) ? Number(ui.toFixed(1)) : Number((DEFAULTS.vcp1_lerp * 10).toFixed(1));
    lerpEl.value = normalized.toFixed(1);
    lerpVal.textContent = normalized.toFixed(1);
    const lerp = normalized / 10;              // internal 0.05–0.50
    setLocal({ vcp1_lerp: lerp });
    pushConfig({ vcp1_lerp: lerp }, { flush });
  }
  lerpEl.addEventListener("input", previewLerp);
  lerpEl.addEventListener("change", () => commitLerp({ flush: true }));
  attachEnterCommit(lerpEl, commitLerp);

  // Removed dragging pointer event listeners for sliders since number inputs do not need them

  // Safety: end dragging if mouse released outside
  // document.addEventListener("pointerup", () => setDragging(false));

  // ===== TRIANGLES (▲/▼) — JS-only wiring, no HTML changes required =====

  // Find the number input associated with a triangle within the same .triple block
  function inputForTriangle(el) {
    const triple = el.closest(".triple");
    if (!triple) return null;
    // Prefer an explicit number input inside the triple
    return triple.querySelector('input[type="number"]');
  }

  // Use native stepUp/stepDown so min/max/step are respected
  function nudgeInput(input, dir /* 'up' | 'down' */) {
    if (!input) return;
    if (dir === "down") input.stepDown();
    else input.stepUp();
    // Live update and persist via existing handlers
    input.dispatchEvent(new Event("input",  { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Press-and-hold repeat
  let holdT = null, rptT = null, holdInput = null, holdDir = "up";

  function stopHold() {
    if (holdT) { clearTimeout(holdT); holdT = null; }
    if (rptT)  { clearInterval(rptT); rptT = null; }
    holdInput = null;
  }

  document.addEventListener("mousedown", (e) => {
    const caret = e.target.closest(".arrowStack .caret");
    if (!caret) return;

    const input = inputForTriangle(caret);
    if (!input) return;

    holdInput = input;
    holdDir = caret.classList.contains("down") ? "down" : "up";

    // First tick immediately
    nudgeInput(holdInput, holdDir);

    // Then start repeating
    stopHold();
    holdT = setTimeout(() => {
      rptT = setInterval(() => nudgeInput(holdInput, holdDir), 90);
    }, 250);
  }, true);

  // Keyboard support for triangles: Space/Enter nudges once
  document.addEventListener("keydown", (e) => {
    const caret = e.target.closest(".arrowStack .caret");
    if (!caret) return;
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    const input = inputForTriangle(caret);
    const dir = caret.classList.contains("down") ? "down" : "up";
    nudgeInput(input, dir);
  }, true);

  window.addEventListener("mouseup", stopHold, true);
  window.addEventListener("mouseleave", stopHold, true);
  window.addEventListener("blur", stopHold, true);

  // ===== CHEVRONS (◀/▶) — cycle the <select id="pack"> and trigger existing change flow =====
  document.addEventListener("click", (e) => {
    const left  = e.target.closest(".preview .chev.left");
    const right = e.target.closest(".preview .chev.right");
    if (!left && !right) return;

    const dir = right ? +1 : -1;
    const total = packEl.options.length;
    let idx = packEl.selectedIndex;
    if (idx < 0) idx = 0;
    idx = (idx + dir + total) % total;

    packEl.selectedIndex = idx;
    packEl.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // ESC to close (QoL)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (isSearchOpen()) {
        e.preventDefault();
        closePackSearch();
        return;
      }
      window.close();
    }
  });
});
