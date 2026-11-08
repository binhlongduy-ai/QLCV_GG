'use strict';
/** Bộ giả lập Google Apps Script (SpreadsheetApp, PropertiesService, LockService, CacheService, UrlFetchApp) dùng chung cho kiểm thử. */
const crypto = require('crypto');

function fakeGoogle(opts = {}) {
  const props = { GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com', ADMIN_EMAIL: 'Boss@Bank.vn', ...opts.props };
  const sheets = {};
  let fetchCount = 0;
  const tokens = {};
  const cacheStore = {};

  function Sheet(name) {
    const rows = [];
    const sh = {
      name, rows, formats: 0, frozen: 0,
      getLastRow: () => { let l = 0; rows.forEach((r, i) => { if (r.some((v) => v !== '' && v !== undefined)) l = i + 1; }); return l; },
      getMaxRows: () => Math.max(rows.length, 1) + 500,
      setFrozenRows: (n) => { sh.frozen = n; },
      appendRow: (arr) => { rows[sh.getLastRow()] = arr.slice(); },
      getRange: (r, c, nr = 1, nc = 1) => {
        const rg = {
          getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
          setValues: (vals) => { vals.forEach((v, i) => { const row = (rows[r - 1 + i] = rows[r - 1 + i] || []); v.forEach((x, j) => { row[c - 1 + j] = x; }); }); return rg; },
          setFontWeight: () => rg, setBackground: () => rg,
          setNumberFormat: () => { sh.formats++; return rg; }
        };
        return rg;
      }
    };
    return sh;
  }
  const book = {
    getId: () => 'book-1',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = Sheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => { delete sheets[s.name]; }
  };
  const g = {
    console: { log() {}, error() {} },
    SpreadsheetApp: { openById: () => book, getActiveSpreadsheet: () => book, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() { if (opts.lockBusy) throw new Error('timeout'); }, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_a, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID()
    },
    UrlFetchApp: {
      fetch: (url) => {
        fetchCount++;
        const t = decodeURIComponent(url.split('id_token=')[1]);
        const body = tokens[t];
        return { getResponseCode: () => (body ? 200 : 400), getContentText: () => JSON.stringify(body || { error: 'invalid_token' }) };
      }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) }
  };
  return { g, props, sheets, tokens, fetches: () => fetchCount };
}

module.exports = { fakeGoogle };
