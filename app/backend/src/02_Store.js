/**
 * Lớp lưu trữ dùng chung. Mọi quy tắc toàn vẹn nằm ở đây, độc lập với nơi lưu (Google Sheets / bộ nhớ / sau này là Postgres):
 *  - khóa chính duy nhất, sinh ID tuần tự;
 *  - cột bất biến (immutable) không được sửa; AuditLogs chỉ được ghi thêm;
 *  - bộ nhớ đệm theo từng request, bản ghi trả về bị đóng băng (chống sửa nhầm).
 *
 * Driver cần cung cấp: read(table) -> [obj], append(table, obj), write(table, index, obj).
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  function freeze(o) { return Object.freeze(o); }

  Q.makeStore = function (driver) {
    var cache = {};

    function load(t) {
      if (!Q.Schema.tables[t]) U.fail('INTERNAL', 'Bảng không tồn tại: ' + t);
      if (!cache[t]) {
        cache[t] = { rows: driver.read(t).map(function (r) { return freeze(Q.Schema.normalize(t, r)); }), pk: null, by: {} };
      }
      return cache[t];
    }
    function pkMap(t) {
      var c = load(t), pk = Q.Schema.tables[t].pk;
      if (!pk) U.fail('INTERNAL', 'Bảng ' + t + ' không có khóa chính.');
      if (!c.pk) { c.pk = {}; c.rows.forEach(function (r, i) { c.pk[r[pk]] = i; }); }
      return c.pk;
    }
    function dirty(t) { var c = cache[t]; if (c) { c.pk = null; c.by = {}; } }

    var S = {
      reset: function () { cache = {}; if (driver.reset) driver.reset(); },
      all: function (t) { return load(t).rows.slice(); },
      find: function (t, id) {
        if (id === undefined || id === null || id === '') return null;
        var i = pkMap(t)[id];
        return i === undefined ? null : load(t).rows[i];
      },
      where: function (t, pred) { return load(t).rows.filter(pred); },
      /** Tra theo cột bất kỳ bằng chỉ mục dựng theo yêu cầu. */
      findBy: function (t, col, val) {
        var c = load(t);
        if (!c.by[col]) {
          var m = {};
          c.rows.forEach(function (r) { var k = String(r[col]); (m[k] = m[k] || []).push(r); });
          c.by[col] = m;
        }
        return c.by[col][String(val)] || [];
      },
      insert: function (t, obj) {
        var def = Q.Schema.tables[t], row = freeze(Q.Schema.normalize(t, obj)), c = load(t);
        if (def.pk && S.find(t, row[def.pk])) U.fail('CONFLICT', 'Khóa ' + row[def.pk] + ' đã tồn tại trong ' + t + '.');
        driver.append(t, row);
        c.rows.push(row);
        dirty(t);
        return row;
      },
      update: function (t, id, patch) {
        var def = Q.Schema.tables[t];
        if (def.appendOnly) U.fail('INTERNAL', t + ' chỉ cho phép ghi thêm.');
        var c = load(t), i = pkMap(t)[id];
        if (i === undefined) U.fail('NOT_FOUND', 'Không tìm thấy bản ghi ' + id + ' trong ' + t + '.');
        var cur = c.rows[i];
        Object.keys(patch).forEach(function (k) {
          if (def.cols.indexOf(k) < 0) U.fail('INTERNAL', 'Cột không tồn tại: ' + t + '.' + k);
          if ((def.immutable || []).indexOf(k) >= 0 && String(patch[k]) !== String(cur[k])) {
            U.fail('INTERNAL', 'Cột bất biến không được sửa: ' + t + '.' + k);
          }
        });
        var merged = {};
        def.cols.forEach(function (k) { merged[k] = Object.prototype.hasOwnProperty.call(patch, k) ? patch[k] : cur[k]; });
        var row = freeze(Q.Schema.normalize(t, merged));
        driver.write(t, i, row);
        c.rows[i] = row;
        dirty(t);
        return row;
      },
      /** ID tuần tự dạng PREFIX-001. */
      nextId: function (t) {
        var def = Q.Schema.tables[t], max = 0, re = new RegExp('^' + def.prefix + '-(\\d+)$');
        load(t).rows.forEach(function (r) { var m = re.exec(r[def.pk]); if (m) max = Math.max(max, parseInt(m[1], 10)); });
        return def.prefix + '-' + U.pad(max + 1, 3);
      },
      count: function (t) { return load(t).rows.length; }
    };
    return S;
  };
})(QLCV);
