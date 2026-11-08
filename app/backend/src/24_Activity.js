/**
 * Ứng dụng: nhật ký kiểm toán (R12) và thông báo trong ứng dụng (R11).
 * Cả hai đều idempotent theo khóa sự kiện: ghi lại cùng một khóa sẽ không tạo dòng thứ hai.
 * Nội dung KHÔNG chứa dữ liệu khách hàng nhạy cảm, token hay mật khẩu.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  /** Nhật ký chỉ được ghi thêm. */
  Q.Audit = {
    /** Dòng nhật ký đã ghi với khóa này (dùng để chống ghi trùng khi thử lại), hoặc null. */
    find: function (key) { return Q.Repo.audit.byKey(key); },
    has: function (key) { return Q.Audit.find(key) !== null; },
    /** Ghi thêm một dòng; trả null nếu khóa đã tồn tại. */
    log: function (ctx, action, entityType, entityId, key) {
      if (Q.Audit.has(key)) return null;
      return Q.Repo.audit.insert({
        audit_id: Q.Repo.audit.nextId(),
        actor_user_id: ctx.user.user_id,
        actor_email_snapshot: ctx.user.email,
        action: action, entity_type: entityType, entity_id: entityId,
        request_or_event_key: key, created_at: U.isoNow()
      });
    }
  };

  Q.Notify = {
    /** Khóa khử trùng lặp: evt-<loại>-<bản ghi nguồn>-<người nhận>. */
    send: function (recipientId, eventType, sourceId, message) {
      var key = 'evt-' + eventType + '-' + sourceId + '-' + recipientId;
      if (Q.Repo.notifications.byKey(key).length) return null;
      var n = Q.Repo.notifications.insert({
        notification_id: Q.Repo.notifications.nextId(),
        recipient_user_id: recipientId, event_type: eventType, source_record_id: sourceId,
        request_or_event_key: key, message: String(message).slice(0, 300), created_at: U.isoNow(), read_at: ''
      });
      Q.Derived.onNotificationCreated(recipientId);
      return n;
    }
  };
})(QLCV);
