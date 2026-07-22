"use strict";

const { build } = require("./package.json");

module.exports = {
  ...build,
  win: {
    ...build.win,
    signExecutable: false,
  },
  mac: {
    ...build.mac,
    // ad-hoc 署名（"-"）。Developer ID も公証も付けない「未署名・未公証」方針は維持しつつ、
    // バンドルに自己完結した有効な署名を必ず付ける。identity: null は electron-builder が
    // 署名工程ごとスキップし、Apple Silicon で "壊れている" 判定＝起動不能になるため使わない。
    identity: "-",
    hardenedRuntime: false,
    notarize: false,
  },
};
