'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_FILE = path.join(os.homedir(), '.rooncli.json');

function load() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

// Returns null if no limit is set for this zone
function getMaxVolume(zoneId) {
  return load().maxVolume?.[zoneId] ?? null;
}

function setMaxVolume(zoneId, value) {
  const cfg = load();
  cfg.maxVolume = cfg.maxVolume ?? {};
  cfg.maxVolume[zoneId] = value;
  save(cfg);
}

function clearMaxVolume(zoneId) {
  const cfg = load();
  if (cfg.maxVolume) delete cfg.maxVolume[zoneId];
  save(cfg);
}

module.exports = { getMaxVolume, setMaxVolume, clearMaxVolume };
