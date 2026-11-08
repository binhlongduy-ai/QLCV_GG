/**
 * Use case: thông báo trong ứng dụng (R11). Mỗi người chỉ thấy và đánh dấu được thông báo gửi đến chính mình.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy;

  function unreadCount(ctx) { return Q.Repo.notifications.unreadFor(ctx.user.user_id).length; }

  var N = Q.NotificationService = {};

  N.list = function (ctx, p) {
    P.require(ctx, 'notification.view');
    p = p || {};
    var rows = Q.Repo.notifications.forRecipient(ctx.user.user_id);
    if (U.bool(p.unreadOnly)) rows = rows.filter(function (r) { return !r.read_at; });
    rows = U.sortBy(rows, function (r) { return r.created_at + r.notification_id; }, 'desc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (r) {
      return { notificationId: r.notification_id, eventType: r.event_type, sourceRecordId: r.source_record_id,
        message: r.message, createdAt: r.created_at, readAt: r.read_at || null };
    });
    page.unread = unreadCount(ctx);
    return page;
  };

  N.count = function (ctx) { P.require(ctx, 'notification.view'); return { unread: unreadCount(ctx) }; };

  N.markRead = function (ctx, p) {
    P.require(ctx, 'notification.view');
    var ids = Array.isArray(p.ids) ? p.ids.slice(0, 100) : [];
    var now = U.isoNow(), n = 0;
    ids.forEach(function (id) {
      var r = Q.Repo.notifications.find(id);
      // Chỉ chủ nhận mới đánh dấu được; id của người khác bị bỏ qua, không báo lỗi để không lộ sự tồn tại.
      if (r && r.recipient_user_id === ctx.user.user_id && !r.read_at) { Q.Repo.notifications.update(id, { read_at: now }); n++; }
    });
    return { updated: n, unread: unreadCount(ctx) };
  };

  N.markAllRead = function (ctx) {
    P.require(ctx, 'notification.view');
    var now = U.isoNow(), n = 0;
    Q.Repo.notifications.forRecipient(ctx.user.user_id).forEach(function (r) {
      if (!r.read_at) { Q.Repo.notifications.update(r.notification_id, { read_at: now }); n++; }
    });
    return { updated: n, unread: 0 };
  };
})(QLCV);
