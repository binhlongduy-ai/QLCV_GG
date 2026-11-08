/**
 * Xác thực (R1) và phân quyền cấp dữ liệu (R3).
 * - Danh tính: Google ID token, kiểm tra aud/iss/exp/email_verified (+ hd nếu cấu hình) rồi ánh xạ sang dòng Users đang hoạt động.
 * - Quyền: tra từ tab RolePermissions (dữ liệu, không ghi cứng) + phạm vi bản ghi cho CBTD.
 * Ẩn nút trên giao diện KHÔNG phải là phân quyền; mọi action đều kiểm tra lại ở đây.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  var Auth = Q.Auth = {};

  Auth.verifyToken = function (idToken) {
    var Env = Q.Env;
    if (typeof idToken !== 'string' || !idToken || idToken.length > 4096) {
      U.fail('UNAUTHENTICATED', 'Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.');
    }
    if (Env.allowDemoTokens && idToken.indexOf('demo:') === 0) return { email: idToken.slice(5).toLowerCase() };

    var ck = 'tok:' + Env.sha256(idToken), hit = Env.cacheGet(ck);
    if (hit) { try { return JSON.parse(hit); } catch (e) { /* bỏ qua, xác minh lại */ } }

    var clientId = Env.prop('GOOGLE_CLIENT_ID') || '980548527328-g4aiprfddm1fblgc376iuunrsh9o54j9.apps.googleusercontent.com';
    if (!clientId) U.fail('INTERNAL', 'Máy chủ chưa cấu hình GOOGLE_CLIENT_ID.');
    var r = Env.fetchJson('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (r.status !== 200 || !r.json) U.fail('UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

    var t = r.json, nowSec = Math.floor(Env.now().getTime() / 1000);
    if (t.aud !== clientId) U.fail('UNAUTHENTICATED', 'Mã đăng nhập không dành cho ứng dụng này.');
    if (['accounts.google.com', 'https://accounts.google.com'].indexOf(t.iss) < 0) U.fail('UNAUTHENTICATED', 'Nhà phát hành mã đăng nhập không hợp lệ.');
    if (String(t.email_verified) !== 'true' || !t.email) U.fail('UNAUTHENTICATED', 'Email Google chưa được xác minh.');
    if (Number(t.exp) <= nowSec) U.fail('UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn.');
    var hd = Env.prop('ALLOWED_DOMAIN');
    if (hd && String(t.hd || '').toLowerCase() !== hd.toLowerCase()) U.fail('FORBIDDEN', 'Tài khoản không thuộc tổ chức được phép.');

    var out = { email: String(t.email).toLowerCase() };
    Env.cachePut(ck, JSON.stringify(out), Math.min(Q.Config.TOKEN_CACHE_SEC, Number(t.exp) - nowSec));
    return out;
  };

  /** Trả về dòng Users đang hoạt động ứng với token. */
  Auth.authenticate = function (idToken) {
    var id = Auth.verifyToken(idToken);
    var user = Q.Store.findBy('Users', 'email', id.email)[0];
    if (!user) U.fail('FORBIDDEN', 'Tài khoản ' + id.email + ' chưa được cấp quyền sử dụng hệ thống.');
    if (user.status !== 'active') U.fail('FORBIDDEN', 'Tài khoản đã bị vô hiệu hóa.');
    return user;
  };

  var Policy = Q.Policy = {};

  function directorEmails() {
    return String(Q.Env.prop('DIRECTOR_EMAILS') || '').split(',')
      .map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }

  Policy.build = function (user) {
    var S = Q.Store, role = S.find('Roles', user.role_id);
    if (!role) U.fail('FORBIDDEN', 'Vai trò của tài khoản không hợp lệ.');
    var perms = {};
    S.findBy('RolePermissions', 'role_id', user.role_id).forEach(function (rp) {
      var p = S.find('Permissions', rp.permission_id);
      if (p) perms[p.code] = true;
    });
    // Cơ chế xác định "Giám đốc" trong BGD (điểm còn mở của plan): danh sách DIRECTOR_EMAILS.
    var isDirector = role.code === 'BGD' && directorEmails().indexOf(user.email) >= 0;
    if (isDirector) { perms['task.transfer'] = true; perms['dashboard.view_director'] = true; }
    return { user: user, role: role.code, roleName: role.name, perms: perms, isDirector: isDirector };
  };

  Policy.has = function (ctx, code) { return ctx.perms[code] === true; };
  Policy.require = function (ctx, code) {
    if (!ctx.perms[code]) U.fail('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', { permission: code });
  };
  Policy.isScoped = function (ctx) { return ctx.role === 'CBTD'; };

  /** Công việc mà người dùng đang được phân công (primary/collaborator còn hiệu lực). */
  Policy.assignedTaskIds = function (userId) {
    var ids = {};
    Q.Store.findBy('TaskAssignees', 'user_id', userId).forEach(function (a) { if (a.active) ids[a.task_id] = true; });
    return ids;
  };
  Policy.isAssignee = function (ctx, taskId) { return !!Policy.assignedTaskIds(ctx.user.user_id)[taskId]; };

  Policy.visibleTasks = function (ctx) {
    var tasks = Q.Store.all('Tasks');
    if (!Policy.isScoped(ctx)) return tasks;
    var mine = Policy.assignedTaskIds(ctx.user.user_id);
    return tasks.filter(function (t) { return mine[t.task_id]; });
  };

  /** Trả về công việc nếu nằm trong phạm vi; ngoài phạm vi trả NOT_FOUND để không lộ sự tồn tại. */
  Policy.taskOrFail = function (ctx, taskId) {
    var t = Q.Store.find('Tasks', taskId);
    if (!t || (Policy.isScoped(ctx) && !Policy.isAssignee(ctx, taskId))) U.fail('NOT_FOUND', 'Không tìm thấy công việc.');
    return t;
  };

  Policy.visibleCustomers = function (ctx) {
    var all = Q.Store.all('Customers');
    if (!Policy.isScoped(ctx)) return all;
    var ids = {};
    Policy.visibleTasks(ctx).forEach(function (t) { ids[t.customer_id] = true; });
    return all.filter(function (c) { return ids[c.customer_id]; });
  };

  Policy.customerOrFail = function (ctx, id) {
    var c = Q.Store.find('Customers', id);
    if (!c) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    if (Policy.isScoped(ctx)) {
      var ok = Policy.visibleTasks(ctx).some(function (t) { return t.customer_id === id; });
      if (!ok) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
    return c;
  };
})(QLCV);
