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
    identity: null,
    hardenedRuntime: false,
    notarize: false,
  },
};
