/**
 * Use case: bảng điều khiển (R10, R15) và thông tin phiên làm việc (auth.me).
 * Mọi số liệu tính động trên đúng tập bản ghi người dùng được phép xem (R3) – không có bảng tổng hợp tĩnh.
 * Không có số liệu tín dụng (dư nợ, nhóm nợ). Thông báo nằm ở 45_Svc_Notifications.js.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, D = Q.Domain;

  /** Số chưa đọc lấy từ dòng Users của người gọi (26_Derived.js), không đọc trọn Notifications. */
  function unreadCount(ctx) { return ctx.user.unread_notifications || 0; }

  var Dash = Q.DashboardService = {};

  /** Thông tin phiên: người dùng, vai trò, quyền, màn hình bắt đầu theo vai trò (R14). */
  Dash.me = function (ctx) {
    var start = ctx.role === 'CBTD' ? 'tasks' : ctx.role === 'KSV' ? 'reviews' : ctx.role === 'Admin' ? 'admin' : 'dashboard';
    return {
      user: { userId: ctx.user.user_id, email: ctx.user.email, fullName: ctx.user.full_name,
        employeeCode: ctx.user.employee_code, orgUnit: ctx.user.org_unit },
      role: { code: ctx.role, name: ctx.roleName },
      permissions: Object.keys(ctx.perms).sort(),
      isDirector: ctx.isDirector,
      startView: start,
      unreadNotifications: unreadCount(ctx),
      today: U.today(), serverTime: U.isoNow(), version: Q.Config.VERSION
    };
  };

  /** Số liệu chung trên phạm vi được xem. */
  Dash.get = function (ctx) {
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
      // Số chờ duyệt đếm trên toàn bộ báo cáo đang chờ (giữ nguyên hành vi trước khi tái cấu trúc).
      kpis.pendingReviews = Q.Repo.tasks.all().reduce(function (s, t) { return s + (t.pending_updates || 0); }, 0);
    }
    if (!P.isScoped(ctx)) {
      var rows = {};
      Q.Repo.assignments.all().forEach(function (a) {
        if (!a.active || a.assignment_role !== 'primary' || !visible[a.task_id]) return;
        var t = Q.Repo.tasks.find(a.task_id), u = Q.Repo.users.find(a.user_id);
        if (t.status === 'completed') return;
        var r = rows[a.user_id] = rows[a.user_id] || { userId: a.user_id, name: u ? u.full_name : a.user_id, open: 0, overdue: 0 };
        r.open++; if (t.due_at < today) r.overdue++;
      });
      out.byAssignee = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.open - a.open; });
    }
    var soon = U.sortBy(open, function (t) { return t.due_at + t.task_code; }, 'asc').slice(0, 5);
    out.upcoming = Q.Presenters.tasks(ctx, soon);
    return out;
  };

  /** R15 – công việc ưu tiên cho Giám đốc: (ưu tiên cao HOẶC quá hạn) VÀ chưa hoàn thành. */
  Dash.director = function (ctx) {
    P.require(ctx, 'dashboard.view_director');
    var today = U.today();
    var rows = P.visibleTasks(ctx).filter(function (t) {
      return D.Task.isOpen(t) && (t.priority === 'high' || D.Task.isLate(t, today));
    });
    rows = U.sortBy(rows, function (t) { return (t.due_at < today ? '0' : '1') + t.due_at + t.task_code; }, 'asc');
    var dtos = Q.Presenters.tasks(ctx, rows);
    return {
      today: today, total: dtos.length,
      highOpen: dtos.filter(function (d) { return d.priority === 'high'; }).length,
      overdue: dtos.filter(function (d) { return d.overdue; }).length,
      items: dtos
    };
  };

  /**
   * Tổng quan trong MỘT request: số liệu chung, và phần của Giám đốc nếu người dùng có quyền.
   * Thay cho hai lời gọi dashboard.get + dashboard.director (mỗi lời gọi phải xác thực và nạp lại dữ liệu).
   */
  Dash.overview = function (ctx) {
    return {
      dashboard: Dash.get(ctx),
      director: P.has(ctx, 'dashboard.view_director') ? Dash.director(ctx) : null
    };
  };
})(QLCV);
