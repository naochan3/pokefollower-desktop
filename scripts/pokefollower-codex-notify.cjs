#!/usr/bin/env node
const { runNotifyCommand } = require("../src/main/codex-notify-cli.js");

runNotifyCommand(process.argv.slice(2));
