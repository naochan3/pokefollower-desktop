const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makePackReader } = require("../src/main/pack-reader.js");

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-types-"));
  fs.mkdirSync(path.join(dir, "assets", "packs"), { recursive: true });
  return dir;
}

test("readPackList attaches types from type-data.json", () => {
  const root = tmpRoot();
  const p = (f) => path.join(root, "assets", "packs", f);
  fs.writeFileSync(p("index.json"), JSON.stringify({ retro: [
    { id: "retro/gen-1/025-pikachu", name: "025-Pikachu" },
    { id: "retro/gen-1/001-bulbasaur", name: "001-Bulbasaur" },
  ] }));
  fs.writeFileSync(p("jp-names.json"), JSON.stringify({ "25": { ja: "ピカチュウ" }, "1": { ja: "フシギダネ" } }));
  fs.writeFileSync(p("type-data.json"), JSON.stringify({
    "retro/gen-1/025-pikachu": { types: ["electric"] },
  }));
  const list = makePackReader(root).readPackList();
  const pika = list.find((x) => x.id === "retro/gen-1/025-pikachu");
  const bulba = list.find((x) => x.id === "retro/gen-1/001-bulbasaur");
  expect(pika.types).toEqual(["electric"]);
  expect(bulba.types).toEqual([]); // 未登録は空配列
});
