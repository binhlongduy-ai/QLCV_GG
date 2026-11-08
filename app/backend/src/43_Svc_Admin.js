/**
 * Quản trị (R12, R16): người dùng, nhật ký kiểm toán, kiểm tra toàn vẹn, sao lưu.
 * Xóa người dùng KHÔNG được phép (giữ lịch sử); chỉ vô hiệu hóa. Restore bị khóa cho tới khi qua kiểm thử U7.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, L = Q.Config.LIMITS, E = Q.Enums;
  function S() { return Q.Store; }

  function roleMap() { var m = {}; S().all('Roles').forEach(function (r) { m[r.role_id] = r; }); return m; }
  function roleIdByCode(code) {
    var r = S().findBy('Roles', 'code', code)[0];
    return r ? r.role_id : null;
  }
  function activeAdmins() {
    var id = roleIdByCode('Admin');
    return S().all('Users').filter(function (u) { return u.role_id === id && u.status === 'active'; });
  }

  var A = Q.AdminService = {};

  /* ---------- Người dùng ---------- */
  A.userList = function (ctx, p) {
    P.require(ctx, 'user.manage');
    p = p || {};
    var roles = roleMap(), rows = S().all('Users');
    if (p.status) rows = rows.filter(function (u) { return u.status === p.status; });
    if (p.roleCode) rows = rows.filter(function (u) { return roles[u.role_id] && roles[u.role_id].code === p.roleCode; });
    if (p.q) { var q = U.norm(String(p.q).slice(0, 100)); rows = rows.filter(function (u) { return U.norm(u.full_name + ' ' + u.email + ' ' + u.employee_code).indexOf(q) >= 0; }); }
    rows = U.sortBy(rows, function (u) { return u.user_id; }, 'asc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (u) { return Q.DTO.user(u, roles); });
    page.roles = Object.keys(roles).map(function (k) { return { roleId: roles[k].role_id, code: roles[k].code, name: roles[k].name }; });
    return page;
  };

  /** Danh sách chọn người thực hiện: người có quyền giao việc thấy mọi CBTD; CBTD chỉ thấy chính mình (R6). */
  A.userOptions = function (ctx) {
    var cbtdId = roleIdByCode('CBTD');
    var list = P.isScoped(ctx)
      ? [ctx.user]
      : S().all('Users').filter(function (u) { return u.role_id === cbtdId && u.status === 'active'; });
    if (!P.isScoped(ctx) && !(P.has(ctx, 'task.create') || P.has(ctx, 'task.transfer') || P.has(ctx, 'task.update'))) {
      U.fail('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    }
    return { items: list.map(function (u) { return { userId: u.user_id, fullName: u.full_name, orgUnit: u.org_unit, employeeCode: u.employee_code }; }) };
  };

  A.userCreate = function (ctx, p, meta) {
    P.require(ctx, 'user.manage');
    var key = 'evt-user.create-' + meta.requestId;
    var dup = S().findBy('AuditLogs', 'request_or_event_key', key)[0];
    if (dup) return { user: Q.DTO.user(S().find('Users', dup.entity_id), roleMap()), replayed: true };

    var email = U.email(p.email, { field: 'email' });
    var code = U.str(p.employeeCode, { field: 'employeeCode', label: 'Mã cán bộ', required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/ });
    var name = U.str(p.fullName, { field: 'fullName', label: 'Họ tên', required: true, max: L.name });
    var org = U.str(p.orgUnit, { field: 'orgUnit', label: 'Đơn vị', required: true, max: L.org });
    var role = S().find('Roles', p.roleId);
    if (!role) U.invalid('roleId', 'Vai trò không hợp lệ.');
    if (S().findBy('Users', 'email', email).length) U.invalid('email', 'Email đã tồn tại.');
    if (S().findBy('Users', 'employee_code', code).length) U.invalid('employeeCode', 'Mã cán bộ đã tồn tại.');
    var now = U.isoNow();
    var u = S().insert('Users', {
      user_id: S().nextId('Users'), email: email, employee_code: code, full_name: name, role_id: role.role_id,
      org_unit: org, status: 'active', created_at: now, updated_at: now
    });
    Q.Audit.log(ctx, 'user.create', 'User', u.user_id, key);
    return { user: Q.DTO.user(u, roleMap()), replayed: false };
  };

  A.userUpdate = function (ctx, p, meta) {
    P.require(ctx, 'user.manage');
    var u = S().find('Users', p.userId);
    if (!u) U.fail('NOT_FOUND', 'Không tìm thấy người dùng.');
    var patch = {};
    if (p.fullName !== undefined) patch.full_name = U.str(p.fullName, { field: 'fullName', label: 'Họ tên', required: true, max: L.name });
    if (p.orgUnit !== undefined) patch.org_unit = U.str(p.orgUnit, { field: 'orgUnit', label: 'Đơn vị', required: true, max: L.org });
    if (p.employeeCode !== undefined) {
      patch.employee_code = U.str(p.employeeCode, { field: 'employeeCode', label: 'Mã cán bộ', required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/ });
      var same = S().findBy('Users', 'employee_code', patch.employee_code).filter(function (x) { return x.user_id !== u.user_id; });
      if (same.length) U.invalid('employeeCode', 'Mã cán bộ đã tồn tại.');
    }
    if (p.roleId !== undefined) { if (!S().find('Roles', p.roleId)) U.invalid('roleId', 'Vai trò không hợp lệ.'); patch.role_id = p.roleId; }
    if (p.status !== undefined) patch.status = U.oneOf(p.status, E.userStatus, { field: 'status', label: 'Trạng thái', required: true });
    if (!Object.keys(patch).length) U.invalid(null, 'Không có thay đổi nào để lưu.');

    // Chống tự khóa: không hạ quyền/vô hiệu hóa chính mình, không bỏ Admin cuối cùng.
    var adminId = roleIdByCode('Admin');
    var losesAdmin = (patch.role_id && patch.role_id !== adminId && u.role_id === adminId) || (patch.status === 'inactive' && u.role_id === adminId);
    if (losesAdmin) {
      if (u.user_id === ctx.user.user_id) U.fail('CONFLICT', 'Không thể tự hạ quyền hoặc vô hiệu hóa tài khoản Admin của chính mình.');
      if (activeAdmins().length <= 1) U.fail('CONFLICT', 'Hệ thống phải còn ít nhất một Admin đang hoạt động.');
    }
    if (u.user_id === ctx.user.user_id && patch.status === 'inactive') U.fail('CONFLICT', 'Không thể tự vô hiệu hóa tài khoản của mình.');

    patch.updated_at = U.isoNow();
    var up = S().update('Users', u.user_id, patch);
    Q.Audit.log(ctx, 'user.update', 'User', u.user_id, 'evt-user.update-' + meta.requestId);
    return { user: Q.DTO.user(up, roleMap()) };
  };

  /* ---------- Nhật ký kiểm toán ---------- */
  A.auditList = function (ctx, p) {
    P.require(ctx, 'audit.view');
    p = p || {};
    var rows = S().all('AuditLogs');
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

  /* ---------- Kiểm tra toàn vẹn (cùng bộ quy tắc với tools/appsheet/check-integrity.js) ---------- */
  A.integrity = function (ctx, p) {
    P.require(ctx, 'user.manage');
    var issues = [];
    function bad(t, id, msg) { issues.push({ table: t, id: id, message: msg }); }

    Q.Schema.names.forEach(function (t) {
      var def = Q.Schema.tables[t];
      if (def.pk) {
        var seen = {};
        S().all(t).forEach(function (r) { if (seen[r[def.pk]]) bad(t, r[def.pk], 'Khóa chính trùng'); seen[r[def.pk]] = 1; });
      }
    });
    function uniq(t, col) {
      var seen = {};
      S().all(t).forEach(function (r) { var v = String(r[col]); if (seen[v]) bad(t, r[Q.Schema.tables[t].pk], col + ' trùng: ' + v); seen[v] = 1; });
    }
    uniq('Users', 'email'); uniq('Users', 'employee_code'); uniq('Customers', 'customer_code'); uniq('Tasks', 'task_code');
    uniq('Notifications', 'request_or_event_key'); uniq('AuditLogs', 'request_or_event_key');

    function ref(t, col, pt) {
      S().all(t).forEach(function (r) {
        var v = r[col];
        if (v && !S().find(pt, v)) bad(t, r[Q.Schema.tables[t].pk] || '-', col + ' trỏ tới ' + pt + ' không tồn tại: ' + v);
      });
    }
    ref('Users', 'role_id', 'Roles'); ref('Tasks', 'customer_id', 'Customers'); ref('Tasks', 'created_by_user_id', 'Users');
    ref('TaskAssignees', 'task_id', 'Tasks'); ref('TaskAssignees', 'user_id', 'Users');
    ref('TaskUpdates', 'task_id', 'Tasks'); ref('TaskUpdates', 'submitted_by_user_id', 'Users'); ref('TaskUpdates', 'reviewed_by_user_id', 'Users');
    ref('Notifications', 'recipient_user_id', 'Users'); ref('AuditLogs', 'actor_user_id', 'Users');

    S().all('Tasks').forEach(function (t) {
      var act = Q.Core.activeAssignments(t.task_id);
      var prim = act.filter(function (a) { return a.assignment_role === 'primary'; });
      var col = act.filter(function (a) { return a.assignment_role === 'collaborator'; });
      if (prim.length !== 1) bad('Tasks', t.task_id, 'Phải có đúng 1 người phụ trách chính đang hoạt động (hiện ' + prim.length + ')');
      if (col.length > 1) bad('Tasks', t.task_id, 'Có hơn 1 người phối hợp đang hoạt động');
      if (prim[0] && col[0] && prim[0].user_id === col[0].user_id) bad('Tasks', t.task_id, 'Người phụ trách chính trùng người phối hợp');
      if (t.status === 'completed' && !t.completed_at) bad('Tasks', t.task_id, 'Đã hoàn thành nhưng thiếu completed_at');
      if (t.status !== 'completed' && t.completed_at) bad('Tasks', t.task_id, 'Chưa hoàn thành nhưng có completed_at');
    });
    S().all('TaskUpdates').forEach(function (u) {
      if (u.progress_pct === null || u.progress_pct < 0 || u.progress_pct > 100) bad('TaskUpdates', u.update_id, 'Tiến độ ngoài 0–100');
      if (u.review_status !== 'pending' && (!u.reviewed_by_user_id || !u.reviewed_at)) bad('TaskUpdates', u.update_id, 'Đã duyệt/từ chối nhưng thiếu người duyệt hoặc thời điểm');
      if (u.review_status === 'pending' && u.reviewed_by_user_id) bad('TaskUpdates', u.update_id, 'Đang chờ duyệt nhưng đã có người duyệt');
      if (u.review_status === 'rejected' && !u.review_comment) bad('TaskUpdates', u.update_id, 'Từ chối nhưng thiếu lý do');
      var t = S().find('Tasks', u.task_id);
      if (t && u.review_status === 'approved' && u.progress_pct === 100 && t.status !== 'completed') {
        bad('TaskUpdates', u.update_id, 'Đã duyệt 100% nhưng công việc chưa hoàn thành (có thể sửa bằng admin.reconcile)');
      }
    });
    return { ok: issues.length === 0, issueCount: issues.length, issues: issues.slice(0, 200), checkedAt: U.isoNow() };
  };

  /** Vá các hệ quả duyệt bị đứt giữa chừng (an toàn, idempotent). */
  A.reconcile = function (ctx) {
    P.require(ctx, 'user.manage');
    var fixed = [];
    S().all('TaskUpdates').forEach(function (u) {
      var t = S().find('Tasks', u.task_id);
      if (t && u.review_status === 'approved' && u.progress_pct === 100 && t.status !== 'completed') {
        Q.ProgressService._ensureReviewEffects(ctx, u);
        fixed.push(u.update_id);
      }
    });
    if (fixed.length) Q.Audit.log(ctx, 'admin.reconcile', 'System', 'reconcile', 'evt-reconcile-' + Q.Env.uuid());
    return { fixed: fixed };
  };

  /* ---------- Sao lưu (R16) ---------- */
  A.backup = function (ctx) {
    P.require(ctx, 'user.manage');
    if (Q.Env.runtime !== 'gas') return { enabled: false, message: 'Sao lưu chỉ khả dụng trên môi trường Google Workspace.' };
    var res = Q.Backup.run('manual');
    Q.Audit.log(ctx, 'admin.backup', 'System', res.fileId, 'evt-backup-' + Q.Env.uuid());
    return res;
  };

  A.restore = function (ctx) {
    P.require(ctx, 'user.manage');
    U.fail('NOT_ENABLED', 'Khôi phục dữ liệu bị khóa trên môi trường sản xuất cho tới khi hoàn tất kiểm thử U7. Hãy thực hiện theo operations-runbook.');
  };
})(QLCV);
