/**
 * Lớp giao tiếp: đường xử lý chung của mọi request (không biết tới từng action cụ thể).
 *   1) kiểm tra hình dạng request (object, action, params, requestId);
 *   2) xác thực (Q.Auth) và giới hạn tần suất theo email;
 *   3) với thao tác GHI: chạy trong khóa script và dựng lại ngữ cảnh trong khóa (không quyết định trên dữ liệu cũ);
 *   4) đóng gói kết quả thành envelope { ok, data | error, meta } và ghi nhật ký vận hành.
 * Bảng action được truyền vào từ 90_Router.js; module này không phụ thuộc vào nghiệp vụ.
 * Không bao giờ ném lỗi ra ngoài: lỗi hệ thống trả INTERNAL kèm mã tham chiếu, không lộ stack.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  var REQ_ID = /^[A-Za-z0-9_-]{8,64}$/;

  /** Giới hạn số request mỗi phút theo người dùng (RATE_LIMIT_PER_MIN). */
  function throttle(email) {
    var Env = Q.Env, k = 'rl:' + Env.sha256(email) + ':' + Math.floor(Env.now().getTime() / 60000);
    var n = parseInt(Env.cacheGet(k) || '0', 10) + 1;
    if (n > Q.Config.RATE_LIMIT_PER_MIN) U.fail('TOO_MANY_REQUESTS', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.');
    Env.cachePut(k, String(n), 70);
  }

  var Pipeline = Q.Pipeline = {};

  /** Xử lý một request đã parse với bảng actions cho trước. Trả về envelope; không ném lỗi. */
  Pipeline.run = function (body, actions) {
    var Env = Q.Env, t0 = Env.now().getTime(), meta = { version: Q.Config.VERSION }, action = null, who = null;
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) U.fail('VALIDATION', 'Yêu cầu không hợp lệ.');
      action = body.action;
      var def = typeof action === 'string' && Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
      if (!def) U.fail('NOT_FOUND', 'Hành động không tồn tại.');
      var params = body.params === undefined ? {} : body.params;
      if (!params || typeof params !== 'object' || Array.isArray(params)) U.fail('VALIDATION', 'Tham số không hợp lệ.');

      var requestId = body.requestId;
      if (requestId !== undefined && !REQ_ID.test(String(requestId))) U.fail('VALIDATION', 'requestId không hợp lệ.');
      if (def.write && !requestId) U.fail('VALIDATION', 'Thiếu requestId cho thao tác ghi.');
      meta.requestId = requestId || null;

      Q.Repo.resetCache();
      var ctx = null;
      if (def.auth !== false) {
        var user = Q.Auth.authenticate(body.idToken);
        who = user.email;
        throttle(who);
        ctx = Q.Policy.build(user);
      }
      var data;
      if (def.write) {
        data = Env.lock(function () {
          // Dựng lại ngữ cảnh trong khóa để đọc dữ liệu mới nhất (tránh quyết định trên dữ liệu cũ).
          Q.Repo.resetCache();
          var fresh = Q.Auth.authenticate(body.idToken);
          ctx = Q.Policy.build(fresh);
          return def.fn(ctx, params, { requestId: String(requestId) });
        });
        Env.flush();
      } else {
        // Đọc: dùng bộ đệm đã nạp lúc xác thực (không đặt lại để khỏi đọc lại Users, Roles...).
        data = def.fn(ctx, params, { requestId: requestId });
      }
      meta.serverTime = U.isoNow();
      if (who) Env.log({ action: action, user: who, ok: true, ms: Env.now().getTime() - t0 });
      return { ok: true, data: data, meta: meta };
    } catch (e) {
      meta.serverTime = U.isoNow();
      if (e instanceof U.AppError) {
        Env.log({ action: action, user: who, ok: false, code: e.code, ms: Env.now().getTime() - t0 });
        return { ok: false, error: { code: e.code, message: e.message, details: e.details }, meta: meta };
      }
      var errorId = Env.uuid().slice(0, 8);
      Env.logError({ errorId: errorId, action: action, user: who, message: String(e && e.message), stack: String(e && e.stack).slice(0, 800) });
      return { ok: false, error: { code: 'INTERNAL', message: 'Lỗi hệ thống. Mã tham chiếu: ' + errorId + '. Nếu lặp lại, hãy báo quản trị viên.', details: null }, meta: meta };
    }
  };
})(QLCV);
