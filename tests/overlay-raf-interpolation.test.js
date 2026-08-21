import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function createOverlayHarness() {
  const callbacks = {};
  const elements = [];
  let now = 100;

  const context = {
    console,
    Image: class {
      constructor() {
        this.naturalWidth = 128;
        this.naturalHeight = 64;
      }
    },
    document: {
      documentElement: {
        appendChild: (el) => elements.push(el),
      },
      createElement: (tag) => ({
        tag,
        id: "",
        style: {},
        textContent: "",
        append(...children) {
          this.children = children;
        },
      }),
    },
    window: {
      innerWidth: 800,
      innerHeight: 600,
      pokeapi: {
        onMeta: (cb) => {
          callbacks.meta = cb;
        },
        onFrame: (cb) => {
          callbacks.frame = cb;
        },
        onCompanionNotification: (cb) => {
          callbacks.notification = cb;
        },
      },
    },
    performance: {
      now: () => now,
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  };

  vm.createContext(context);
  const overlayPath = path.join(process.cwd(), "src", "overlay", "overlay.js");
  vm.runInContext(fs.readFileSync(overlayPath, "utf8"), context, { filename: overlayPath });

  const follower = () => elements.find((el) => el.id === "__pf_follower");

  return {
    callbacks,
    setNow: (nextNow) => {
      now = nextNow;
    },
    follower,
  };
}

const meta = {
  rawPath: "pokemon",
  states: {
    walk: {
      sheet: "walk.png",
      frame: { w: 32, h: 32 },
      frames: 4,
    },
  },
};

function frame(x, y) {
  return {
    visible: true,
    x,
    y,
    scale: 1,
    state: "walk",
    frame: 0,
    row: 0,
  };
}

describe("overlay compositor interpolation", () => {
  it("shows the first frame immediately and lets compositor transitions smooth later frames", () => {
    const overlay = createOverlayHarness();
    overlay.callbacks.meta(meta);

    overlay.callbacks.frame(frame(10, 20));
    expect(overlay.follower().style.transform).toContain("translate3d(10.00px, 20.00px, 0)");
    expect(overlay.follower().style.transitionDuration).toBe("0ms");

    overlay.setNow(108);
    overlay.callbacks.frame(frame(90, 20));
    expect(overlay.follower().style.transform).toContain("translate3d(90.00px, 20.00px, 0)");
    expect(overlay.follower().style.transitionDuration).toBe("8ms");
  });

  it("disables compositor motion when the overlay is hidden", () => {
    const overlay = createOverlayHarness();
    overlay.callbacks.meta(meta);

    overlay.callbacks.frame(frame(10, 20));
    overlay.setNow(108);
    overlay.callbacks.frame(frame(90, 20));
    expect(overlay.follower().style.transitionDuration).toBe("8ms");

    overlay.callbacks.frame({ visible: false });
    expect(overlay.follower().style.display).toBe("none");
    expect(overlay.follower().style.transitionDuration).toBe("0ms");
  });
});
