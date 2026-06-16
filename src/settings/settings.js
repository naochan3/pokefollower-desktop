function mapKeys(obj) {
  const m = { vcp1_enabled: "enabled", vcp1_pack: "pack", vcp1_scale: "scale", vcp1_offset: "offset", vcp1_lerp: "lerp" };
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[m[k] || k] = v;
  return out;
}

document.addEventListener("DOMContentLoaded", async () => {
  const enabledEl = document.getElementById("enabled");

  // Sliders + readouts
  const scaleEl   = document.getElementById("scale");
  const offsetEl  = document.getElementById("offset");
  const lerpEl    = document.getElementById("lerp");

  const scaleVal  = document.getElementById("scaleVal");
  const offsetVal = document.getElementById("offsetVal");
  const lerpVal   = document.getElementById("lerpVal");

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
  }

  // Helper: save but do NOT auto-close
  const save = (obj) => window.settingsApi.setSettings(mapKeys(obj));

  // Toggle enable — save and keep the settings window open
  enabledEl.addEventListener("change", () => {
    save({ vcp1_enabled: enabledEl.checked });
  });

  // --- カタカナ⇄ひらがな正規化（検索用） ---
  function toHira(s) {
    return String(s || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }
  function tileSearchText(p) {
    const num = p.num == null ? "" : String(p.num);
    const padded = num ? num.padStart(3, "0") : "";
    return [p.ja, toHira(p.ja), p.romaji, p.en, num, padded, "#" + padded].join(" ").toLowerCase();
  }

  async function initGrid() {
    const gridEl = document.getElementById("grid");
    const searchEl = document.getElementById("search");
    if (!gridEl) return;
    const packs = await window.settingsApi.listPacks();
    let selectedId = res.pack;

    const frag = document.createDocumentFragment();
    const tiles = [];
    for (const p of packs) {
      const gen = p.id.split("/")[1];               // gen-1
      const slug = p.id.split("/").pop();           // 009-blastoise
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tile" + (p.id === selectedId ? " selected" : "");
      btn.dataset.id = p.id;
      btn.dataset.search = tileSearchText(p);
      const numStr = p.num == null ? "" : String(p.num).padStart(3, "0");
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = p.ja || p.en || slug;
      img.src = `app://bundle/assets/ui/${gen}/${slug}.png`;
      img.addEventListener("error", () => { img.style.visibility = "hidden"; });
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.ja || p.en || slug;
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = numStr ? "#" + numStr : "";
      btn.append(img, name, num);
      btn.addEventListener("click", () => {
        if (p.id === selectedId) return;
        selectedId = p.id;
        for (const t of tiles) t.classList.toggle("selected", t.dataset.id === selectedId);
        window.settingsApi.setSettings({ pack: p.id });
      });
      tiles.push(btn);
      frag.appendChild(btn);
    }
    gridEl.appendChild(frag);

    // 初期選択をスクロールして見せる
    const sel = tiles.find((t) => t.classList.contains("selected"));
    if (sel) sel.scrollIntoView({ block: "center" });

    if (searchEl) {
      searchEl.addEventListener("input", () => {
        const q = toHira(searchEl.value.trim().toLowerCase());
        const raw = searchEl.value.trim().toLowerCase();
        for (const t of tiles) {
          const hay = t.dataset.search;
          const match = !raw || hay.includes(raw) || hay.includes(q);
          t.classList.toggle("hidden", !match);
        }
      });
    }
  }

  initGrid();

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

  // ESC to close (QoL)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.close();
    }
  });
});
