// matchTile — タイルが現在の選択条件に合致するか判定する純関数
export function matchTile(tile, sel) {
  const isForm = !!tile.region;
  if (sel.kind === "normal" && isForm) return false;
  if (sel.kind === "forms" && !isForm) return false;
  if (sel.kind === "normal") {
    if (sel.gen !== "all" && String(tile.gen) !== String(sel.gen)) return false;
  } else {
    if (sel.region !== "all" && tile.region !== sel.region) return false;
  }
  if (sel.type && sel.type !== "all") {
    const types = Array.isArray(tile.types) ? tile.types : [];
    if (!types.includes(sel.type)) return false;
  }
  if (sel.q && !tile.search.includes(sel.q)) return false;
  return true;
}
