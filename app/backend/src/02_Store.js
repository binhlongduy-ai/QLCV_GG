/**
 * Lớp lưu trữ dùng chung. Mọi quy tắc toàn vẹn nằm ở đây, độc lập với nơi lưu (Google Sheets / bộ nhớ / sau này là Postgres):
 *  - khóa chính duy nhất; sinh ID tuần tự bằng bộ đếm (không quét lại bảng mỗi lần ghi);
 *  - chỉ mục khóa chính và chỉ mục theo cột (findBy) được CẬP NHẬT TĂNG DẦN khi ghi, không dựng lại toàn bộ;
 *  - cột bất biến (immutable) không được sửa; AuditLogs chỉ được ghi thêm;
 *  - bộ nhớ đệm theo từng request, bản ghi trả về bị đóng băng (chống sửa nhầm).
 *
 * Driver cần cung cấp: read(table) -> [obj], append(table, obj), write(table, index, obj).
 * Tùy chọn: appendMany(table, [obj]) để ghi nhiều dòng trong một lượt gọi.
 * Vị trí (index) của một dòng trong mảng rows không đổi vì lớp này không xóa cứng dòng nào.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  function freeze(o) { return Object.freeze(o); }
  function keyOf(v) { return String(v); }

  /** Số thứ tự của một ID dạng PREFIX-123, hoặc null nếu không khớp. */
  function seqOf(def, id) {
    if (!def.prefix || typeof id !== 'string') return null;
    var m = new RegExp('^' + def.prefix + '-(\\d+)$').exec(id);
    return m ? parseInt(m[1], 10) : null;
  }

  Q.makeStore = function (driver) {
    var cache = {};

    function load(t) {
      if (!Q.Schema.tables[t]) U.fail('INTERNAL', 'Bảng không tồn tại: ' + t);
      if (!cache[t]) {
        cache[t] = {
          rows: driver.read(t).map(function (r) { return freeze(Q.Schema.normalize(t, r)); }),
          pk: null,            // khóa chính -> vị trí, dựng lần đầu khi cần
          by: Object.create(null), // cột -> (giá trị -> danh sách vị trí), dựng theo yêu cầu
          seq: undefined       // số thứ tự lớn nhất đã dùng, dựng lần đầu khi cần
        };
      }
      return cache[t];
    }

    function pkMap(t) {
      var c = load(t), pk = Q.Schema.tables[t].pk;
      if (!pk) U.fail('INTERNAL', 'Bảng ' + t + ' không có khóa chính.');
      if (!c.pk) {
        c.pk = Object.create(null);
        c.rows.forEach(function (r, i) { c.pk[r[pk]] = i; });
      }
      return c.pk;
    }

    function seqOfTable(t, c) {
      if (c.seq === undefined) {
        var def = Q.Schema.tables[t], max = 0;
        c.rows.forEach(function (r) { var n = seqOf(def, r[def.pk]); if (n !== null && n > max) max = n; });
        c.seq = max;
      }
      return c.seq;
    }

    /** Thêm một dòng mới vào cuối và đưa vào mọi chỉ mục đang có. */
    function addRow(t, c, row) {
      var def = Q.Schema.tables[t], i = c.rows.length;
      c.rows.push(row);
      if (c.pk && def.pk) c.pk[row[def.pk]] = i;
      Object.keys(c.by).forEach(function (col) {
        var m = c.by[col], k = keyOf(row[col]);
        (m[k] = m[k] || []).push(i);
      });
      if (c.seq !== undefined && def.pk) {
        var n = seqOf(def, row[def.pk]);
        if (n !== null && n > c.seq) c.seq = n;
      }
    }

    /** Chèn vị trí i vào danh sách đã sắp tăng dần, để thứ tự kết quả luôn theo thứ tự dòng (như khi dựng mới). */
    function insertSorted(list, i) {
      var lo = 0, hi = list.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (list[mid] < i) lo = mid + 1; else hi = mid; }
      list.splice(lo, 0, i);
    }

    /** Sau khi sửa một dòng tại vị trí i: chỉ di chuyển vị trí trong những chỉ mục theo cột có giá trị đổi. */
    function reindexChanged(c, i, before, after) {
      Object.keys(c.by).forEach(function (col) {
        var ko = keyOf(before[col]), kn = keyOf(after[col]);
        if (ko === kn) return;
        var m = c.by[col], list = m[ko] || [], at = list.indexOf(i);
        if (at >= 0) list.splice(at, 1);
        m[kn] = m[kn] || [];
        insertSorted(m[kn], i);
      });
    }

    var S = {
      reset: function () { cache = {}; if (driver.reset) driver.reset(); },
      all: function (t) { return load(t).rows.slice(); },
      find: function (t, id) {
        if (id === undefined || id === null || id === '') return null;
        var i = pkMap(t)[id];
        return i === undefined ? null : load(t).rows[i];
      },
      where: function (t, pred) { return load(t).rows.filter(pred); },
      /** Tra theo cột bất kỳ bằng chỉ mục (dựng một lần cho mỗi request, sau đó giữ đồng bộ khi ghi). */
      findBy: function (t, col, val) {
        var c = load(t);
        if (!c.by[col]) {
          var m = Object.create(null);
          c.rows.forEach(function (r, i) { var k = keyOf(r[col]); (m[k] = m[k] || []).push(i); });
          c.by[col] = m;
        }
        return (c.by[col][keyOf(val)] || []).map(function (i) { return c.rows[i]; });
      },
      insert: function (t, obj) {
        var def = Q.Schema.tables[t], row = freeze(Q.Schema.normalize(t, obj)), c = load(t);
        if (def.pk && S.find(t, row[def.pk])) U.fail('CONFLICT', 'Khóa ' + row[def.pk] + ' đã tồn tại trong ' + t + '.');
        driver.append(t, row);
        addRow(t, c, row);
        return row;
      },
      /**
       * Ghi nhiều dòng: kiểm tra trùng khóa TRƯỚC khi ghi dòng nào, rồi gọi driver.appendMany một lần (nếu có).
       */
      insertMany: function (t, objs) {
        var def = Q.Schema.tables[t], c = load(t), rows = [], seen = Object.create(null);
        objs.forEach(function (o) {
          var row = freeze(Q.Schema.normalize(t, o));
          if (def.pk) {
            var k = row[def.pk];
            if (seen[k] || S.find(t, k)) U.fail('CONFLICT', 'Khóa ' + k + ' đã tồn tại trong ' + t + '.');
            seen[k] = true;
          }
          rows.push(row);
        });
        if (!rows.length) return rows;
        if (driver.appendMany) driver.appendMany(t, rows);
        else rows.forEach(function (r) { driver.append(t, r); });
        rows.forEach(function (r) { addRow(t, c, r); });
        return rows;
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
        if (def.pk && row[def.pk] !== cur[def.pk]) { c.pk = null; c.seq = undefined; }   // khóa đổi: dựng lại hai chỉ mục này
        reindexChanged(c, i, cur, row);
        return row;
      },
      /** ID tiếp theo dạng PREFIX-001 (không ghi gì; dùng ngay trước khi insert). */
      nextId: function (t) {
        var def = Q.Schema.tables[t];
        return def.prefix + '-' + U.pad(seqOfTable(t, load(t)) + 1, 3);
      },
      count: function (t) { return load(t).rows.length; }
    };
    return S;
  };
})(QLCV);
