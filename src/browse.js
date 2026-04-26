'use strict';

const roon = require('./roon');

function _browseTo(opts) {
  return new Promise((resolve, reject) => {
    roon.browse.browse(opts, (err, result) => {
      if (err) reject(new Error(String(err)));
      else resolve(result);
    });
  });
}

function _load(hierarchy, multiSessionKey, count, offset) {
  return new Promise((resolve, reject) => {
    const opts = { hierarchy, offset: offset ?? 0, count: count ?? 100 };
    if (multiSessionKey) opts.multi_session_key = multiSessionKey;
    roon.browse.load(opts, (err, result) => {
      if (err) reject(new Error(String(err)));
      else resolve(result);
    });
  });
}

// Fetch all items in batches — Roon paginates at 100
async function _loadAll(hierarchy, multiSessionKey, totalCount) {
  const batchSize = 100;
  const cap = Math.min(totalCount, 5000);
  const items = [];
  for (let offset = 0; offset < cap; offset += batchSize) {
    const count = Math.min(batchSize, cap - offset);
    const result = await _load(hierarchy, multiSessionKey, count, offset);
    const batch = result.items ?? [];
    items.push(...batch);
    if (batch.length < count) break; // Roon returned fewer than requested — we're done
  }
  return items;
}

async function _collectList(browseResult, hierarchy) {
  const msKey      = browseResult.list?.multi_session_key ?? null;
  const totalCount = browseResult.list?.count ?? 0;
  const items      = totalCount > 0 ? await _loadAll(hierarchy, msKey, totalCount) : [];
  return {
    action:          'list',
    title:           browseResult.list?.title ?? '',
    items,
    totalCount,
    multiSessionKey: msKey,
    hierarchy,
  };
}

// ─── public ──────────────────────────────────────────────────────────────────

async function browseRoot(zoneOrOutputId) {
  const opts = { hierarchy: 'browse', pop_all: true };
  if (zoneOrOutputId) opts.zone_or_output_id = zoneOrOutputId;
  const result = await _browseTo(opts);
  if (result.action !== 'list') return { title: 'Browse', items: [], totalCount: 0, multiSessionKey: null, hierarchy: 'browse' };
  return _collectList(result, 'browse');
}

async function browseItem(item, multiSessionKey, hierarchy, zoneOrOutputId) {
  const opts = { hierarchy: hierarchy ?? 'browse', item_key: item.item_key };
  if (multiSessionKey)  opts.multi_session_key   = multiSessionKey;
  if (zoneOrOutputId)   opts.zone_or_output_id   = zoneOrOutputId;

  const result = await _browseTo(opts);

  if (result.action === 'list') return _collectList(result, hierarchy ?? 'browse');

  return { action: result.action ?? 'none', message: result.message ?? '' };
}

async function search(query, zoneOrOutputId) {
  const opts = { hierarchy: 'search', input: query, pop_all: true };
  if (zoneOrOutputId) opts.zone_or_output_id = zoneOrOutputId;
  const result = await _browseTo(opts);
  if (result.action !== 'list') return { title: `Search: ${query}`, items: [], totalCount: 0, multiSessionKey: null, hierarchy: 'search' };
  return _collectList(result, 'search');
}

// ─── navigation helpers ───────────────────────────────────────────────────────

function firstSelectable(items) {
  const idx = items.findIndex(i => i.hint !== 'header');
  return idx >= 0 ? idx : 0;
}

function moveIdx(items, currentIdx, direction) {
  let next = currentIdx + direction;
  while (next >= 0 && next < items.length && items[next]?.hint === 'header') next += direction;
  return (next < 0 || next >= items.length) ? currentIdx : next;
}

module.exports = { browseRoot, browseItem, search, firstSelectable, moveIdx };
