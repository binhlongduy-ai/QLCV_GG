/**
 * Tầng adapter truy cập dữ liệu. Đây là điểm DUY NHẤT trong lõi nghiệp vụ được chạm tới Q.Store;
 * các use case và Policy chỉ làm việc qua Q.Repo, nên đổi nơi lưu (Sheets / bộ nhớ / PostgreSQL)
 * chỉ cần thay driver bên dưới, không sửa nghiệp vụ.
 * Q.Store được đọc lúc gọi (không lúc nạp), vì môi trường bộ nhớ được gắn sau khi các tệp này đã chạy.
 */
(function (Q) {
  'use strict';

  function S() { return Q.Store; }

  /** Các thao tác chung cho mọi bảng. */
  function repoOf(table) {
    return {
      table: table,
      all: function () { return S().all(table); },
      find: function (id) { return S().find(table, id); },
      where: function (pred) { return S().where(table, pred); },
      findBy: function (col, val) { return S().findBy(table, col, val); },
      insert: function (obj) { return S().insert(table, obj); },
      insertMany: function (objs) { return S().insertMany(table, objs); },
      update: function (id, patch) { return S().update(table, id, patch); },
      nextId: function () { return S().nextId(table); },
      count: function () { return S().count(table); }
    };
  }

  var Repo = Q.Repo = {
    users: repoOf('Users'),
    roles: repoOf('Roles'),
    permissions: repoOf('Permissions'),
    rolePermissions: repoOf('RolePermissions'),
    customers: repoOf('Customers'),
    tasks: repoOf('Tasks'),
    assignments: repoOf('TaskAssignees'),
    updates: repoOf('TaskUpdates'),
    notifications: repoOf('Notifications'),
    audit: repoOf('AuditLogs')
  };

  /** Xóa bộ nhớ đệm dữ liệu của mọi bảng cho request hiện tại (đầu mỗi request). */
  Repo.resetCache = function () { S().reset(); };

  /** Repository của một bảng bất kỳ theo tên (dùng cho kiểm tra toàn vẹn quét mọi bảng). */
  Repo.of = repoOf;

  /* ---------- Truy vấn theo nghiệp vụ ---------- */
  Repo.users.byEmail = function (email) { return Repo.users.findBy('email', email)[0] || null; };
  Repo.users.byEmployeeCode = function (code) { return Repo.users.findBy('employee_code', code); };
  Repo.users.byRole = function (roleId) { return Repo.users.where(function (u) { return u.role_id === roleId; }); };

  Repo.roles.idByCode = function (code) {
    var r = Repo.roles.findBy('code', code)[0];
    return r ? r.role_id : null;
  };

  Repo.customers.byCode = function (code) { return Repo.customers.findBy('customer_code', code); };

  Repo.tasks.byCustomer = function (customerId) { return Repo.tasks.findBy('customer_id', customerId); };

  /** Toàn bộ phân công (kể cả đã gỡ) của một công việc. */
  Repo.assignments.forTask = function (taskId) { return Repo.assignments.findBy('task_id', taskId); };
  /** Phân công còn hiệu lực của một công việc. */
  Repo.assignments.activeForTask = function (taskId) {
    return Repo.assignments.forTask(taskId).filter(function (a) { return a.active; });
  };
  /** Phân công còn hiệu lực của một người dùng. */
  Repo.assignments.activeForUser = function (userId) {
    return Repo.assignments.findBy('user_id', userId).filter(function (a) { return a.active; });
  };

  Repo.updates.forTask = function (taskId) { return Repo.updates.findBy('task_id', taskId); };
  Repo.updates.pending = function () {
    return Repo.updates.where(function (u) { return u.review_status === 'pending'; });
  };

  Repo.notifications.forRecipient = function (userId) { return Repo.notifications.findBy('recipient_user_id', userId); };
  Repo.notifications.unreadFor = function (userId) {
    return Repo.notifications.forRecipient(userId).filter(function (n) { return !n.read_at; });
  };
  Repo.notifications.byKey = function (key) { return Repo.notifications.findBy('request_or_event_key', key); };

  Repo.audit.byKey = function (key) { return Repo.audit.findBy('request_or_event_key', key)[0] || null; };
})(QLCV);
