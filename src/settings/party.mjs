// 手持ち（最大6・先頭=相棒）の純操作。UIと設定保存の両方から使う。
export const PARTY_MAX = 6;

export function isFull(party) {
  return (party || []).length >= PARTY_MAX;
}

export function addToParty(party, id) {
  const p = Array.isArray(party) ? party.slice() : [];
  if (!id || p.includes(id) || p.length >= PARTY_MAX) return p;
  p.push(id);
  return p;
}

export function removeFromParty(party, id) {
  return (Array.isArray(party) ? party : []).filter((x) => x !== id);
}

export function replaceInParty(party, slotId, newId) {
  const p = Array.isArray(party) ? party.slice() : [];
  if (!newId || p.includes(newId)) return p;
  const i = p.indexOf(slotId);
  if (i === -1) return p;
  p[i] = newId;
  return p;
}

export function setLead(party, id) {
  const p = Array.isArray(party) ? party.slice() : [];
  const i = p.indexOf(id);
  if (i <= 0) return p;
  p.splice(i, 1);
  p.unshift(id);
  return p;
}
