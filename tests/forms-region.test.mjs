import { test, expect } from "vitest";
import { regionOf } from "../scripts/forms-region.mjs";

test("maps regional subgroup names to slugs", () => {
  expect(regionOf("Alola")).toBe("alola");
  expect(regionOf("Galar")).toBe("galar");
  expect(regionOf("Galar_Zen")).toBe("galar"); // 派生はプレフィックスで丸める
  expect(regionOf("Hisui")).toBe("hisui");
  expect(regionOf("Paldea")).toBe("paldea");
  expect(regionOf("Mega_X")).toBe(null);
  expect(regionOf("Altcolor")).toBe(null);
  expect(regionOf("")).toBe(null);
});
