// 世代導出ヘルパ（canonical・ユニットテスト対象）
// NOTE: BOUNDS 配列を変更する場合は settings.js の GEN_BOUNDS も同期すること
const BOUNDS = [151,251,386,493,649,721,809,905,1025];
export function genOfDex(dex){
  for (let i=0;i<BOUNDS.length;i++) if (dex <= BOUNDS[i]) return i+1;
  return BOUNDS.length;
}
