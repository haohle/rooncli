'use strict';

const React = require('react');
const { useState, useEffect, useRef, useMemo } = React;
const { Box, Text, useInput, useStdout } = require('ink');
const roon      = require('./roon');
const browseApi = require('./browse');
const config    = require('./config');

const BROWSE_VISIBLE = 9; // matches hotkeys 1–9

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(secs) {
  if (secs == null || isNaN(secs)) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// Shared scroll-window calculation — used in both render and number-key handler
function getWinStart(selIdx, total) {
  return Math.max(0, Math.min(selIdx - Math.floor(BROWSE_VISIBLE / 2), total - BROWSE_VISIBLE));
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ position, length, width }) {
  if (!length || width < 4) return React.createElement(Text, null, '');
  const pct    = Math.min(1, Math.max(0, position / length));
  const filled = Math.round(pct * width);
  return React.createElement(Text, { color: '#16a34a' }, '█'.repeat(filled) + '░'.repeat(width - filled));
}

// ─── NowPlayingPanel ─────────────────────────────────────────────────────────

function NowPlayingPanel({ zone, seekPos, termWidth }) {
  const h      = React.createElement;
  const np     = zone?.now_playing ?? null;
  const state  = zone?.state ?? 'stopped';
  const icon   = state === 'playing' ? '▶' : state === 'paused' ? '⏸' : '■';
  const color  = state === 'playing' ? '#16a34a' : state === 'paused' ? 'yellow' : 'gray';
  const track  = np?.three_line?.line1 ?? '—';
  const artist = np?.three_line?.line2 ?? '';
  const album  = np?.three_line?.line3 ?? '';
  const len    = np?.length ?? 0;
  const pos    = state === 'playing' ? (seekPos ?? np?.seek_position ?? 0) : (np?.seek_position ?? 0);

  const vol      = zone?.outputs?.[0]?.volume ?? null;
  const maxVol   = zone ? config.getMaxVolume(zone.zone_id) : null;
  const volStr   = !vol ? '' : vol.is_muted ? 'muted' : `vol ${vol.value}${maxVol !== null ? `/${maxVol}` : ''}`;
  const volColor = vol?.is_muted ? 'yellow' : 'gray';

  const settings     = zone?.settings;
  const shuffleOn    = settings?.shuffle === true;
  const loopMode     = settings?.loop ?? 'disabled';
  const radioOn      = settings?.auto_radio === true;
  const loopStr      = loopMode === 'loop' ? '↻ all' : loopMode === 'loop_one' ? '↻ one' : '';
  const settingsBits = [shuffleOn ? '⇄ shuffle' : '', loopStr, radioOn ? '⊙ radio' : ''].filter(Boolean);
  const settingsStr  = settingsBits.join('  ');

  const zoneName      = zone?.display_name ?? '';
  // Right column: "vol XX  ZoneName" — zone on far right
  const rightColWidth = (volStr ? volStr.length + 2 : 0) + zoneName.length;
  // Progress bar: its line has no right column, so width is independent of rightColWidth
  const barW          = Math.max(10, termWidth - 22);

  return h(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: color, paddingX: 1 },
    // Row 1: icon + track title                    vol XX  Zone
    h(Box, { justifyContent: 'space-between' },
      h(Box, null,
        h(Text, { color }, `${icon}  `),
        h(Text, { bold: true }, trunc(track, termWidth - rightColWidth - 8))
      ),
      h(Box, null,
        volStr ? h(Text, { color: volColor, dimColor: !vol?.is_muted }, `${volStr}  `) : null,
        h(Text, { dimColor: true }, zoneName)
      )
    ),
    // Row 2:    Artist · Album                     settings
    h(Box, { justifyContent: 'space-between' },
      h(Text, { dimColor: true }, `   ${[artist, album].filter(Boolean).join(' · ')}`),
      settingsStr ? h(Text, { color: '#0369a1', dimColor: true }, settingsStr) : null
    ),
    // Row 3:    ████░░░░  0:59 / 3:45
    h(Box, { marginTop: 1 },
      h(Text, null, '   '),
      h(ProgressBar, { position: pos, length: len, width: barW }),
      h(Text, { dimColor: true }, `  ${fmt(pos)} / ${fmt(len)}`)
    )
  );
}

// ─── ZonePicker ──────────────────────────────────────────────────────────────

function ZonePicker({ zones, selectedIdx }) {
  const h = React.createElement;
  return h(Box, { flexDirection: 'column', padding: 1 },
    h(Text, { bold: true, color: '#0369a1' }, 'Select a zone to control'),
    h(Text, { dimColor: true }, '─'.repeat(32)),
    ...zones.map((z, i) =>
      h(Box, { key: z.zone_id },
        h(Text, { color: i === selectedIdx ? '#16a34a' : undefined, bold: i === selectedIdx },
          `${i === selectedIdx ? '▶ ' : '  '}${z.display_name}`
        )
      )
    ),
    h(Text, { dimColor: true, marginTop: 1 }, '[↑↓] navigate  [enter] select')
  );
}

// ─── QueuePane ───────────────────────────────────────────────────────────────

const QUEUE_VISIBLE = 9; // matches number hotkeys 1–9

function QueuePane({ items, selectedIdx, termWidth }) {
  const h = React.createElement;

  const rows = [];

  const countStr = items.length === 0
    ? '0 items'
    : `${selectedIdx + 1} / ${items.length}`;

  rows.push(
    h(Box, { key: 'hdr', justifyContent: 'space-between', marginTop: 1, paddingX: 1 },
      h(Text, { bold: true, color: '#0369a1' }, 'Queue'),
      h(Text, { dimColor: true }, countStr)
    )
  );
  rows.push(h(Text, { key: 'div1', dimColor: true }, ' ' + '─'.repeat(termWidth - 2)));

  if (items.length === 0) {
    rows.push(h(Box, { key: 'empty', paddingX: 2 }, h(Text, { dimColor: true }, 'Queue is empty')));
  } else {
    const ws       = getWinStart(selectedIdx, items.length);
    const winEnd   = Math.min(items.length, Math.max(ws + QUEUE_VISIBLE, QUEUE_VISIBLE));
    const hasAbove = ws > 0;
    const hasBelow = winEnd < items.length;

    if (hasAbove) rows.push(
      h(Box, { key: 'above', paddingX: 2 }, h(Text, { dimColor: true }, `↑ ${ws} more`))
    );

    for (let i = ws; i < winEnd; i++) {
      const item      = items[i];
      const isSel     = i === selectedIdx;
      const isCurrent = i === 0;
      const n         = i - ws + 1;
      const title     = item.three_line?.line1 ?? item.two_line?.line1 ?? item.one_line?.line1 ?? '—';
      const artist    = item.three_line?.line2 ?? item.two_line?.line2 ?? '';
      const line      = artist ? `${title}  ·  ${artist}` : title;
      const dur       = item.length ? fmt(item.length) : '';
      const durWidth  = dur ? dur.length + 2 : 0;
      const rowColor  = isSel ? '#16a34a' : isCurrent ? undefined : 'gray';
      const dim       = !isSel && !isCurrent;

      rows.push(
        h(Box, { key: `q${i}`, paddingX: 1, justifyContent: 'space-between' },
          h(Text, { color: rowColor, dimColor: dim },
            `${n}  ${isSel ? '▶ ' : isCurrent ? '▶ ' : '  '}${trunc(line, termWidth - 10 - durWidth)}`
          ),
          dur ? h(Text, { color: rowColor, dimColor: true }, dur) : null
        )
      );
    }

    if (hasBelow) rows.push(
      h(Box, { key: 'below', paddingX: 2 }, h(Text, { dimColor: true }, `↓ ${items.length - winEnd} more`))
    );
  }

  rows.push(h(Text, { key: 'div2', dimColor: true }, ' ' + '─'.repeat(termWidth - 2)));

  return h(Box, { flexDirection: 'column' }, ...rows);
}

// ─── BrowsePane ──────────────────────────────────────────────────────────────

function BrowsePane({ stack, browseIdx, browseFilter, filteredItems, loading, termWidth }) {
  const h = React.createElement;

  if (loading) {
    return h(Box, { paddingX: 2, marginTop: 1 }, h(Text, { color: 'yellow' }, 'Loading…'));
  }

  const level = stack[stack.length - 1];
  if (!level) return null;

  const maxTitle = termWidth - 14;
  const crumbs   = stack.slice(-3).map(l => l.title).join(' › ');
  const total    = level.totalCount ?? level.items.length;

  const ws      = getWinStart(browseIdx, filteredItems.length);
  const winEnd  = Math.min(filteredItems.length, Math.max(ws + BROWSE_VISIBLE, BROWSE_VISIBLE));
  const hasAbove = ws > 0;
  const hasBelow = winEnd < filteredItems.length;

  const rows = [];

  // Header: breadcrumb + filter/count
  rows.push(
    h(Box, { key: 'hdr', justifyContent: 'space-between', marginTop: 1, paddingX: 1 },
      h(Text, { bold: true, color: '#0369a1' }, trunc(crumbs, termWidth - 24)),
      browseFilter
        ? h(Text, { color: 'yellow' }, `"${browseFilter}"  ${filteredItems.length} match${filteredItems.length !== 1 ? 'es' : ''}`)
        : h(Text, { dimColor: true }, `${total} items`)
    )
  );
  rows.push(h(Text, { key: 'div1', dimColor: true }, ' ' + '─'.repeat(termWidth - 2)));

  if (hasAbove) rows.push(
    h(Box, { key: 'up', paddingX: 2 }, h(Text, { dimColor: true }, `↑ ${ws} more`))
  );

  if (filteredItems.length === 0) rows.push(
    h(Box, { key: 'empty', paddingX: 2 },
      h(Text, { dimColor: true }, browseFilter ? `No matches for "${browseFilter}"` : 'Empty')
    )
  );

  for (let i = ws; i < winEnd; i++) {
    const item   = filteredItems[i];
    const isSel  = i === browseIdx;
    const isHdr  = item.hint === 'header';
    const hasSub = item.hint === 'list' || item.hint === 'action_list';
    const n      = i - ws + 1; // 1–9 hotkey label

    rows.push(
      h(Box, { key: `r${i}`, paddingX: 1, justifyContent: 'space-between' },
        h(Box, null,
          // Hotkey number
          isHdr
            ? h(Text, { dimColor: true }, '   ')
            : h(Text, { color: isSel ? '#16a34a' : 'gray', dimColor: !isSel }, `${n}  `),
          // Selection arrow
          h(Text, { color: isSel && !isHdr ? '#16a34a' : undefined, dimColor: isHdr },
            `${isSel && !isHdr ? '▶ ' : '  '}${trunc(item.title, maxTitle)}`
          )
        ),
        hasSub ? h(Text, { dimColor: true }, '›') : null
      )
    );
  }

  if (hasBelow) rows.push(
    h(Box, { key: 'dn', paddingX: 2 }, h(Text, { dimColor: true }, `↓ ${filteredItems.length - winEnd} more`))
  );

  rows.push(h(Text, { key: 'div2', dimColor: true }, ' ' + '─'.repeat(termWidth - 2)));

  return h(Box, { flexDirection: 'column' }, ...rows);
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  // Connection
  const [connected,     setConnected]     = useState(false);
  const [zones,         setZones]         = useState([]);
  const [activeZoneId,  setActiveZoneId]  = useState(null);
  const [hasChosZone,   setHasChosZone]   = useState(false);
  const [selectingZone, setSelectingZone] = useState(false);
  const [zonePickerIdx, setZonePickerIdx] = useState(0);

  // Shell
  const [input,   setInput]   = useState('');
  const [message, setMessage] = useState('');

  // Seek
  const [seekPos, setSeekPos] = useState(null);
  const seekBase     = useRef(null);
  const isMountedRef = useRef(true);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // Queue
  const [showQueue,  setShowQueue]  = useState(false);
  const [queueItems, setQueueItems] = useState([]);
  const [queueIdx,   setQueueIdx]   = useState(0);
  const [queueSubKey, setQueueSubKey] = useState(0); // increment to force re-subscription
  const queueGenRef   = useRef(0);   // invalidates stale subscription callbacks
  const prevTrackRef  = useRef(null);

  // Browse
  const [browseMode,    setBrowseMode]    = useState(false);
  const [browseStack,   setBrowseStack]   = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseIdx,     setBrowseIdx]     = useState(0);
  const [browseFilter,  setBrowseFilter]  = useState('');

  const { stdout } = useStdout();
  const termWidth  = stdout?.columns ?? 80;

  // Derived
  const zone           = zones.find(z => z.zone_id === activeZoneId) ?? zones[0] ?? null;
  const np             = zone?.now_playing ?? null;
  const zoneOrOutputId = zone?.outputs?.[0]?.output_id ?? zone?.zone_id ?? null;
  const browseLevel    = browseStack[browseStack.length - 1] ?? null;

  const filteredItems = useMemo(() => {
    const items = browseLevel?.items ?? [];
    if (!browseFilter) return items;
    return items.filter(i => i.hint !== 'header' && i.title?.toLowerCase().includes(browseFilter.toLowerCase()));
  }, [browseLevel, browseFilter]);

  // ── seek ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (np?.seek_position != null) {
      seekBase.current = { pos: np.seek_position, time: Date.now() };
      setSeekPos(np.seek_position);
    }
  }, [np?.seek_position]);

  useEffect(() => {
    const id = setInterval(() => {
      if (zone?.state === 'playing' && seekBase.current)
        setSeekPos(seekBase.current.pos + (Date.now() - seekBase.current.time) / 1000);
    }, 500);
    return () => clearInterval(id);
  }, [zone?.state]);

  // ── queue subscription ────────────────────────────────────────────────────
  // Re-subscribes on zone change or when queueSubKey increments (track change).
  // The generation counter makes callbacks from superseded subscriptions no-ops.
  useEffect(() => {
    if (!connected || !zone) return;
    const gen = ++queueGenRef.current;

    roon.subscribeQueue(zone, 100, (response, data) => {
      if (gen !== queueGenRef.current) return; // stale subscription
      if (!isMountedRef.current) return;
      if (response === 'Subscribed') {
        setQueueItems(data.items ?? []);
      } else if (response === 'Changed') {
        if (data.items) {
          setQueueItems(data.items);
        } else {
          setQueueItems(prev => {
            let next = [...prev];
            if (data.items_removed) {
              const removed = new Set(data.items_removed.map(String));
              next = next.filter(i => !removed.has(String(i.queue_item_id)));
            }
            if (data.items_added) {
              // items_added is an array of queue item objects (not { queue_item_id, item } wrappers)
              next.push(...data.items_added);
            }
            return next;
          });
        }
      }
    });
  }, [connected, zone?.zone_id, queueSubKey]);

  // Re-subscribe when the playing track changes so queue always reflects current position
  useEffect(() => {
    const track = np?.one_line?.line1 ?? null;
    if (prevTrackRef.current !== null && prevTrackRef.current !== track) {
      setQueueSubKey(k => k + 1);
    }
    prevTrackRef.current = track;
  }, [np?.one_line?.line1]);

  // ── Roon events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onPaired   = () => { if (isMountedRef.current) { setConnected(true); setMessage(''); } };
    const onUnpaired = () => { if (isMountedRef.current) { setConnected(false); setZones([]); } };
    const onZones    = (updated) => {
      if (!isMountedRef.current) return;
      setZones(updated);
      setHasChosZone(prev => {
        if (prev) {
          setActiveZoneId(id => updated.find(z => z.zone_id === id) ? id : updated[0]?.zone_id ?? null);
          return true;
        }
        if (updated.length === 1) { setActiveZoneId(updated[0].zone_id); return true; }
        setSelectingZone(true);
        return false;
      });
    };

    roon.on('paired',   onPaired);
    roon.on('unpaired', onUnpaired);
    roon.on('zones',    onZones);
    roon.connect();
    return () => {
      roon.off('paired',   onPaired);
      roon.off('unpaired', onUnpaired);
      roon.off('zones',    onZones);
    };
  }, []);

  // ── flash ─────────────────────────────────────────────────────────────────
  const flashTimer = useRef(null);
  function flash(msg) {
    setMessage(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setMessage(''), 3500);
  }

  // ── playback ──────────────────────────────────────────────────────────────
  function doControl(action) {
    if (!zone) { flash('No zone selected — type zone to pick one'); return; }
    roon.control(zone, action).catch(err => flash(`Error: ${err.message}`));
  }

  // ── volume ────────────────────────────────────────────────────────────────
  function volOutput() { return zone?.outputs?.[0] ?? null; }

  function doVolumeSet(target) {
    if (!zone) { flash('No zone selected'); return; }
    const vol = volOutput()?.volume;
    if (!vol) { flash('This zone does not support volume control'); return; }

    if (target < vol.min) { flash(`Volume ${target} is below the minimum (${vol.min})`); return; }
    if (target > vol.max) { flash(`Volume ${target} exceeds the hardware maximum (${vol.max})`); return; }

    const limit = config.getMaxVolume(zone.zone_id);
    if (limit !== null && target > limit) {
      flash(`Volume ${target} exceeds your safe limit of ${limit} — use 'maxvol <n>' to raise it`);
      return;
    }

    roon.changeVolume(zone, 'absolute', target)
      .then(() => flash(`Volume → ${target}`))
      .catch(err => flash(`Error: ${err.message}`));
  }

  function doVolumeStep(delta) {
    const vol = volOutput()?.volume;
    if (!vol) return;
    const step   = delta > 0 ? (vol.step ?? 5) : -(vol.step ?? 5);
    const target = Math.max(vol.min, Math.min(vol.max, vol.value + step));
    doVolumeSet(target);
  }

  function doMuteToggle() {
    if (!zone) { flash('No zone selected'); return; }
    if (!volOutput()?.volume) { flash('This zone does not support mute'); return; }
    roon.mute(zone, 'toggle')
      .then(() => flash('Mute toggled'))
      .catch(err => flash(`Error: ${err.message}`));
  }

  // ── playback settings ─────────────────────────────────────────────────────
  function toggleShuffle() {
    if (!zone) { flash('No zone selected'); return; }
    const next = !(zone.settings?.shuffle ?? false);
    roon.changeSettings(zone, { shuffle: next })
      .then(() => flash(`Shuffle ${next ? 'on' : 'off'}`))
      .catch(err => flash(`Error: ${err.message}`));
  }

  function toggleRepeat() {
    if (!zone) { flash('No zone selected'); return; }
    const cur  = zone.settings?.loop ?? 'disabled';
    const next = cur === 'disabled' ? 'loop' : cur === 'loop' ? 'loop_one' : 'disabled';
    const label = next === 'disabled' ? 'off' : next === 'loop' ? 'all' : 'one';
    roon.changeSettings(zone, { loop: next })
      .then(() => flash(`Repeat: ${label}`))
      .catch(err => flash(`Error: ${err.message}`));
  }

  function toggleRadio() {
    if (!zone) { flash('No zone selected'); return; }
    const next = !(zone.settings?.auto_radio ?? false);
    roon.changeSettings(zone, { auto_radio: next })
      .then(() => flash(`Auto Radio ${next ? 'on' : 'off'}`))
      .catch(err => flash(`Error: ${err.message}`));
  }

  function handleVolCommand(args) {
    const vol = volOutput()?.volume;
    if (!args.length) {
      if (!vol) { flash('No volume info available'); return; }
      const limit = zone ? config.getMaxVolume(zone.zone_id) : null;
      flash(`Volume: ${vol.value}  (min ${vol.min} – max ${vol.max}${limit !== null ? `  safe limit: ${limit}` : '  no limit set'})`);
      return;
    }
    const arg = args[0];
    if (arg.startsWith('+')) { doVolumeSet((vol?.value ?? 0) + parseInt(arg.slice(1), 10)); return; }
    if (arg.startsWith('-')) { doVolumeSet((vol?.value ?? 0) - parseInt(arg.slice(1), 10)); return; }
    const n = parseInt(arg, 10);
    if (isNaN(n)) { flash('Usage: vol [+/-]<0-100>'); return; }
    doVolumeSet(n);
  }

  function handleMaxVolCommand(args) {
    if (!zone) { flash('No zone selected'); return; }
    if (!args.length) {
      const limit = config.getMaxVolume(zone.zone_id);
      flash(limit !== null ? `Safe volume limit: ${limit}` : 'No volume limit set for this zone');
      return;
    }
    if (args[0] === 'off' || args[0] === 'clear') {
      config.clearMaxVolume(zone.zone_id);
      flash('Volume limit removed');
      return;
    }
    const n = parseInt(args[0], 10);
    if (isNaN(n) || n < 0) { flash('Usage: maxvol <0-100>  or  maxvol off'); return; }
    const vol = volOutput()?.volume;
    if (vol && n > vol.max) { flash(`Limit ${n} exceeds hardware maximum (${vol.max})`); return; }
    config.setMaxVolume(zone.zone_id, n);
    flash(`Safe volume limit set to ${n}`);
  }

  // Reset cursor whenever the queue list itself changes
  useEffect(() => { setQueueIdx(0); }, [queueItems]);

  // ── queue playback ────────────────────────────────────────────────────────
  function playFromQueue(idx) {
    const item = queueItems[idx];
    if (!item || !zone) return;
    roon.playFromHere(zone, item.queue_item_id)
      .then(() => flash(`Playing: ${item.three_line?.line1 ?? item.two_line?.line1 ?? 'track'}`))
      .catch(err => flash(`Error: ${err.message}`));
  }

  // ── zone picker ───────────────────────────────────────────────────────────
  function confirmZone(idx) {
    const z = zones[idx];
    if (!z) return;
    setActiveZoneId(z.zone_id);
    setHasChosZone(true);
    setSelectingZone(false);
    flash(`Zone → ${z.display_name}`);
  }

  // ── browse helpers ────────────────────────────────────────────────────────

  // Push a fetched list result onto the browse stack
  function pushFrame(result, savedIdx, savedFilter) {
    const newFrame = { ...result, savedIdx: 0, savedFilter: '' };
    setBrowseStack(prev => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], savedIdx, savedFilter },
      newFrame,
    ]);
    setBrowseFilter('');
    setBrowseIdx(browseApi.firstSelectable(result.items));
  }

  // Auto-play: item is action_list → load its sub-items, find "Play Now", execute it
  async function autoPlay(item, itemIdx) {
    if (!browseLevel) return;
    setBrowseLoading(true);
    try {
      const result = await browseApi.browseItem(item, browseLevel.multiSessionKey, browseLevel.hierarchy, zoneOrOutputId);

      if (result.action === 'list') {
        const playNow = result.items.find(i => i.hint === 'action' && /play now/i.test(i.title))
                     ?? result.items.find(i => i.hint === 'action' && /play/i.test(i.title))
                     ?? result.items.find(i => i.hint === 'action');

        if (playNow) {
          await browseApi.browseItem(playNow, result.multiSessionKey, result.hierarchy, zoneOrOutputId);
          flash(`▶  ${item.title}`);
        } else {
          // No play action — show the sub-menu instead
          pushFrame(result, itemIdx, browseFilter);
        }
      } else {
        flash(`▶  ${item.title}`);
      }
    } catch (err) {
      flash(`Error: ${err.message}`);
    }
    setBrowseLoading(false);
  }

  // Main select: Enter = smart (auto-play action_list), forceNavigate = right arrow (always show sub-menu)
  async function browseSelect(targetIdx, forceNavigate) {
    if (browseLoading) return;
    if (!browseLevel) return;

    const idx  = targetIdx ?? browseIdx;
    const item = filteredItems[idx];
    if (!item || item.hint === 'header') return;

    // Smart-play: skip the "Play Now / Add Next / Queue" menu
    if (item.hint === 'action_list' && !forceNavigate) {
      await autoPlay(item, idx);
      return;
    }

    // Direct action
    if (item.hint === 'action') {
      setBrowseLoading(true);
      try {
        await browseApi.browseItem(item, browseLevel.multiSessionKey, browseLevel.hierarchy, zoneOrOutputId);
        flash(`▶  ${item.title}`);
      } catch (err) { flash(`Error: ${err.message}`); }
      setBrowseLoading(false);
      return;
    }

    // Navigate into list (or force-navigate into action_list to show options)
    setBrowseLoading(true);
    try {
      const result = await browseApi.browseItem(item, browseLevel.multiSessionKey, browseLevel.hierarchy, zoneOrOutputId);
      if (result.action === 'list') {
        pushFrame(result, idx, browseFilter);
      } else {
        flash(`▶  ${item.title}`);
      }
    } catch (err) { flash(`Error: ${err.message}`); }
    setBrowseLoading(false);
  }

  function browseBack() {
    if (browseLoading) return;
    if (browseFilter) { setBrowseFilter(''); setBrowseIdx(0); return; }
    setBrowseStack(prev => {
      if (prev.length <= 1) { setBrowseMode(false); setBrowseIdx(0); return []; }
      const parent = prev[prev.length - 2];
      setBrowseFilter(parent.savedFilter ?? '');
      setBrowseIdx(parent.savedIdx ?? 0);
      return prev.slice(0, -1);
    });
  }

  // ── browse open ───────────────────────────────────────────────────────────

  async function openBrowse() {
    if (!zoneOrOutputId) { flash('Pick a zone first (type: zone)'); return; }
    setBrowseMode(true); setBrowseLoading(true);
    setBrowseFilter(''); setBrowseIdx(0); setBrowseStack([]);
    try {
      const result = await browseApi.browseRoot(zoneOrOutputId);
      setBrowseStack([{ ...result, savedIdx: 0, savedFilter: '' }]);
      setBrowseIdx(browseApi.firstSelectable(result.items));
    } catch (err) { flash(`Browse error: ${err.message}`); setBrowseMode(false); }
    setBrowseLoading(false);
  }

  async function openSearch(query) {
    if (!zoneOrOutputId) { flash('Pick a zone first (type: zone)'); return; }
    setBrowseMode(true); setBrowseLoading(true);
    setBrowseFilter(''); setBrowseIdx(0); setBrowseStack([]);
    try {
      const result = await browseApi.search(query, zoneOrOutputId);
      setBrowseStack([{ ...result, savedIdx: 0, savedFilter: '' }]);
      setBrowseIdx(browseApi.firstSelectable(result.items));
    } catch (err) { flash(`Search error: ${err.message}`); setBrowseMode(false); }
    setBrowseLoading(false);
  }

  // ── commands ──────────────────────────────────────────────────────────────

  function runCommand(raw) {
    const [name, ...args] = raw.trim().split(/\s+/);
    switch (name.toLowerCase()) {
      case 'browse': case 'b':   openBrowse(); break;
      case 'search': case 's':
        args.length ? openSearch(args.join(' ')) : flash('Usage: search <query>'); break;
      case 'zones': case 'zone': case 'z':
        if (args.length) {
          const idx = parseInt(args[0], 10) - 1;
          !isNaN(idx) && idx >= 0 && idx < zones.length ? confirmZone(idx) : flash(`Zone ${args[0]} not found`);
        } else { setZonePickerIdx(0); setSelectingZone(true); }
        break;
      case 'play':    doControl('play');     break;
      case 'pause':   doControl('pause');    break;
      case 'stop':    doControl('stop');     break;
      case 'next':    doControl('next');     break;
      case 'prev': case 'previous': doControl('previous'); break;
      case 'vol': case 'volume':  handleVolCommand(args);    break;
      case 'maxvol':              handleMaxVolCommand(args); break;
      case 'mute':                doMuteToggle();            break;
      case 'shuffle':             toggleShuffle();           break;
      case 'repeat': case 'loop': toggleRepeat();            break;
      case 'radio':               toggleRadio();             break;
      case 'queue':               setShowQueue(v => !v);    break;
      case 'help': case '?':
        flash('browse  search <q>  zone  play  pause  next  prev  shuffle  repeat  radio  vol [n]  maxvol [n]  mute  quit'); break;
      case 'quit': case 'exit': case 'q': process.exit(0); break;
      default: flash(`Unknown: ${name} — type help`);
    }
  }

  // ── keyboard ──────────────────────────────────────────────────────────────

  useInput((char, key) => {
    if (key.ctrl && char === 'c') process.exit(0);

    // Zone picker
    if (selectingZone) {
      if (key.upArrow)   { setZonePickerIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setZonePickerIdx(i => Math.min(zones.length - 1, i + 1)); return; }
      if (key.return)    { confirmZone(zonePickerIdx); return; }
      return;
    }

    // Global shortcuts (uppercase = Shift+letter in terminals) — work in all modes
    if (char === 'K') { doControl('next');     return; }
    if (char === 'J') { doControl('previous'); return; }
    if (char === 'M') { doMuteToggle();                   return; }
    if (char === 'S') { toggleShuffle();                  return; }
    if (char === 'R') { toggleRepeat();                   return; }
    if (char === 'A') { toggleRadio();                    return; }
    if (char === 'Q') { setShowQueue(v => !v);            return; }

    // ── Browse mode ────────────────────────────────────────────────────────
    if (browseMode) {
      if (key.upArrow)    { setBrowseIdx(i => browseApi.moveIdx(filteredItems, i, -1)); return; }
      if (key.downArrow)  { setBrowseIdx(i => browseApi.moveIdx(filteredItems, i, +1)); return; }
      if (key.rightArrow) { browseSelect(undefined, true);  return; } // force-navigate (show options menu)
      if (key.leftArrow)  { browseBack();                   return; } // go back one level
      if (key.return)     { browseSelect();                 return; } // smart: auto-play action_list
      if (key.escape)     { browseBack();                   return; } // also back (keep esc working)
      if (char === ' ')   { doControl(zone?.state === 'playing' ? 'pause' : 'play'); return; }
      if (char === '[')   { doVolumeStep(-1); return; }
      if (char === ']')   { doVolumeStep(+1); return; }

      // 1–9: immediately activate the nth item in the current visible window
      if (char >= '1' && char <= '9') {
        const n         = parseInt(char) - 1;
        const ws        = getWinStart(browseIdx, filteredItems.length);
        const targetIdx = ws + n;
        if (targetIdx < filteredItems.length && filteredItems[targetIdx]?.hint !== 'header') {
          browseSelect(targetIdx);
        }
        return;
      }

      // a–z only → type-to-filter (uppercase J/K already handled globally above)
      if (key.backspace || key.delete) {
        setBrowseFilter(prev => prev.slice(0, -1)); setBrowseIdx(0); return;
      }
      if (char && !key.ctrl && !key.meta && char >= 'a' && char <= 'z') {
        setBrowseFilter(prev => prev + char); setBrowseIdx(0); return;
      }
      return;
    }

    // ── Queue mode ─────────────────────────────────────────────────────────
    if (showQueue) {
      if (key.escape)    { setShowQueue(false); return; }
      if (key.upArrow)   { setQueueIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setQueueIdx(i => Math.min(queueItems.length - 1, i + 1)); return; }
      if (key.return)    { playFromQueue(queueIdx); return; }
      if (char >= '1' && char <= '9') {
        const n         = parseInt(char) - 1;
        const ws        = getWinStart(queueIdx, queueItems.length);
        const targetIdx = ws + n;
        if (targetIdx < queueItems.length) playFromQueue(targetIdx);
        return;
      }
      if (char === ' ')  { doControl(zone?.state === 'playing' ? 'pause' : 'play'); return; }
      if (char === '[')  { doVolumeStep(-1); return; }
      if (char === ']')  { doVolumeStep(+1); return; }
      return;
    }

    // ── Shell mode ─────────────────────────────────────────────────────────
    if (key.return) {
      const cmd = input.trim(); setInput('');
      if (cmd) runCommand(cmd);
      return;
    }
    if (key.escape)                  { setInput(''); return; }
    if (key.backspace || key.delete) { setInput(prev => prev.slice(0, -1)); return; }
    if (char === ' ' && input === '') { doControl(zone?.state === 'playing' ? 'pause' : 'play'); return; }
    if (char === '[' && input === '') { doVolumeStep(-1); return; }
    if (char === ']' && input === '') { doVolumeStep(+1); return; }
    if (char && !key.ctrl && !key.meta) setInput(prev => prev + char);
  });

  // ── render ────────────────────────────────────────────────────────────────

  const h = React.createElement;

  if (!connected) {
    return h(Box, { flexDirection: 'column', padding: 1 },
      h(Text, { color: 'yellow' }, 'Searching for Roon on your local network…'),
      h(Text, { dimColor: true }, 'First run? Approve "Roon CLI" in Roon → Settings → Extensions.')
    );
  }

  if (selectingZone) return h(ZonePicker, { zones, selectedIdx: zonePickerIdx });

  // ── hint bar ──────────────────────────────────────────────────────────────
  const settings    = zone?.settings;
  const shuffleOn   = settings?.shuffle === true;
  const loopMode    = settings?.loop ?? 'disabled';
  const radioOn     = settings?.auto_radio === true;
  const isPlaying   = zone?.state === 'playing';
  const isMuted     = zone?.outputs?.[0]?.volume?.is_muted ?? false;
  const repeatLabel = loopMode === 'loop' ? 'all' : loopMode === 'loop_one' ? 'one' : 'off';

  // Left side: mode-specific nav hints
  const leftHints = browseMode ? [
    ['[↑↓] nav', false], ['[←] back', false], ['[→] opts', false],
    ['[⏎] play', false], ['[1-9] pick', false], ['[a-z] filter', false],
  ] : showQueue ? [
    ['[↑↓] nav', false], ['[⏎] play', false], ['[1-9] pick', false], ['[esc] close', false],
  ] : [
    ['[b] browse', false], ['[s] search', false], ['[z] zone', false], ['[q] quit', false],
  ];

  // Right side: playback controls — toggles show bold + ✓ when active
  const rightHints = [
    [`[space] ${isPlaying ? 'pause' : 'play'}`, isPlaying],
    ['[J] ◀  [K] ▶', false],
    ['[ vol−  ] vol+', false],
    ['[M] mute', isMuted],
    ['[S] shuffle', shuffleOn],
    [`[R] repeat:${repeatLabel}`, loopMode !== 'disabled'],
    ['[A] radio', radioOn],
    ['[Q] queue', showQueue],
  ];

  function renderHints(tokens, pfx) {
    return tokens.flatMap(([label, active], i) => [
      i > 0 ? h(Text, { key: `${pfx}s${i}`, dimColor: true }, '  ') : null,
      h(Text, { key: `${pfx}${i}`, ...(active ? { bold: true } : { dimColor: true }) },
        active ? `${label} ✓` : label),
    ].filter(Boolean));
  }

  return h(Box, { flexDirection: 'column' },
    h(NowPlayingPanel, { zone, seekPos, termWidth }),

    showQueue
      ? h(QueuePane, { items: queueItems, selectedIdx: queueIdx, termWidth })
      : null,

    browseMode
      ? h(BrowsePane, { stack: browseStack, browseIdx, browseFilter, filteredItems, loading: browseLoading, termWidth })
      : null,

    h(Box, { paddingX: 2, height: 1 }, h(Text, { dimColor: true }, message)),

    !browseMode && !showQueue
      ? h(Box, { paddingX: 1 },
          h(Text, { color: '#16a34a', bold: true }, 'roon'),
          h(Text, { dimColor: true }, ' › '),
          h(Text, null, input),
          h(Text, { color: '#16a34a' }, '▌')
        )
      : null,

    h(Text, { key: 'sep', dimColor: true }, ' ' + '─'.repeat(termWidth - 2)),
    h(Box, { paddingX: 1, justifyContent: 'space-between' },
      h(Box, { key: 'left'  }, ...renderHints(leftHints,  'l')),
      h(Box, { key: 'right' }, ...renderHints(rightHints, 'r'))
    )
  );
}

module.exports = App;
