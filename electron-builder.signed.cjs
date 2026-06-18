"use strict";

const { build } = require("./package.json");

module.exports = {
  ...build,
  forceCodeSigning: true,
  mac: {
    ...build.mac,
    notarize: true,
  },
};
