/**
 * Bộ định tuyến API. Một endpoint duy nhất:  POST  { action, idToken, params, requestId }
 * Trả về luôn dạng:  { ok:true, data, meta } | { ok:false, error:{ code, message, details }, meta }
 *
 * Giao thức cho trình duyệt: gửi Content-Type: text/plain (request "đơn giản" nên không cần preflight CORS –
 * Apps Script Web App không trả được header CORS cho OPTIONS). Token đặt trong body, KHÔNG đặt trên URL.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  // write=true: chạy trong khóa script + bắt buộc requestId để thử lại an toàn. auth=false: công khai.
  var ACTIONS = {
    'system.health': { auth: false, fn: function () { return { status: 'ok', app: Q.Config.APP, version: Q.Config.VERSION, runtime: Q.Env.runtime, time: U.isoNow() }; } },
    'auth.me': { fn: Q.DashboardService.me },

    'dashboard.get': { fn: Q.DashboardService.get },
    'dashboard.director': { fn: Q.DashboardService.director },

    'task.list': { fn: Q.TaskService.list },
    'task.get': { fn: Q.TaskService.get },
    'task.create': { write: true, fn: Q.TaskService.create },
    'task.update': { write: true, fn: Q.TaskService.update },
    'task.start': { write: true, fn: Q.TaskService.start },
    'task.transfer': { write: true, fn: Q.TaskService.transfer },
    'task.setCollaborator': { write: true, fn: Q.TaskService.setCollaborator },
    'task.archive': { write: true, fn: Q.TaskService.archive },

    'progress.submit': { write: true, fn: Q.ProgressService.submit },
    'progress.review': { write: true, fn: Q.ProgressService.review },
    'progress.pending': { fn: Q.ProgressService.pending },

    'customer.list': { fn: Q.CustomerService.list },
    'customer.get': { fn: Q.CustomerService.get },
    'customer.create': { write: true, fn: Q.CustomerService.create },
    'customer.update': { write: true, fn: Q.CustomerService.update },
    'customer.archive': { write: true, fn: Q.CustomerService.archive },

    'notification.list': { fn: Q.NotificationService.list },
    'notification.count': { fn: Q.NotificationService.count },
    'notification.markRead': { write: true, fn: Q.NotificationService.markRead },
    'notification.markAllRead': { write: true, fn: Q.NotificationService.markAllRead },

    'user.options': { fn: Q.AdminService.userOptions },
    'user.list': { fn: Q.AdminService.userList },
    'user.create': { write: true, fn: Q.AdminService.userCreate },
    'user.update': { write: true, fn: Q.AdminService.userUpdate },

    'audit.list': { fn: Q.AdminService.auditList },
    'admin.integrity': { fn: Q.AdminService.integrity },
    'admin.reconcile': { write: true, fn: Q.AdminService.reconcile },
    'admin.backup': { write: true, fn: Q.AdminService.backup },
    'admin.restore': { write: true, fn: Q.AdminService.restore }
  };

  var REQ_ID = /^[A-Za-z0-9_-]{8,64}$/;

  function throttle(email) {
    var Env = Q.Env, k = 'rl:' + Env.sha256(email) + ':' + Math.floor(Env.now().getTime() / 60000);
    var n = parseInt(Env.cacheGet(k) || '0', 10) + 1;
    if (n > Q.Config.RATE_LIMIT_PER_MIN) U.fail('TOO_MANY_REQUESTS', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.');
    Env.cachePut(k, String(n), 70);
  }

  /** Xử lý một request đã parse. Không bao giờ ném lỗi ra ngoài. */
  Q.handle = function (body) {
    var Env = Q.Env, t0 = Env.now().getTime(), meta = { version: Q.Config.VERSION }, action = null, who = null;
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) U.fail('VALIDATION', 'Yêu cầu không hợp lệ.');
      action = body.action;
      var def = typeof action === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
      if (!def) U.fail('NOT_FOUND', 'Hành động không tồn tại.');
      var params = body.params === undefined ? {} : body.params;
      if (!params || typeof params !== 'object' || Array.isArray(params)) U.fail('VALIDATION', 'Tham số không hợp lệ.');

      var requestId = body.requestId;
      if (requestId !== undefined && !REQ_ID.test(String(requestId))) U.fail('VALIDATION', 'requestId không hợp lệ.');
      if (def.write && !requestId) U.fail('VALIDATION', 'Thiếu requestId cho thao tác ghi.');
      meta.requestId = requestId || null;

      Q.Store.reset();
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
          Q.Store.reset();
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

  Q.actions = function () { return Object.keys(ACTIONS); };

  // ---- Điểm vào của Apps Script Web App ----
  function out(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  }
  Q.doPost = function (e) {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > Q.Config.MAX_BODY_BYTES) {
      return out({ ok: false, error: { code: 'VALIDATION', message: 'Nội dung yêu cầu trống hoặc quá lớn.' } });
    }
    var body;
    try { body = JSON.parse(raw); } catch (err) { return out({ ok: false, error: { code: 'VALIDATION', message: 'Yêu cầu không phải JSON hợp lệ.' } }); }
    return out(Q.handle(body));
  };
  Q.doGet = function () { return out(Q.handle({ action: 'system.health' })); };
})(QLCV);

// Hàm toàn cục bắt buộc của Apps Script
function doPost(e) { return QLCV.doPost(e); }
function doGet(e) { return QLCV.doGet(e); }
