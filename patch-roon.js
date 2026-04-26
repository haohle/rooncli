#!/usr/bin/env node
// Patches @roonlabs/node-roon-api to work with Node.js v21+ which ships a
// built-in WebSocket that lacks .on() / ping / terminate from the ws library.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'node_modules/@roonlabs/node-roon-api/transport-websocket.js');
let src = fs.readFileSync(file, 'utf8');

const from = "if (typeof(WebSocket) == \"undefined\") global.WebSocket = require('ws');";
const to   = "global.WebSocket = require('ws'); // patched: native WS lacks .on()/ping/terminate";

if (src.includes(from)) {
  fs.writeFileSync(file, src.replace(from, to));
  console.log('roon patch applied');
} else if (src.includes(to)) {
  console.log('roon patch already applied');
} else {
  console.warn('roon patch: unexpected file state, skipping');
}
