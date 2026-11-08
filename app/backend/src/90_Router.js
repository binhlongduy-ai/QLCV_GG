/**
 * Điểm vào và bảng định tuyến (composition root của lõi backend).
 * Một endpoint duy nhất: POST { action, idToken, params, requestId } -> { ok, data | error, meta }.
 * Bảng ACTIONS là nơi DUY NHẤT nối tên action với use case; thêm nghiệp vụ = thêm dòng ở đây.
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
    'dashboard.overview': { fn: Q.DashboardService.overview },

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

    'user.options': { fn: Q.UserService.options },
    'user.list': { fn: Q.UserService.list },
    'user.create': { write: true, fn: Q.UserService.create },
    'user.update': { write: true, fn: Q.UserService.update },

    'audit.list': { fn: Q.AuditService.list },
    'admin.integrity': { fn: Q.IntegrityService.check },
    'admin.reconcile': { write: true, fn: Q.IntegrityService.reconcile },
    'admin.backup': { write: true, fn: Q.MaintenanceService.backup },
    'admin.restore': { write: true, fn: Q.MaintenanceService.restore }
  };

  /** Xử lý một request đã parse (dùng cho cả Apps Script, demo trình duyệt và kiểm thử). */
  Q.handle = function (body) { return Q.Pipeline.run(body, ACTIONS); };
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
