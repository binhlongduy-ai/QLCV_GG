/**
 * Đo hiệu năng trên Apps Script thật. CHỈ ĐỌC dữ liệu (không ghi vào Sheets). Chạy từ trình soạn thảo: benchPerformance().
 * Kết quả (JSON) ghi vào Nhật ký thực thi và được trả về. Bật token demo chỉ trong phạm vi một lần chạy này
 * (biến nằm trong bộ nhớ của lần thực thi, tự mất khi kết thúc) để gọi Q.handle đầy đủ: xác thực → throttle → chính sách → hàm nghiệp vụ.
 */
(function (Q) {
  'use strict';
  if (typeof SpreadsheetApp === 'undefined') { Q.Bench = {}; return; }

  function stats(ms) {
    var s = ms.slice().sort(function (a, b) { return a - b; });
    var sum = ms.reduce(function (a, b) { return a + b; }, 0);
    return { n: ms.length, min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1], avg: Math.round(sum / ms.length) };
  }
  function time(fn, n) {
    var ms = [];
    for (var i = 0; i < n; i++) { var t0 = Date.now(); fn(i); ms.push(Date.now() - t0); }
    return stats(ms);
  }

  Q.Bench = {
    /** spreadsheetId (tùy chọn): cần khi chạy qua API (clasp run), vì khi đó không có bảng tính "đang mở". Chỉ có hiệu lực trong lần chạy này. */
    run: function (spreadsheetId) {
      if (!spreadsheetId) return Q.Bench.measure();
      var orig = Q.Env.prop;
      Q.Env.prop = function (k) { return k === 'SPREADSHEET_ID' ? spreadsheetId : orig(k); };
      try { return Q.Bench.measure(); } finally { Q.Env.prop = orig; }
    },
    measure: function () {
      var U = Q.Util, out = { version: Q.Config.VERSION, at: U.isoNow(), tables: {}, requests: {} };
      Q.Store.reset();
      var admin = Q.Store.all('Users').filter(function (u) { return u.role_id === 'ROL-ADMIN' && u.status === 'active'; })[0];
      if (!admin) throw new Error('Chưa có Admin hoạt động. Hãy chạy bootstrapDatabase().');

      // 1) Chi phí đọc từng tab (mỗi lần Store.reset rồi đọc lại hoàn toàn từ Sheets).
      Q.Schema.names.forEach(function (t) {
        var rows = 0;
        var st = time(function () { Q.Store.reset(); rows = Q.Store.all(t).length; }, 3);
        out.tables[t] = { rows: rows, readMs: st.median };
      });

      // 1b) So sánh XEN KẼ trong cùng lần chạy (loại bỏ dao động theo thời điểm): đọc tab kiểu cũ (3 lượt) và kiểu mới (2 lượt).
      var book = Q.SheetDriver.book(), ab = {};
      ['Users', 'Roles'].forEach(function (t) {
        var sh = book.getSheetByName(t), n = Q.Schema.cols(t).length, a = [], b = [];
        for (var i = 0; i < 6; i++) {
          var t0 = Date.now();                                   // kiểu cũ: tiêu đề, dòng cuối, dữ liệu
          sh.getRange(1, 1, 1, n).getValues();
          var last = sh.getLastRow();
          if (last > 1) sh.getRange(2, 1, last - 1, n).getValues();
          a.push(Date.now() - t0);
          t0 = Date.now();                                       // kiểu mới: dòng cuối, rồi tiêu đề + dữ liệu một lượt
          var last2 = sh.getLastRow();
          sh.getRange(1, 1, Math.max(last2, 1), n).getValues();
          b.push(Date.now() - t0);
        }
        ab[t] = { oldThreeCalls: stats(a), newTwoCalls: stats(b) };
      });
      out.readStrategyAB = ab;

      // 2) Bộ nhớ đệm vai trò/quyền: lạnh (xóa cache) so với ấm.
      var cold = time(function () { Q.Policy.clearReference(); Q.Store.reset(); Q.Policy.build(admin); }, 3);
      Q.Policy.build(admin);
      var warm = time(function () { Q.Store.reset(); Q.Policy.build(admin); }, 5);
      out.referenceCache = { coldBuildMs: cold, warmBuildMs: warm };
      var cc = time(function (i) { Q.Env.cachePut('bench:k', 'v' + i, 30); Q.Env.cacheGet('bench:k'); }, 5);
      out.cacheServiceRoundTripMs = cc;
      try { Q.Env.cacheRemove('bench:k'); } catch (e) { /* bỏ qua */ }

      // 3) Request đầy đủ qua Q.handle (token demo chỉ trong lần chạy này).
      var token = 'demo:' + admin.email, prev = Q.Env.allowDemoTokens;
      Q.Env.allowDemoTokens = true;
      try {
        function req(action, params) { var r = Q.handle({ action: action, idToken: token, params: params || {} }); if (!r.ok) throw new Error(action + ': ' + r.error.code); return r; }
        req('auth.me');   // làm nóng cache
        out.requests['auth.me'] = time(function () { req('auth.me'); }, 5);
        out.requests['task.list (20 dòng)'] = time(function () { req('task.list', { pageSize: 20 }); }, 5);
        out.requests['dashboard.get + dashboard.director (2 request, cách cũ)'] = time(function () { req('dashboard.get'); req('dashboard.director'); }, 5);
        out.requests['dashboard.overview (1 request, cách mới)'] = time(function () { req('dashboard.overview'); }, 5);
        Q.Policy.clearReference();
        out.requests['auth.me khi cache lạnh'] = time(function () { Q.Policy.clearReference(); req('auth.me'); }, 3);
      } finally { Q.Env.allowDemoTokens = prev; }

      console.log(JSON.stringify(out, null, 2));
      return out;
    }
  };
})(QLCV);

function benchPerformance(spreadsheetId) { return QLCV.Bench.run(spreadsheetId); }
