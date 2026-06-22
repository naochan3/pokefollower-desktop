import { typeColor, typeJa, TYPE_COLORS } from "./type-colors.mjs";
import { PARTY_MAX, addToParty, removeFromParty, replaceInParty, isFull } from "./party.mjs";
import { matchTile } from "./filter.mjs";
import { mountIdleSprite } from "./sprite-view.mjs";

// 設定ストアのキーへ正規化する（vcp1_* 接頭辞のものだけ変換。既にストア形なら素通り）。
function mapKeys(obj) {
  const m = {
    vcp1_enabled: "enabled",
    vcp1_pack: "pack",
    vcp1_favorite_packs: "favoritePacks",
    vcp1_scale: "scale",
    vcp1_offset: "offset",
    vcp1_lerp: "lerp",
    vcp1_notification_companion: "notificationCompanionEnabled",
  };
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[m[k] || k] = v;
  return out;
}

// 世代導出ヘルパ — gen-util.js の ESM 版と同一ロジック（パッケージング耐性のためインライン化）
// NOTE: gen-util.js の BOUNDS 配列を変更する場合はここも同期すること
const GEN_BOUNDS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const generationLabelsApi = window.PokeFollowerGenerationLabels || {};
const generationLabelFor = generationLabelsApi.generationLabelFor || (() => null);
function genOfDex(dex) {
  for (let i = 0; i < GEN_BOUNDS.length; i++) if (dex <= GEN_BOUNDS[i]) return i + 1;
  return GEN_BOUNDS.length;
}

// カタカナ⇄ひらがな正規化（検索用）
function toHira(s) {
  return String(s || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
function tileSearchText(p) {
  const num = p.num == null ? "" : String(p.num);
  const padded = num ? num.padStart(3, "0") : "";
  return [p.ja, toHira(p.ja), p.romaji, p.en, num, padded, "#" + padded].join(" ").toLowerCase();
}

// 既定値（content.js の定数に合わせる）
const DEFAULTS = {
  vcp1_scale: 1.25,   // SCALE
  vcp1_offset: 70,    // OFFSET_PX
  vcp1_lerp: 0.20,    // LERP_ALPHA (lower = floatier/slower follow)
  vcp1_favorite_packs: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  // ───── 共有 state ─────
  let settings = await window.settingsApi.getSettings();
  const packs = await window.settingsApi.listPacks();
  const packById = new Map(packs.map((p) => [p.id, p]));

  // 現在の相棒 = active pack（無ければ手持ち先頭）
  function activePackId() {
    const party = currentParty();
    if (typeof settings.pack === "string" && settings.pack) return settings.pack;
    return party[0] || null;
  }
  function currentParty() {
    return Array.isArray(settings.favoritePacks) ? settings.favoritePacks.slice() : [];
  }
  function nicknameOf(id) {
    const nn = settings.nicknames && typeof settings.nicknames === "object" ? settings.nicknames : {};
    const v = nn[id];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }

  // settings:set はストア形キーを取るので mapKeys で整える
  const save = (obj) => window.settingsApi.setSettings(mapKeys(obj));
  // ストア全体を再取得して全パネルを描き直す
  async function refreshSettings(next) {
    settings = next || (await window.settingsApi.getSettings());
    renderHero();
    renderPartyRows();
    updateTileMarkers();
  }

  // ═══════════════ タブ切替 ═══════════════
  (function initTabs() {
    const tabs = document.getElementById("tabs");
    const panels = { aibou: "panel-aibou", box: "panel-box", settings: "panel-settings" };
    function show(name) {
      for (const [k, id] of Object.entries(panels)) {
        const p = document.getElementById(id);
        if (p) p.hidden = (k !== name);
      }
      for (const b of tabs.querySelectorAll(".tab")) {
        const on = b.dataset.tab === name;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      }
    }
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (b) show(b.dataset.tab);
    });
    window.__showTab = show;       // 内部利用（空きスロット→ボックスへ等）
    show("aibou");
  })();
  function gotoBox() { if (window.__showTab) window.__showTab("box"); }

  // ═══════════════ あいぼう: ヒーロー大表示 ═══════════════
  const heroSpriteEl = document.getElementById("heroSprite");
  const heroNameEl = document.getElementById("heroName");
  const heroNumEl = document.getElementById("heroNum");
  const heroTypesEl = document.getElementById("heroTypes");
  let heroStop = null;          // 現在再生中アニメの停止関数
  let heroMountedId = null;     // 二重マウント防止

  async function renderHero() {
    const id = activePackId();
    const p = id ? packById.get(id) : null;

    // 名前 / 番号 / タイプチップ（list メタから）
    heroNameEl.textContent = nicknameOf(id) || (p && p.ja) || (p && p.en) || "—";
    if (p && p.num != null) heroNumEl.textContent = "#" + String(p.num).padStart(3, "0");
    else heroNumEl.textContent = "#000";
    heroTypesEl.innerHTML = "";
    const types = p && Array.isArray(p.types) ? p.types : [];
    for (const t of types) {
      const chip = document.createElement("span");
      chip.className = "type-chip";
      chip.textContent = typeJa(t);
      chip.style.backgroundColor = typeColor(t);
      heroTypesEl.appendChild(chip);
    }

    // スプライトアニメ（相棒が変わった時だけ貼り直す）
    if (id && id !== heroMountedId) {
      if (heroStop) { heroStop(); heroStop = null; }
      heroMountedId = id;
      const meta = await window.settingsApi.getPackMeta(id);
      // getPackMeta は { resolvedKey, meta } を返す。mountIdleSprite は packMeta.meta を見る。
      heroSpriteEl.style.backgroundImage = "";
      heroStop = mountIdleSprite(heroSpriteEl, meta, { row: 0 });
    } else if (!id) {
      if (heroStop) { heroStop(); heroStop = null; }
      heroMountedId = null;
    }
  }

  // あだ名編集
  const nicknameEditEl = document.getElementById("nicknameEdit");
  if (nicknameEditEl) {
    nicknameEditEl.addEventListener("click", async () => {
      const id = activePackId();
      if (!id) return;
      const current = nicknameOf(id) || "";
      const input = window.prompt("あだ名を入力（空で解除）", current);
      if (input === null) return; // キャンセル
      const next = await window.settingsApi.setNickname(id, input.trim());
      await refreshSettings(next);
    });
  }

  // ═══════════════ 手持ち列（あいぼう/ボックス共有） ═══════════════
  const partyRowAibouEl = document.getElementById("partyRowAibou");
  const partyRowBoxEl = document.getElementById("partyRowBox");

  // 置き換えモード（ボックスで満員時タイルをタップした後の状態）
  let replaceMode = false;
  let replacePendingId = null;

  function makeSlot(id, index) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "party-slot";
    slot.dataset.id = id;
    if (index === 0) slot.classList.add("lead");
    const p = packById.get(id);
    const img = document.createElement("img");
    img.alt = (p && (nicknameOf(id) || p.ja || p.en)) || id;
    img.loading = "lazy";
    img.src = tileImageCandidates(id)[0] || "";
    const cands = tileImageCandidates(id);
    let ci = 0;
    img.addEventListener("error", () => {
      ci += 1;
      if (ci < cands.length) img.src = cands[ci];
      else img.style.visibility = "hidden";
    });
    slot.appendChild(img);
    // 除去ボタン
    const rm = document.createElement("span");
    rm.className = "party-remove";
    rm.textContent = "×";
    rm.title = "手持ちから外す";
    slot.appendChild(rm);
    return slot;
  }
  function makeEmptySlot() {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "party-slot empty";
    slot.textContent = "＋";
    slot.title = "ボックスから追加";
    return slot;
  }

  function renderPartyInto(container) {
    if (!container) return;
    container.innerHTML = "";
    const party = currentParty();
    for (let i = 0; i < PARTY_MAX; i++) {
      const id = party[i];
      if (id) container.appendChild(makeSlot(id, i));
      else container.appendChild(makeEmptySlot());
    }
    container.classList.toggle("replacing", replaceMode && container === partyRowBoxEl);
  }
  function renderPartyRows() {
    renderPartyInto(partyRowAibouEl);
    renderPartyInto(partyRowBoxEl);
  }

  // 手持ちスロットのクリック（除去 / 相棒化 / 置き換え確定 / 空き→ボックス）を委譲
  async function onPartyContainerClick(e) {
    const container = e.currentTarget;
    const slot = e.target.closest(".party-slot");
    if (!slot) return;

    // 空きスロット → ボックスタブへ
    if (slot.classList.contains("empty")) {
      cancelReplaceMode();
      gotoBox();
      return;
    }
    const id = slot.dataset.id;

    // ボックス側で置き換えモード中ならスロットを置換先に
    if (replaceMode && container === partyRowBoxEl) {
      const party = currentParty();
      const pendingId = replacePendingId;
      const replacedLead = party[0] === id;
      const next = replaceInParty(party, id, pendingId);
      cancelReplaceMode();
      if (replacedLead && next[0] === pendingId) {
        // 先頭スロットを入れ替えた → 相棒も切り替える
        save({ favoritePacks: next, pack: pendingId });
        await refreshSettings({ ...settings, favoritePacks: next, pack: pendingId });
      } else {
        save({ favoritePacks: next });
        await refreshSettings({ ...settings, favoritePacks: next });
      }
      return;
    }

    // × クリック → 手持ちから外す
    if (e.target.classList.contains("party-remove")) {
      const party = currentParty();
      const wasLead = party[0] === id;
      const next = removeFromParty(party, id);
      if (wasLead && next.length > 0) {
        // 先頭を外したら新しい先頭(next[0])を相棒にする。favoritePacks と pack を同時に保存。
        save({ favoritePacks: next, pack: next[0] });
        await refreshSettings({ ...settings, favoritePacks: next, pack: next[0] });
      } else {
        save({ favoritePacks: next });
        await refreshSettings({ ...settings, favoritePacks: next });
      }
      return;
    }

    // 通常タップ → そのスロットを相棒（先頭）にする
    const updated = await window.settingsApi.setLead(id);
    await refreshSettings(updated);
  }
  if (partyRowAibouEl) partyRowAibouEl.addEventListener("click", onPartyContainerClick);
  if (partyRowBoxEl) partyRowBoxEl.addEventListener("click", onPartyContainerClick);

  function cancelReplaceMode() {
    replaceMode = false;
    replacePendingId = null;
    if (partyRowBoxEl) partyRowBoxEl.classList.remove("replacing");
    hideReplaceHint();
  }
  function enterReplaceMode(id) {
    replaceMode = true;
    replacePendingId = id;
    if (partyRowBoxEl) partyRowBoxEl.classList.add("replacing");
    showReplaceHint();
  }
  let replaceHintEl = null;
  function showReplaceHint() {
    if (!partyRowBoxEl) return;
    if (!replaceHintEl) {
      replaceHintEl = document.createElement("p");
      replaceHintEl.className = "replace-hint section-label";
      replaceHintEl.textContent = "入れ替える手持ちをえらんでください";
      partyRowBoxEl.insertAdjacentElement("afterend", replaceHintEl);
    }
    replaceHintEl.hidden = false;
  }
  function hideReplaceHint() {
    if (replaceHintEl) replaceHintEl.hidden = true;
  }
  // 手持ち列・グリッド以外をクリックしたら置き換えモードを解除
  document.addEventListener("click", (e) => {
    if (!replaceMode) return;
    if (e.target.closest("#partyRowBox") || e.target.closest("#grid")) return;
    cancelReplaceMode();
  });

  // ═══════════════ あいぼう: スライダー（旧ロジック流用） ═══════════════
  const scaleEl = document.getElementById("scale");
  const offsetEl = document.getElementById("offset");
  const lerpEl = document.getElementById("lerp");
  const scaleVal = document.getElementById("scaleVal");
  const offsetVal = document.getElementById("offsetVal");
  const lerpVal = document.getElementById("lerpVal");

  function pushConfig(patch) { save(patch); }

  {
    const scale  = (typeof settings.scale  === "number") ? settings.scale  : DEFAULTS.vcp1_scale;
    const offset = (typeof settings.offset === "number") ? settings.offset : DEFAULTS.vcp1_offset;
    const lerp   = (typeof settings.lerp   === "number") ? settings.lerp   : DEFAULTS.vcp1_lerp;
    scaleEl.value  = String(scale);
    offsetEl.value = String(offset);
    // UI shows speed as 0.5–5.0 (×10 of internal lerp 0.05–0.50)
    const lerpUI = lerp * 10;
    lerpEl.value = String(lerpUI.toFixed(1));
    scaleVal.textContent  = scale.toFixed(2) + "×";
    offsetVal.textContent = offset + " px";
    lerpVal.textContent   = lerpUI.toFixed(1);
  }

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
    if (isPartialNumber(raw)) { scaleVal.textContent = raw; return; }
    const num = Number(raw);
    scaleVal.textContent = Number.isFinite(num) ? num.toFixed(2) + "×" : raw;
  }
  function commitScale({ flush = false } = {}) {
    const v = clampFrom(scaleEl);
    const normalized = Number.isFinite(v) ? Number(v.toFixed(2)) : DEFAULTS.vcp1_scale;
    scaleEl.value = normalized.toFixed(2);
    scaleVal.textContent = normalized.toFixed(2) + "×";
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
    pushConfig({ vcp1_offset: normalized }, { flush });
  }
  offsetEl.addEventListener("input", previewOffset);
  offsetEl.addEventListener("change", () => commitOffset({ flush: true }));
  attachEnterCommit(offsetEl, commitOffset);

  // Lerp（UI 0.5–5.0 ↔ 内部 0.05–0.50）
  function previewLerp() {
    const raw = lerpEl.value.trim();
    if (isPartialNumber(raw)) { lerpVal.textContent = raw ? raw : ""; return; }
    const num = Number(raw);
    lerpVal.textContent = Number.isFinite(num) ? num.toFixed(1) : raw;
  }
  function commitLerp({ flush = false } = {}) {
    const ui = clampFrom(lerpEl);
    const normalized = Number.isFinite(ui) ? Number(ui.toFixed(1)) : Number((DEFAULTS.vcp1_lerp * 10).toFixed(1));
    lerpEl.value = normalized.toFixed(1);
    lerpVal.textContent = normalized.toFixed(1);
    const lerp = normalized / 10;              // internal 0.05–0.50
    pushConfig({ vcp1_lerp: lerp }, { flush });
  }
  lerpEl.addEventListener("input", previewLerp);
  lerpEl.addEventListener("change", () => commitLerp({ flush: true }));
  attachEnterCommit(lerpEl, commitLerp);

  // ═══════════════ ボックス: タイル画像候補 ═══════════════
  function tileImageCandidates(id) {
    const parts = id.split("/");
    const dir = parts.slice(1, -1).join("/") || parts[1] || "gen-1";
    const slug = parts[parts.length - 1];
    const slugCompact = slug.replace(/-/g, "");
    const nameOnly = slug.replace(/^[0-9]+-?/, "");
    return [slug, slugCompact, nameOnly]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .map((n) => `app://bundle/assets/ui/${dir}/${n}.png`);
  }

  // ═══════════════ ボックス: グリッド・検索・フィルタ ═══════════════
  const gridEl = document.getElementById("grid");
  const searchEl = document.getElementById("search");
  const genChipsEl = document.getElementById("genChips");
  const typeChipsEl = document.getElementById("typeChips");
  const kindEl = document.getElementById("kind");

  const searchMetadata = await window.settingsApi.getSearchMetadata();
  const searchEngine = window.PokeFollowerSearch;
  const searchIndex = searchEngine ? searchEngine.buildPokemonSearchIndex(packs, searchMetadata) : [];

  let selectedKind = "normal";
  let selectedGen = "all";
  let selectedRegion = "all";
  let selectedType = "all";

  const tiles = [];

  function updateTileMarkers() {
    const party = currentParty();
    const lead = party[0] || null;
    for (const t of tiles) {
      const inParty = party.includes(t.dataset.id);
      t.classList.toggle("favorite", inParty);
      t.classList.toggle("selected", t.dataset.id === lead);
      t.dataset.favorite = inParty ? "true" : "false";
    }
  }

  async function onTileTap(id) {
    const party = currentParty();
    if (party.includes(id)) {
      // 既に手持ち → 相棒（先頭）にする
      cancelReplaceMode();
      const updated = await window.settingsApi.setLead(id);
      await refreshSettings(updated);
      return;
    }
    if (!isFull(party)) {
      const wasEmpty = party.length === 0;
      const next = addToParty(party, id);
      if (wasEmpty) {
        // 空だった → 追加分を相棒に（favoritePacks と pack を同時保存）
        save({ favoritePacks: next, pack: id });
        await refreshSettings({ ...settings, favoritePacks: next, pack: id });
      } else {
        save({ favoritePacks: next });
        await refreshSettings({ ...settings, favoritePacks: next });
      }
      return;
    }
    // 満員 → 置き換えモード
    enterReplaceMode(id);
  }

  function buildGrid() {
    if (!gridEl) return;
    const frag = document.createDocumentFragment();
    for (const p of packs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tile";
      btn.dataset.id = p.id;
      btn.dataset.region = p.region || "";
      btn.dataset.search = tileSearchText(p);
      btn.dataset.gen = p.num != null ? String(genOfDex(p.num)) : "0";
      btn.dataset.types = (Array.isArray(p.types) ? p.types : []).join(",");
      const cands = tileImageCandidates(p.id);
      let ci = 0;
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = p.ja || p.en || p.id;
      img.src = cands[ci];
      img.addEventListener("error", () => {
        ci += 1;
        if (ci < cands.length) img.src = cands[ci];
        else img.style.visibility = "hidden";
      });
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.ja || p.en || p.id;
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = p.num != null ? "#" + String(p.num).padStart(3, "0") : "";
      btn.append(img, name, num);
      btn.addEventListener("click", () => onTileTap(p.id));
      tiles.push(btn);
      frag.appendChild(btn);
    }
    gridEl.appendChild(frag);
    updateTileMarkers();
  }

  // 世代/地方チップ（旧 renderChips を流用）
  function renderChips() {
    if (!genChipsEl) return;
    genChipsEl.innerHTML = "";
    if (selectedKind === "normal") {
      genChipsEl.setAttribute("aria-label", "世代フィルタ");
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "gen-chip active";
      allBtn.dataset.gen = "all";
      allBtn.textContent = "全";
      genChipsEl.appendChild(allBtn);
      for (let g = 1; g <= 9; g++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gen-chip";
        btn.dataset.gen = String(g);
        const label = generationLabelFor(g);
        btn.textContent = label ? label.short : String(g);
        if (label) {
          btn.title = label.title;
          btn.setAttribute("aria-label", label.title);
        }
        genChipsEl.appendChild(btn);
      }
    } else {
      genChipsEl.setAttribute("aria-label", "地方フィルタ");
      const ORDER = ["alola", "galar", "hisui", "paldea"];
      const present = new Set(tiles.map((t) => t.dataset.region).filter(Boolean));
      const regions = ORDER.filter((r) => present.has(r));
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "gen-chip active";
      allBtn.dataset.region = "all";
      allBtn.textContent = "全";
      genChipsEl.appendChild(allBtn);
      const REGION_LABEL = { alola: "アローラ", galar: "ガラル", hisui: "ヒスイ", paldea: "パルデア" };
      for (const r of regions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gen-chip";
        btn.dataset.region = r;
        btn.textContent = REGION_LABEL[r] || r;
        genChipsEl.appendChild(btn);
      }
    }
  }

  // タイプチップ（全 + グリッドに存在するタイプのみ、type-colors で色付け）
  function renderTypeChips() {
    if (!typeChipsEl) return;
    typeChipsEl.innerHTML = "";
    const present = new Set();
    for (const p of packs) for (const t of (Array.isArray(p.types) ? p.types : [])) present.add(t);
    const order = Object.keys(TYPE_COLORS).filter((t) => present.has(t));

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "type-chip-filter active";
    allBtn.dataset.type = "all";
    allBtn.textContent = "全";
    typeChipsEl.appendChild(allBtn);
    for (const t of order) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-chip-filter";
      btn.dataset.type = t;
      btn.textContent = typeJa(t);
      btn.style.borderColor = typeColor(t);
      typeChipsEl.appendChild(btn);
    }
    typeChipsEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".type-chip-filter");
      if (!chip) return;
      selectedType = chip.dataset.type;
      for (const c of typeChipsEl.querySelectorAll(".type-chip-filter")) {
        const on = c.dataset.type === selectedType;
        c.classList.toggle("active", on);
        // active 時は背景を色で塗る（"全" は既定の濃色）
        if (on && c.dataset.type !== "all") c.style.backgroundColor = typeColor(c.dataset.type);
        else c.style.backgroundColor = "";
        c.style.color = on && c.dataset.type !== "all" ? "#fff" : "";
      }
      applyFilter();
    });
  }

  function applyFilter() {
    const raw = searchEl ? searchEl.value.trim().toLowerCase() : "";
    const searchIds = raw && searchEngine
      ? new Set(searchEngine.searchPokemon(searchIndex, raw, searchMetadata).map((r) => r.id))
      : null;
    for (const t of tiles) {
      const types = (t.dataset.types || "").split(",").filter(Boolean);
      let visible = matchTile(
        { id: t.dataset.id, region: t.dataset.region, gen: t.dataset.gen, search: t.dataset.search, types },
        { kind: selectedKind, gen: String(selectedGen), region: selectedRegion, type: selectedType, q: searchIds ? "" : raw }
      );
      // 共有検索エンジンが返した id 集合で追加フィルタ（matchTile は searchIds を見ない）
      if (visible && searchIds && !searchIds.has(t.dataset.id)) visible = false;
      // フォールバック: 検索語がカナの場合のひらがな一致
      if (visible && !searchIds && raw && !t.dataset.search.includes(raw) && !t.dataset.search.includes(toHira(raw))) visible = false;
      t.classList.toggle("hidden", !visible);
    }
  }

  buildGrid();
  renderChips();
  renderTypeChips();

  if (searchEl) searchEl.addEventListener("input", applyFilter);
  if (kindEl) {
    kindEl.addEventListener("change", () => {
      selectedKind = kindEl.value;
      selectedGen = "all";
      selectedRegion = "all";
      renderChips();
      applyFilter();
    });
  }
  if (genChipsEl) {
    genChipsEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".gen-chip");
      if (!chip) return;
      if (selectedKind === "normal") {
        const val = chip.dataset.gen;
        if (!val) return;
        selectedGen = val === "all" ? "all" : Number(val);
        for (const c of genChipsEl.querySelectorAll(".gen-chip")) c.classList.toggle("active", c.dataset.gen === val);
      } else {
        const val = chip.dataset.region;
        if (val === undefined) return;
        selectedRegion = val;
        for (const c of genChipsEl.querySelectorAll(".gen-chip")) c.classList.toggle("active", c.dataset.region === val);
      }
      applyFilter();
    });
  }

  // ═══════════════ せってい ═══════════════
  const enabledEl = document.getElementById("enabled");
  const notificationCompanionEl = document.getElementById("notificationCompanion");
  const testCompanionEl = document.getElementById("testCompanion");
  const exportCodexPetEl = document.getElementById("exportCodexPet");

  if (enabledEl) {
    enabledEl.checked = !!settings.enabled;
    enabledEl.addEventListener("change", () => save({ vcp1_enabled: enabledEl.checked }));
  }
  if (notificationCompanionEl) {
    notificationCompanionEl.checked = !!settings.notificationCompanionEnabled;
    notificationCompanionEl.addEventListener("change", () => {
      save({ vcp1_notification_companion: notificationCompanionEl.checked });
    });
  }
  if (testCompanionEl) {
    testCompanionEl.addEventListener("click", () => window.settingsApi.testCompanionNotification());
  }
  if (exportCodexPetEl) {
    exportCodexPetEl.addEventListener("click", async () => {
      const packKey = activePackId();
      if (!packKey) return;
      exportCodexPetEl.disabled = true;
      exportCodexPetEl.textContent = "...";
      try {
        await window.settingsApi.exportCodexPet(packKey);
        exportCodexPetEl.textContent = "DONE";
      } catch (_) {
        exportCodexPetEl.textContent = "ERR";
      } finally {
        setTimeout(() => {
          exportCodexPetEl.disabled = false;
          exportCodexPetEl.textContent = "EXPORT";
        }, 1200);
      }
    });
  }

  // ═══════════════ 初期描画 ═══════════════
  renderHero();
  renderPartyRows();

  // ESC で閉じる（QoL）
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.close();
  });
});
