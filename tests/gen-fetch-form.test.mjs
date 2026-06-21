import { test, expect } from "vitest";
import { formSpriteDir } from "../scripts/gen-fetch.mjs";

test("form sprite dir uses subindex under dex", () => {
  // dex 26, subindex "0001" → sprite/0026/0001
  expect(formSpriteDir(26, "0001")).toBe("0026/0001");
});
