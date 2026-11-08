/**
 * Ứng dụng: xác thực người dùng và phân quyền (R1, R3).
 *  - Auth.authenticate: đổi ID token (Q.GoogleAuth) thành dòng Users đang hoạt động.
 *  - Q.Policy: ngữ cảnh quyền của người gọi (RBAC từ dữ liệu RolePermissions) và phạm vi bản ghi (CBTD chỉ thấy việc được giao).
 * Ẩn nút trên giao diện KHÔNG phải là phân quyền; mọi use case đều gọi Policy để kiểm tra lại.
 * Chỉ đọc dữ liệu qua Q.Repo, không chạm Q.Store trực tiếp.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  var Auth = Q.Auth = {};
  Auth.verifyToken = function (idToken) { return Q.GoogleAuth.verify(idToken); };

  /** Trả về dòng Users đang hoạt động ứng với token. */
  Auth.authenticate = function (idToken) {
    var id = Auth.verifyToken(idToken);
    var user = Q.Repo.users.byEmail(id.email);
    if (!user) U.fail('FORBIDDEN', 'Tài khoản ' + id.email + ' chưa được cấp quyền sử dụng hệ thống.');
    if (user.status !== 'active') U.fail('FORBIDDEN', 'Tài khoản đã bị vô hiệu hóa.');
    return user;
  };

  var Policy = Q.Policy = {};

  /** Email được coi là Giám đốc (cấp thêm quyền task.transfer và dashboard.view_director). Điểm còn mở của plan. */
  function directorEmails() {
    return String(Q.Env.prop('DIRECTOR_EMAILS') || '').split(',')
      .map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }

  var REF_KEY = 'ref:v1';

  /**
   * Vai trò và quyền (3 tab tham chiếu) gói gọn thành một khóa trong CacheService: các request sau không phải đọc 3 tab.
   * Hết hạn sau Q.Config.REF_CACHE_SEC giây; Policy.clearReference() xóa ngay (dùng sau khi nạp lại dữ liệu tham chiếu).
   */
  function loadReference() {
    var hit = Q.Env.cacheGet(REF_KEY);
    if (hit) { try { return JSON.parse(hit); } catch (e) { /* hỏng: đọc lại từ Sheets */ } }
    var ref = { roles: {}, byRole: {} }, codeById = {};
    Q.Repo.permissions.all().forEach(function (p) { codeById[p.permission_id] = p.code; });
    Q.Repo.roles.all().forEach(function (r) { ref.roles[r.role_id] = { code: r.code, name: r.name }; });
    Q.Repo.rolePermissions.all().forEach(function (rp) {
      var c = codeById[rp.permission_id];
      if (c) (ref.byRole[rp.role_id] = ref.byRole[rp.role_id] || []).push(c);
    });
    try { Q.Env.cachePut(REF_KEY, JSON.stringify(ref), Q.Config.REF_CACHE_SEC); } catch (e) { /* bộ nhớ đệm đầy: bỏ qua */ }
    return ref;
  }
  Policy.clearReference = function () { try { Q.Env.cacheRemove(REF_KEY); } catch (e) { /* bỏ qua */ } };

  /** Ngữ cảnh quyền của một người dùng: vai trò, tập quyền, cờ Giám đốc. */
  Policy.build = function (user) {
    var ref = loadReference(), role = ref.roles[user.role_id];
    if (!role) U.fail('FORBIDDEN', 'Vai trò của tài khoản không hợp lệ.');
    var perms = {};
    (ref.byRole[user.role_id] || []).forEach(function (code) { perms[code] = true; });
    var isDirector = role.code === 'BGD' && directorEmails().indexOf(user.email) >= 0;
    if (isDirector) { perms['task.transfer'] = true; perms['dashboard.view_director'] = true; }
    return { user: user, role: role.code, roleName: role.name, perms: perms, isDirector: isDirector };
  };

  Policy.has = function (ctx, code) { return ctx.perms[code] === true; };
  Policy.require = function (ctx, code) {
    if (!ctx.perms[code]) U.fail('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', { permission: code });
  };
  /** Phạm vi bị giới hạn: CBTD chỉ thấy công việc/khách hàng liên quan đến phân công của mình. */
  Policy.isScoped = function (ctx) { return ctx.role === 'CBTD'; };

  /** Công việc mà người dùng đang được phân công (primary/collaborator còn hiệu lực). */
  Policy.assignedTaskIds = function (userId) {
    var ids = {};
    Q.Repo.assignments.activeForUser(userId).forEach(function (a) { ids[a.task_id] = true; });
    return ids;
  };
  Policy.isAssignee = function (ctx, taskId) { return !!Policy.assignedTaskIds(ctx.user.user_id)[taskId]; };

  Policy.visibleTasks = function (ctx) {
    var tasks = Q.Repo.tasks.all();
    if (!Policy.isScoped(ctx)) return tasks;
    var mine = Policy.assignedTaskIds(ctx.user.user_id);
    return tasks.filter(function (t) { return mine[t.task_id]; });
  };

  /** Trả về công việc nếu nằm trong phạm vi; ngoài phạm vi trả NOT_FOUND để không lộ sự tồn tại. */
  Policy.taskOrFail = function (ctx, taskId) {
    var t = Q.Repo.tasks.find(taskId);
    if (!t || (Policy.isScoped(ctx) && !Policy.isAssignee(ctx, taskId))) U.fail('NOT_FOUND', 'Không tìm thấy công việc.');
    return t;
  };

  Policy.visibleCustomers = function (ctx) {
    var all = Q.Repo.customers.all();
    if (!Policy.isScoped(ctx)) return all;
    var ids = {};
    Policy.visibleTasks(ctx).forEach(function (t) { ids[t.customer_id] = true; });
    return all.filter(function (c) { return ids[c.customer_id]; });
  };

  Policy.customerOrFail = function (ctx, id) {
    var c = Q.Repo.customers.find(id);
    if (!c) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    if (Policy.isScoped(ctx)) {
      var ok = Policy.visibleTasks(ctx).some(function (t) { return t.customer_id === id; });
      if (!ok) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
    return c;
  };
})(QLCV);
