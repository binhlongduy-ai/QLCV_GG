/**
 * Thành phần dùng chung: nhật ký kiểm toán (R12), thông báo (R11), DTO trả về cho giao diện.
 * Nội dung thông báo/audit KHÔNG chứa dữ liệu khách hàng nhạy cảm, token, mật khẩu.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  Q.Audit = {
    has: function (key) { return Q.Store.findBy('AuditLogs', 'request_or_event_key', key).length > 0; },
    /** Ghi thêm một dòng; trả null nếu key đã tồn tại (idempotent). */
    log: function (ctx, action, entityType, entityId, key) {
      if (Q.Audit.has(key)) return null;
      return Q.Store.insert('AuditLogs', {
        audit_id: Q.Store.nextId('AuditLogs'),
        actor_user_id: ctx.user.user_id,
        actor_email_snapshot: ctx.user.email,
        action: action, entity_type: entityType, entity_id: entityId,
        request_or_event_key: key, created_at: U.isoNow()
      });
    }
  };

  Q.Notify = {
    /** Khóa khử trùng lặp: evt-<loại>-<bản ghi nguồn>-<người nhận>. */
    send: function (recipientId, eventType, sourceId, message) {
      var key = 'evt-' + eventType + '-' + sourceId + '-' + recipientId;
      if (Q.Store.findBy('Notifications', 'request_or_event_key', key).length) return null;
      return Q.Store.insert('Notifications', {
        notification_id: Q.Store.nextId('Notifications'),
        recipient_user_id: recipientId, event_type: eventType, source_record_id: sourceId,
        request_or_event_key: key, message: String(message).slice(0, 300), created_at: U.isoNow(), read_at: ''
      });
    }
  };

  function userRef(users, id) {
    var u = users[id];
    return u ? { userId: u.user_id, name: u.full_name } : { userId: id, name: id || '' };
  }
  function userMap() { var m = {}; Q.Store.all('Users').forEach(function (u) { m[u.user_id] = u; }); return m; }

  var DTO = Q.DTO = {};

  DTO.tasks = function (ctx, tasks) {
    var S = Q.Store, today = U.today(), users = userMap(), cust = {}, asg = {}, approved = {}, pending = {};
    S.all('Customers').forEach(function (c) { cust[c.customer_id] = c; });
    S.all('TaskAssignees').forEach(function (a) { if (a.active) (asg[a.task_id] = asg[a.task_id] || []).push(a); });
    S.all('TaskUpdates').forEach(function (u) {
      if (u.review_status === 'approved') approved[u.task_id] = Math.max(approved[u.task_id] || 0, u.progress_pct || 0);
      if (u.review_status === 'pending') pending[u.task_id] = (pending[u.task_id] || 0) + 1;
    });
    return tasks.map(function (t) {
      var list = asg[t.task_id] || [], p = null, c = null, k = cust[t.customer_id];
      list.forEach(function (a) { if (a.assignment_role === 'primary') p = a; else c = a; });
      return {
        taskId: t.task_id, taskCode: t.task_code, title: t.title, description: t.description,
        status: t.status, priority: t.priority, dueAt: t.due_at,
        overdue: t.status !== 'completed' && !t.archived_at && t.due_at < today,
        archived: !!t.archived_at,
        customer: k ? { customerId: k.customer_id, code: k.customer_code, name: k.name } : null,
        primary: p ? userRef(users, p.user_id) : null,
        collaborator: c ? userRef(users, c.user_id) : null,
        createdBy: userRef(users, t.created_by_user_id),
        createdAt: t.created_at, updatedAt: t.updated_at, completedAt: t.completed_at || null,
        approvedProgress: approved[t.task_id] || 0, pendingUpdates: pending[t.task_id] || 0
      };
    });
  };

  DTO.updates = function (updates) {
    var users = userMap();
    return updates.map(function (u) {
      return {
        updateId: u.update_id, taskId: u.task_id, progressPct: u.progress_pct, narrative: u.narrative,
        submittedBy: userRef(users, u.submitted_by_user_id), submittedAt: u.submitted_at,
        reviewStatus: u.review_status,
        reviewedBy: u.reviewed_by_user_id ? userRef(users, u.reviewed_by_user_id) : null,
        reviewedAt: u.reviewed_at || null, reviewComment: u.review_comment || ''
      };
    });
  };

  DTO.customer = function (c) {
    return {
      customerId: c.customer_id, customerCode: c.customer_code, name: c.name, type: c.type, phone: c.phone,
      status: c.status, companyRepresentative: c.company_representative || '',
      archived: !!c.archived_at, createdAt: c.created_at, updatedAt: c.updated_at
    };
  };

  DTO.user = function (u, roles) {
    var r = roles ? roles[u.role_id] : null;
    return {
      userId: u.user_id, email: u.email, employeeCode: u.employee_code, fullName: u.full_name,
      roleId: u.role_id, roleCode: r ? r.code : '', orgUnit: u.org_unit, status: u.status,
      createdAt: u.created_at, updatedAt: u.updated_at
    };
  };

  Q.Core = {
    /** Những người cần được thông báo khi có tiến độ chờ duyệt: KSV cùng đơn vị (nếu không có thì mọi KSV) + Admin. */
    reviewersFor: function (submitter) {
      var S = Q.Store, roleByCode = {};
      S.all('Roles').forEach(function (r) { roleByCode[r.code] = r.role_id; });
      var active = S.all('Users').filter(function (u) { return u.status === 'active' && u.user_id !== submitter.user_id; });
      var ksv = active.filter(function (u) { return u.role_id === roleByCode.KSV; });
      var sameUnit = ksv.filter(function (u) { return u.org_unit === submitter.org_unit; });
      var admins = active.filter(function (u) { return u.role_id === roleByCode.Admin; });
      return (sameUnit.length ? sameUnit : ksv).concat(admins);
    },
    activeAssignments: function (taskId) {
      return Q.Store.findBy('TaskAssignees', 'task_id', taskId).filter(function (a) { return a.active; });
    },
    /** Người dùng CBTD đang hoạt động hợp lệ để phân công. */
    assigneeOrFail: function (userId, field) {
      var u = Q.Store.find('Users', userId);
      var role = u && Q.Store.find('Roles', u.role_id);
      if (!u || u.status !== 'active' || !role || role.code !== 'CBTD') {
        U.invalid(field, 'Người được giao phải là cán bộ tín dụng (CBTD) đang hoạt động.');
      }
      return u;
    },
    addAssignment: function (ctx, task, user, role) {
      var a = Q.Store.insert('TaskAssignees', {
        assignment_id: Q.Store.nextId('TaskAssignees'), task_id: task.task_id, user_id: user.user_id,
        assignee_email_snapshot: user.email, assignment_role: role, assigned_at: U.isoNow(), active: true
      });
      Q.Audit.log(ctx, 'task.assign', 'TaskAssignee', a.assignment_id, 'evt-task.assign-' + a.assignment_id);
      if (user.user_id !== ctx.user.user_id) {
        Q.Notify.send(user.user_id, 'task_assigned', a.assignment_id, 'Bạn được giao công việc ' + task.task_code + ': ' + task.title);
      }
      return a;
    },
    deactivate: function (a) { return Q.Store.update('TaskAssignees', a.assignment_id, { active: false }); }
  };
})(QLCV);
