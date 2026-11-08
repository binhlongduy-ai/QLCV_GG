/** Use case: tra cứu nhật ký kiểm toán (R12). Chỉ đọc; không có thao tác sửa hay xóa. */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy;

  var Audit = Q.AuditService = {};

  Audit.list = function (ctx, p) {
    P.require(ctx, 'audit.view');
    p = p || {};
    var rows = Q.Repo.audit.all();
    if (p.action) rows = rows.filter(function (a) { return a.action === p.action; });
    if (p.actorUserId) rows = rows.filter(function (a) { return a.actor_user_id === p.actorUserId; });
    if (p.entityId) rows = rows.filter(function (a) { return a.entity_id === p.entityId; });
    if (p.from) rows = rows.filter(function (a) { return a.created_at.slice(0, 10) >= p.from; });
    if (p.to) rows = rows.filter(function (a) { return a.created_at.slice(0, 10) <= p.to; });
    rows = U.sortBy(rows, function (a) { return a.created_at + a.audit_id; }, 'desc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (a) {
      return { auditId: a.audit_id, actorUserId: a.actor_user_id, actorEmail: a.actor_email_snapshot, action: a.action,
        entityType: a.entity_type, entityId: a.entity_id, createdAt: a.created_at };
    });
    return page;
  };
})(QLCV);
