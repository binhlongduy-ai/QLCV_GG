/**
 * Môi trường bộ nhớ – dùng cho (1) kiểm thử Node, (2) chế độ demo trong trình duyệt.
 * KHÔNG đẩy lên Apps Script (nằm ngoài backend/src). Cho phép token "demo:<email>" – tuyệt đối không bật ở sản xuất.
 */
(function (Q) {
  'use strict';
  if (typeof SpreadsheetApp !== 'undefined') return;   // đang ở Apps Script: bỏ qua

  var props = {}, cache = {}, fixed = null, tables = {}, clock = 0, flushHook = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  Q.Env = {
    runtime: 'memory',
    allowDemoTokens: true,
    now: function () { return fixed ? new Date(fixed.getTime() + clock) : new Date(); },
    setNow: function (d) { fixed = d ? new Date(d) : null; clock = 0; },
    advance: function (ms) { clock += ms; },
    prop: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
    setProp: function (k, v) { if (v === null) delete props[k]; else props[k] = v; },
    lock: function (fn) { return fn(); },
    cacheGet: function (k) { var e = cache[k]; return e && e.exp > Date.now() ? e.v : null; },
    cachePut: function (k, v, sec) { cache[k] = { v: v, exp: Date.now() + sec * 1000 }; },
    cacheRemove: function (k) { delete cache[k]; },
    sha256: function (s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(16); },
    fetchJson: function () { return { status: 503, json: null }; },
    uuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); },
    log: function () {},
    logError: function (o) { if (Q.Env.verbose) console.error(JSON.stringify(o)); },
    flush: function () { if (flushHook) flushHook(); }
  };

  Q.MemoryDriver = {
    read: function (t) { return clone(tables[t] || []); },
    append: function (t, row) { (tables[t] = tables[t] || []).push(clone(row)); },
    appendMany: function (t, rows) { rows.forEach(function (row) { (tables[t] = tables[t] || []).push(clone(row)); }); },
    write: function (t, i, row) { tables[t][i] = clone(row); }
  };
  Q.Store = Q.makeStore(Q.MemoryDriver);

  Q.Dev = {
    /** Nạp lại dữ liệu mẫu (đồng bộ với tab trong Google Sheets). */
    reset: function () {
      tables = {}; cache = {};
      Q.Schema.names.forEach(function (t) { tables[t] = []; });
      var R = Q.SeedData.reference, D = Q.SeedData.demo;
      Object.keys(R).forEach(function (t) { tables[t] = clone(R[t]); });
      Object.keys(D).forEach(function (t) { tables[t] = clone(D[t]); });
      Q.Store.reset();
    },
    dump: function () { return clone(tables); },
    load: function (snapshot) { tables = clone(snapshot); Q.Store.reset(); },
    onFlush: function (fn) { flushHook = fn; },
    seedProps: function (o) { Object.keys(o).forEach(function (k) { props[k] = o[k]; }); }
  };
  Q.Dev.reset();
})(QLCV);
