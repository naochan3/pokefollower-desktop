import { describe, it, expect } from 'vitest';
import { genOfDex } from '../src/settings/gen-util.js';
describe('genOfDex', () => {
  it.each([[1,1],[151,1],[152,2],[493,4],[494,5],[649,5],[650,6],[1025,9]])('%i -> gen %i', (dex,gen)=>{
    expect(genOfDex(dex)).toBe(gen);
  });
});
