/**
 * Use case: quản lý người dùng (R12, R16). Xóa người dùng KHÔNG được phép (giữ lịch sử); chỉ vô hiệu hóa.
 * Chống tự khóa và luôn giữ ít nhất một Admin hoạt động nằm ở Q.Domain.User.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, L = Q.Config.LIMITS, E = Q.Enums, D = Q.Domain;

  function roleMap() { var m = {}; Q.Repo.roles.all().forEach(function (r) { m[r.role_id] = r; }); return m; }
  function activeAdmins() {
    return Q.Repo.users.byRole(Q.Repo.roles.idByCode('Admin')).filter(function (u) { return u.status === 'active'; });
  }

  /** Đếm người dùng hoạt động theo vai trò trên TOÀN BỘ bảng (không phụ thuộc trang đang xem). */
  function userCounts(users, roles) {
    var c = { active: 0, byRole: {} };
    users.forEach(function (u) {
      if (u.status !== 'active') return;
      c.active++;
      var r = roles[u.role_id];
      if (r) c.byRole[r.code] = (c.byRole[r.code] || 0) + 1;
    });
    return c;
  }

  var Users = Q.UserService = {};

  Users.list = function (ctx, p) {
    P.require(ctx, 'user.manage');
    p = p || {};
    var roles = roleMap(), rows = Q.Repo.users.all();
    if (p.status) rows = rows.filter(function (u) { return u.status === p.status; });
    if (p.roleCode) rows = rows.filter(function (u) { return roles[u.role_id] && roles[u.role_id].code === p.roleCode; });
    if (p.q) { var q = U.norm(String(p.q).slice(0, 100)); rows = rows.filter(function (u) { return U.norm(u.full_name + ' ' + u.email + ' ' + u.employee_code).indexOf(q) >= 0; }); }
    rows = U.sortBy(rows, function (u) { return u.user_id; }, 'asc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (u) { return Q.Presenters.user(u, roles); });
    page.roles = Object.keys(roles).map(function (k) { return { roleId: roles[k].role_id, code: roles[k].code, name: roles[k].name }; });
    page.counts = userCounts(Q.Repo.users.all(), roles);
    return page;
  };

  /** Danh sách chọn người thực hiện: người có quyền giao việc thấy mọi CBTD; CBTD chỉ thấy chính mình (R6). */
  Users.options = function (ctx) {
    var cbtdId = Q.Repo.roles.idByCode('CBTD');
    var list = P.isScoped(ctx)
      ? [ctx.user]
      : Q.Repo.users.byRole(cbtdId).filter(function (u) { return u.status === 'active'; });
    if (!P.isScoped(ctx) && !(P.has(ctx, 'task.create') || P.has(ctx, 'task.transfer') || P.has(ctx, 'task.update'))) {
      U.fail('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    }
    return { items: list.map(function (u) { return { userId: u.user_id, fullName: u.full_name, orgUnit: u.org_unit, employeeCode: u.employee_code }; }) };
  };

  Users.create = function (ctx, p, meta) {
    P.require(ctx, 'user.manage');
    var key = 'evt-user.create-' + meta.requestId;
    var dup = Q.Audit.find(key);
    if (dup) return { user: Q.Presenters.user(Q.Repo.users.find(dup.entity_id), roleMap()), replayed: true };

    var email = U.email(p.email, { field: 'email' });
    var code = U.str(p.employeeCode, { field: 'employeeCode', label: 'Mã cán bộ', required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/ });
    var name = U.str(p.fullName, { field: 'fullName', label: 'Họ tên', required: true, max: L.name });
    var org = U.str(p.orgUnit, { field: 'orgUnit', label: 'Đơn vị', required: true, max: L.org });
    var role = Q.Repo.roles.find(p.roleId);
    if (!role) U.invalid('roleId', 'Vai trò không hợp lệ.');
    if (Q.Repo.users.findBy('email', email).length) U.invalid('email', 'Email đã tồn tại.');
    if (Q.Repo.users.byEmployeeCode(code).length) U.invalid('employeeCode', 'Mã cán bộ đã tồn tại.');
    var now = U.isoNow();
    var u = Q.Repo.users.insert({
      user_id: Q.Repo.users.nextId(), email: email, employee_code: code, full_name: name, role_id: role.role_id,
      org_unit: org, status: 'active', created_at: now, updated_at: now
    });
    Q.Audit.log(ctx, 'user.create', 'User', u.user_id, key);
    return { user: Q.Presenters.user(u, roleMap()), replayed: false };
  };

  Users.update = function (ctx, p, meta) {
    P.require(ctx, 'user.manage');
    var u = Q.Repo.users.find(p.userId);
    if (!u) U.fail('NOT_FOUND', 'Không tìm thấy người dùng.');
    var patch = {};
    if (p.fullName !== undefined) patch.full_name = U.str(p.fullName, { field: 'fullName', label: 'Họ tên', required: true, max: L.name });
    if (p.orgUnit !== undefined) patch.org_unit = U.str(p.orgUnit, { field: 'orgUnit', label: 'Đơn vị', required: true, max: L.org });
    if (p.employeeCode !== undefined) {
      patch.employee_code = U.str(p.employeeCode, { field: 'employeeCode', label: 'Mã cán bộ', required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/ });
      var same = Q.Repo.users.findBy('employee_code', patch.employee_code).filter(function (x) { return x.user_id !== u.user_id; });
      if (same.length) U.invalid('employeeCode', 'Mã cán bộ đã tồn tại.');
    }
    if (p.roleId !== undefined) { if (!Q.Repo.roles.find(p.roleId)) U.invalid('roleId', 'Vai trò không hợp lệ.'); patch.role_id = p.roleId; }
    if (p.status !== undefined) patch.status = U.oneOf(p.status, E.userStatus, { field: 'status', label: 'Trạng thái', required: true });
    if (!Object.keys(patch).length) U.invalid(null, 'Không có thay đổi nào để lưu.');

    D.User.assertKeepsAnAdmin(ctx.user.user_id, u, Q.Repo.roles.idByCode('Admin'), patch, function () { return activeAdmins().length; });
    D.User.assertNotSelfDeactivate(ctx.user.user_id, u.user_id, patch);

    patch.updated_at = U.isoNow();
    var up = Q.Repo.users.update(u.user_id, patch);
    Q.Audit.log(ctx, 'user.update', 'User', u.user_id, 'evt-user.update-' + meta.requestId);
    return { user: Q.Presenters.user(up, roleMap()) };
  };
})(QLCV);
