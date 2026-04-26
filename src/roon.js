'use strict';

const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const EventEmitter = require('events');
const RoonApi = require('@roonlabs/node-roon-api');
const RoonApiTransport = require('node-roon-api-transport');
const RoonApiBrowse = require('node-roon-api-browse');
const RoonApiStatus = require('node-roon-api-status');

// Fixed state file so the pairing token survives running roon from any directory
const STATE_FILE = path.join(os.homedir(), '.rooncli-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveState(data) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2)); }
  catch { /* ignore write errors */ }
}

class RoonConnection extends EventEmitter {
  constructor() {
    super();
    this.zones = [];
    this.core = null;
    this.transport = null;
    this.browse = null;

    this._roon = new RoonApi({
      extension_id:    'com.rooncli.terminal',
      display_name:    'Roon CLI',
      display_version: '1.0.0',
      publisher:       'RoonCLI',
      email:           'hao@hey.com',
      log_level:       'none',

      core_paired: (core) => {
        this.core = core;
        this.transport = core.services.RoonApiTransport;
        this.browse = core.services.RoonApiBrowse;
        this._subscribeZones();
        this.emit('paired', core);
      },

      core_unpaired: (core) => {
        this.core = null;
        this.transport = null;
        this.browse = null;
        this.emit('unpaired', core);
      },
    });

    // Override the prototype's CWD-relative config storage with a stable home-dir file.
    // This ensures the pairing token persists regardless of which directory roon is run from.
    this._roon.save_config = (k, v) => {
      const state = loadState();
      if (v == null) delete state[k]; else state[k] = v;
      saveState(state);
    };
    this._roon.load_config = (k) => loadState()[k];

    const svcStatus = new RoonApiStatus(this._roon);
    svcStatus.set_status('Running', false);

    this._roon.init_services({
      required_services: [RoonApiTransport, RoonApiBrowse],
      provided_services: [svcStatus],
    });
  }

  connect() {
    this._roon.start_discovery();
  }

  _subscribeZones() {
    this.transport.subscribe_zones((response, data) => {
      if (response === 'Subscribed') {
        this.zones = data.zones || [];
      } else if (response === 'Changed') {
        if (data.zones_changed) {
          for (const z of data.zones_changed) {
            const idx = this.zones.findIndex(z2 => z2.zone_id === z.zone_id);
            if (idx >= 0) this.zones[idx] = z;
            else this.zones.push(z);
          }
        }
        if (data.zones_added)   this.zones.push(...data.zones_added);
        if (data.zones_removed) this.zones = this.zones.filter(z => !data.zones_removed.includes(z.zone_id));
      }
      this.emit('zones', [...this.zones]);
    });
  }

  control(zone, action) {
    return new Promise((resolve, reject) => {
      this.transport.control(zone, action, (err) => {
        if (err) reject(new Error(String(err)));
        else resolve();
      });
    });
  }

  // mode: 'absolute' | 'relative' | 'relative_step'
  changeVolume(zone, mode, value) {
    const output = zone.outputs?.[0];
    if (!output) return Promise.reject(new Error('No output on zone'));
    return new Promise((resolve, reject) => {
      this.transport.change_volume(output, mode, value, (err) => {
        if (err) reject(new Error(String(err)));
        else resolve();
      });
    });
  }

  // how: 'mute' | 'unmute' | 'toggle'
  mute(zone, how) {
    const output = zone.outputs?.[0];
    if (!output) return Promise.reject(new Error('No output on zone'));
    return new Promise((resolve, reject) => {
      this.transport.mute(output, how, (err) => {
        if (err) reject(new Error(String(err)));
        else resolve();
      });
    });
  }

  playFromHere(zone, queueItemId) {
    return new Promise((resolve, reject) => {
      this.transport.play_from_here(zone, queueItemId, (err) => {
        if (err) reject(new Error(String(err)));
        else resolve();
      });
    });
  }

  // Subscribe to queue updates for a zone. callback(response, data) follows
  // Roon's standard subscription pattern (Subscribed / Changed).
  subscribeQueue(zone, maxCount, callback) {
    if (!this.transport) return;
    this.transport.subscribe_queue(zone, maxCount ?? 100, callback);
  }

  // settings: { shuffle, loop, auto_radio }
  // loop values: 'disabled' | 'loop' | 'loop_one'
  changeSettings(zone, settings) {
    return new Promise((resolve, reject) => {
      this.transport.change_settings(zone, settings, (err) => {
        if (err) reject(new Error(String(err)));
        else resolve();
      });
    });
  }

  activeZone() {
    return this.zones.find(z => z.state === 'playing' || z.state === 'paused') || this.zones[0] || null;
  }
}

module.exports = new RoonConnection();
