const BOUNDS = [151,251,386,493,649,721,809,905,1025];
export function genOfDex(dex){
  for (let i=0;i<BOUNDS.length;i++) if (dex <= BOUNDS[i]) return i+1;
  return BOUNDS.length;
}
