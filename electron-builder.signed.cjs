"use strict";

const { build } = require("./package.json");

module.exports = {
  ...build,
  forceCodeSigning: true,
  mac: {
    ...build.mac,
    hardenedRuntime: true,
    entitlements: "build/signed/entitlements.mac.plist",
    entitlementsInherit: "build/signed/entitlements.mac.inherit.plist",
    notarize: true,
  },
};
