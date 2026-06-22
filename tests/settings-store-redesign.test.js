const { DEFAULTS, sanitize } = require("../src/main/settings-store.js");

test("coming-soon behaviors default OFF", () => {
  expect(DEFAULTS.edgeRest).toBe(false);
  expect(DEFAULTS.avoidCursor).toBe(false);
  expect(DEFAULTS.appReactionsEnabled).toBe(false);
  expect(DEFAULTS.mode).toBe("follow");
});

test("party cap is 6", () => {
  const many = Array.from({ length: 10 }, (_, i) => `retro/gen-1/00${i}-x`.replace("00", "0"));
  const safe = ["retro/gen-1/001-bulbasaur","retro/gen-1/004-charmander","retro/gen-1/007-squirtle","retro/gen-1/025-pikachu","retro/gen-1/133-eevee","retro/gen-1/006-charizard","retro/gen-1/009-blastoise"];
  const out = sanitize({ favoritePacks: safe });
  expect(out.favoritePacks.length).toBe(6);
});

test("nicknames are sanitized to safe pack keys and trimmed", () => {
  const out = sanitize({ nicknames: {
    "retro/gen-1/025-pikachu": "  ピカ  ",
    "../evil": "x",
    "retro/gen-1/001-bulbasaur": "",
  }});
  expect(out.nicknames["retro/gen-1/025-pikachu"]).toBe("ピカ");
  expect(out.nicknames["../evil"]).toBeUndefined();
  expect(out.nicknames["retro/gen-1/001-bulbasaur"]).toBeUndefined(); // 空は捨てる
});
