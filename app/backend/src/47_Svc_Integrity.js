/**
 * Use case: kiểm tra toàn vẹn dữ liệu và vá hệ quả duyệt bị đứt (admin.reconcile).
 * Cùng bộ quy tắc với tools/appsheet/check-integrity.js. Chỉ quản trị viên (user.manage) được dùng.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy;

  var Integrity = Q.IntegrityService = {};

  /** Quét toàn bộ dữ liệu và trả về danh sách vấn đề (tối đa 200 dòng). */
  Integrity.check = function (ctx) {
    P.require(ctx, 'user.manage');
    var issues = [];
    function bad(t, id, msg) { issues.push({ table: t, id: id, message: msg }); }
    function all(t) { return Q.Repo.of(t).all(); }
    function find(t, id) { return Q.Repo.of(t).find(id); }

    Q.Schema.names.forEach(function (t) {
      var def = Q.Schema.tables[t];
      if (def.pk) {
        var seen = {};
        all(t).forEach(function (r) { if (seen[r[def.pk]]) bad(t, r[def.pk], 'Khóa chính trùng'); seen[r[def.pk]] = 1; });
      }
    });
    function uniq(t, col) {
      var seen = {};
      all(t).forEach(function (r) { var v = String(r[col]); if (seen[v]) bad(t, r[Q.Schema.tables[t].pk], col + ' trùng: ' + v); seen[v] = 1; });
    }
    uniq('Users', 'email'); uniq('Users', 'employee_code'); uniq('Customers', 'customer_code'); uniq('Tasks', 'task_code');
    uniq('Notifications', 'request_or_event_key'); uniq('AuditLogs', 'request_or_event_key');

    function ref(t, col, pt) {
      all(t).forEach(function (r) {
        var v = r[col];
        if (v && !find(pt, v)) bad(t, r[Q.Schema.tables[t].pk] || '-', col + ' trỏ tới ' + pt + ' không tồn tại: ' + v);
      });
    }
    ref('Users', 'role_id', 'Roles'); ref('Tasks', 'customer_id', 'Customers'); ref('Tasks', 'created_by_user_id', 'Users');
    ref('TaskAssignees', 'task_id', 'Tasks'); ref('TaskAssignees', 'user_id', 'Users');
    ref('TaskUpdates', 'task_id', 'Tasks'); ref('TaskUpdates', 'submitted_by_user_id', 'Users'); ref('TaskUpdates', 'reviewed_by_user_id', 'Users');
    ref('Notifications', 'recipient_user_id', 'Users'); ref('AuditLogs', 'actor_user_id', 'Users');

    all('Tasks').forEach(function (t) {
      var act = Q.Assignments.activeOf(t.task_id);
      var prim = act.filter(function (a) { return a.assignment_role === 'primary'; });
      var col = act.filter(function (a) { return a.assignment_role === 'collaborator'; });
      if (prim.length !== 1) bad('Tasks', t.task_id, 'Phải có đúng 1 người phụ trách chính đang hoạt động (hiện ' + prim.length + ')');
      if (col.length > 1) bad('Tasks', t.task_id, 'Có hơn 1 người phối hợp đang hoạt động');
      if (prim[0] && col[0] && prim[0].user_id === col[0].user_id) bad('Tasks', t.task_id, 'Người phụ trách chính trùng người phối hợp');
      if (t.status === 'completed' && !t.completed_at) bad('Tasks', t.task_id, 'Đã hoàn thành nhưng thiếu completed_at');
      if (t.status !== 'completed' && t.completed_at) bad('Tasks', t.task_id, 'Chưa hoàn thành nhưng có completed_at');
    });
    all('TaskUpdates').forEach(function (u) {
      if (u.progress_pct === null || u.progress_pct < 0 || u.progress_pct > 100) bad('TaskUpdates', u.update_id, 'Tiến độ ngoài 0–100');
      if (u.review_status !== 'pending' && (!u.reviewed_by_user_id || !u.reviewed_at)) bad('TaskUpdates', u.update_id, 'Đã duyệt/từ chối nhưng thiếu người duyệt hoặc thời điểm');
      if (u.review_status === 'pending' && u.reviewed_by_user_id) bad('TaskUpdates', u.update_id, 'Đang chờ duyệt nhưng đã có người duyệt');
      if (u.review_status === 'rejected' && !u.review_comment) bad('TaskUpdates', u.update_id, 'Từ chối nhưng thiếu lý do');
      var t = find('Tasks', u.task_id);
      if (t && u.review_status === 'approved' && u.progress_pct === 100 && t.status !== 'completed') {
        bad('TaskUpdates', u.update_id, 'Đã duyệt 100% nhưng công việc chưa hoàn thành (có thể sửa bằng admin.reconcile)');
      }
    });
    // Số liệu dẫn xuất (26_Derived.js) phải khớp nguồn; lệch thì sửa bằng admin.reconcile.
    var exp = Q.Derived.expected();
    all('Tasks').forEach(function (t) {
      var c = exp.tasks[t.task_id] || { approved: 0, pending: 0 };
      if (t.approved_progress !== c.approved) bad('Tasks', t.task_id, 'approved_progress lệch: ' + t.approved_progress + ' (đúng: ' + c.approved + ')');
      if (t.pending_updates !== c.pending) bad('Tasks', t.task_id, 'pending_updates lệch: ' + t.pending_updates + ' (đúng: ' + c.pending + ')');
    });
    all('Users').forEach(function (u) {
      var want = exp.users[u.user_id] || 0;
      if (u.unread_notifications !== want) bad('Users', u.user_id, 'unread_notifications lệch: ' + u.unread_notifications + ' (đúng: ' + want + ')');
    });
    return { ok: issues.length === 0, issueCount: issues.length, issues: issues.slice(0, 200), checkedAt: U.isoNow() };
  };

  /** Vá các hệ quả duyệt bị đứt giữa chừng (an toàn, idempotent). */
  Integrity.reconcile = function (ctx) {
    P.require(ctx, 'user.manage');
    var fixed = [];
    Q.Repo.updates.all().forEach(function (u) {
      var t = Q.Repo.tasks.find(u.task_id);
      if (t && u.review_status === 'approved' && u.progress_pct === 100 && t.status !== 'completed') {
        Q.ProgressService._ensureReviewEffects(ctx, u);
        fixed.push(u.update_id);
      }
    });
    var derived = Q.Derived.recomputeAll();
    if (fixed.length || derived.tasks || derived.users) Q.Audit.log(ctx, 'admin.reconcile', 'System', 'reconcile', 'evt-reconcile-' + Q.Env.uuid());
    return { fixed: fixed };
  };
})(QLCV);
