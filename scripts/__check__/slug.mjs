import { pokedbSlug } from '../gen-fetch.mjs';

const cases = [
  ["Farfetch'd", 'farfetchd'],
  ['Farfetch’d', 'farfetchd'],  // U+2019 右シングルクォート
  ['Mr. Mime',   'mr-mime'],
  ['Mr__Mime',   'mr-mime'],
  ['Mime Jr.',   'mime-jr'],
];

let allPass = true;
for (const [input, expected] of cases) {
  const got = pokedbSlug(input);
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  pokedbSlug(${JSON.stringify(input)}) => ${JSON.stringify(got)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`);
  if (!ok) allPass = false;
}
if (!allPass) process.exit(1);
console.log('All slug assertions passed.');
