import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..");
const overlaySource = fs.readFileSync(path.join(root, "src", "overlay", "overlay.js"), "utf8");

const meta = {
  rawPath: "retro/gen-1/025-pikachu",
  states: {
    walk: {
      sheet: "Walk-Anim.webp",
      frame: { w: 32, h: 40 },
      frames: 4,
    },
  },
};

function loadOverlayHarness() {
  let now = 0;
  let nextRafId = 1;
  const rafCallbacks = new Map();
  const callbacks = {};
  const elements = [];
  const documentElement = {
    appendChild(el) {
      elements.push(el);
    },
    append(...items) {
      elements.push(...items);
    },
  };

  const context = {
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    Image: class {
      constructor() {
        this.naturalWidth = 128;
        this.naturalHeight = 320;
      }
    },
    document: {
      documentElement,
      createElement() {
        return {
          id: "",
          style: {},
          append(...items) {
            elements.push(...items);
          },
        };
      },
    },
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      performance: { now: () => now },
      requestAnimationFrame(cb) {
        const id = nextRafId++;
        rafCallbacks.set(id, cb);
        return id;
      },
      cancelAnimationFrame(id) {
        rafCallbacks.delete(id);
      },
      pokeapi: {
        onMeta(cb) { callbacks.meta = cb; },
        onFrame(cb) { callbacks.frame = cb; },
        onCompanionNotification(cb) { callbacks.notification = cb; },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(overlaySource, context);

  return {
    callbacks,
    setNow(value) { now = value; },
    runNextRaf(ts = now) {
      const [id, cb] = rafCallbacks.entries().next().value || [];
      if (!cb) return false;
      rafCallbacks.delete(id);
      cb(ts);
      return true;
    },
    follower() {
      return elements.find((el) => el.id === "__pf_follower");
    },
  };
}

describe("overlay rAF interpolation", () => {
  it("補間中はdisplay cadenceで座標を中間描画する", () => {
    const h = loadOverlayHarness();
    h.callbacks.meta(meta);

    h.setNow(0);
    h.callbacks.frame({ visible: true, state: "walk", frame: 0, row: 0, scale: 1, x: 0, y: 0 });
    expect(h.follower().style.transform).toContain("translate3d(0.00px, 0.00px, 0)");

    h.setNow(16);
    h.callbacks.frame({ visible: true, state: "walk", frame: 1, row: 0, scale: 1, x: 100, y: 0 });
    expect(h.follower().style.transform).toContain("translate3d(0.00px, 0.00px, 0)");

    h.setNow(24);
    expect(h.runNextRaf(24)).toBe(true);
    expect(h.follower().style.transform).toContain("translate3d(50.00px, 0.00px, 0)");
  });

  it("非表示後の復帰は古い座標から補間しない", () => {
    const h = loadOverlayHarness();
    h.callbacks.meta(meta);

    h.setNow(0);
    h.callbacks.frame({ visible: true, state: "walk", frame: 0, row: 0, scale: 1, x: 0, y: 0 });
    h.callbacks.frame(null);

    h.setNow(1000);
    h.callbacks.frame({ visible: true, state: "walk", frame: 1, row: 0, scale: 1, x: 240, y: 40 });
    expect(h.follower().style.transform).toContain("translate3d(240.00px, 40.00px, 0)");
  });
});
