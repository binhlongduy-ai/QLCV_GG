/**
 * Bảng điều khiển (R10, R15) và thông báo trong ứng dụng (R11).
 * Mọi số liệu tính động trên đúng tập bản ghi người dùng được phép xem (R3) – không có bảng tổng hợp tĩnh.
 * Không có số liệu tín dụng (dư nợ, nhóm nợ).
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy;
  function S() { return Q.Store; }

  function unread(ctx) {
    return S().findBy('Notifications', 'recipient_user_id', ctx.user.user_id).filter(function (n) { return !n.read_at; }).length;
  }

  var D = Q.DashboardService = {};

  D.me = function (ctx) {
    var start = ctx.role === 'CBTD' ? 'tasks' : ctx.role === 'KSV' ? 'reviews' : ctx.role === 'Admin' ? 'admin' : 'dashboard';
    return {
      user: { userId: ctx.user.user_id, email: ctx.user.email, fullName: ctx.user.full_name,
        employeeCode: ctx.user.employee_code, orgUnit: ctx.user.org_unit },
      role: { code: ctx.role, name: ctx.roleName },
      permissions: Object.keys(ctx.perms).sort(),
      isDirector: ctx.isDirector,
      startView: start,
      unreadNotifications: unread(ctx),
      today: U.today(), serverTime: U.isoNow(), version: Q.Config.VERSION
    };
  };

  D.get = function (ctx) {
    P.require(ctx, 'dashboard.view');
    var today = U.today();
    var tasks = P.visibleTasks(ctx).filter(function (t) { return !t.archived_at; });
    var open = tasks.filter(function (t) { return t.status !== 'completed'; });
    function n(status) { return tasks.filter(function (t) { return t.status === status; }).length; }
    var overdue = open.filter(function (t) { return t.due_at < today; });   // hạn = hôm nay chưa tính quá hạn
    var kpis = {
      inProgress: n('in_progress'), notStarted: n('not_started'), completed: n('completed'),
      overdue: overdue.length, total: tasks.length,
      dueToday: open.filter(function (t) { return t.due_at === today; }).length,
      completionRate: tasks.length ? Math.round(n('completed') * 100 / tasks.length) : 0,
      customers: P.visibleCustomers(ctx).filter(function (c) { return !c.archived_at; }).length
    };
    var out = { kpis: kpis, today: today, byStatus: [
      { status: 'not_started', count: kpis.notStarted }, { status: 'in_progress', count: kpis.inProgress },
      { status: 'completed', count: kpis.completed }] };

    var visible = {};
    tasks.forEach(function (t) { visible[t.task_id] = true; });
    if (P.has(ctx, 'progress.review')) {
      var pend = S().where('TaskUpdates', function (u) { return u.review_status === 'pending'; });
      kpis.pendingReviews = pend.length;
    }
    if (!P.isScoped(ctx)) {
      var rows = {};
      S().all('TaskAssignees').forEach(function (a) {
        if (!a.active || a.assignment_role !== 'primary' || !visible[a.task_id]) return;
        var t = S().find('Tasks', a.task_id), u = S().find('Users', a.user_id);
        if (t.status === 'completed') return;
        var r = rows[a.user_id] = rows[a.user_id] || { userId: a.user_id, name: u ? u.full_name : a.user_id, open: 0, overdue: 0 };
        r.open++; if (t.due_at < today) r.overdue++;
      });
      out.byAssignee = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.open - a.open; });
    }
    var soon = U.sortBy(open, function (t) { return t.due_at + t.task_code; }, 'asc').slice(0, 5);
    out.upcoming = Q.DTO.tasks(ctx, soon);
    return out;
  };

  /** R15 – công việc ưu tiên cho Giám đốc: (ưu tiên cao HOẶC quá hạn) VÀ chưa hoàn thành. */
  D.director = function (ctx) {
    P.require(ctx, 'dashboard.view_director');
    var today = U.today();
    var rows = P.visibleTasks(ctx).filter(function (t) {
      return Q.Rules.isOpen(t) && (t.priority === 'high' || Q.Rules.isLate(t, today));
    });
    rows = U.sortBy(rows, function (t) { return (t.due_at < today ? '0' : '1') + t.due_at + t.task_code; }, 'asc');
    var dtos = Q.DTO.tasks(ctx, rows);
    return {
      today: today, total: dtos.length,
      highOpen: dtos.filter(function (d) { return d.priority === 'high'; }).length,
      overdue: dtos.filter(function (d) { return d.overdue; }).length,
      items: dtos
    };
  };

  /* ---------- Thông báo ---------- */
  var N = Q.NotificationService = {};

  N.list = function (ctx, p) {
    P.require(ctx, 'notification.view');
    p = p || {};
    var rows = S().findBy('Notifications', 'recipient_user_id', ctx.user.user_id);
    if (U.bool(p.unreadOnly)) rows = rows.filter(function (r) { return !r.read_at; });
    rows = U.sortBy(rows, function (r) { return r.created_at + r.notification_id; }, 'desc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (r) {
      return { notificationId: r.notification_id, eventType: r.event_type, sourceRecordId: r.source_record_id,
        message: r.message, createdAt: r.created_at, readAt: r.read_at || null };
    });
    page.unread = unread(ctx);
    return page;
  };

  N.count = function (ctx) { P.require(ctx, 'notification.view'); return { unread: unread(ctx) }; };

  N.markRead = function (ctx, p) {
    P.require(ctx, 'notification.view');
    var ids = Array.isArray(p.ids) ? p.ids.slice(0, 100) : [];
    var now = U.isoNow(), n = 0;
    ids.forEach(function (id) {
      var r = S().find('Notifications', id);
      // Chỉ chủ nhận mới đánh dấu được; id của người khác bị bỏ qua, không báo lỗi để không lộ sự tồn tại.
      if (r && r.recipient_user_id === ctx.user.user_id && !r.read_at) { S().update('Notifications', id, { read_at: now }); n++; }
    });
    return { updated: n, unread: unread(ctx) };
  };

  N.markAllRead = function (ctx) {
    P.require(ctx, 'notification.view');
    var now = U.isoNow(), n = 0;
    S().findBy('Notifications', 'recipient_user_id', ctx.user.user_id).forEach(function (r) {
      if (!r.read_at) { S().update('Notifications', r.notification_id, { read_at: now }); n++; }
    });
    return { updated: n, unread: 0 };
  };
})(QLCV);
