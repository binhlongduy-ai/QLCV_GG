/**
 * Tầng trình bày (adapter ra ngoài): chuyển bản ghi lưu trữ thành DTO trả về cho giao diện.
 * Mọi tên trường DTO (camelCase) và cấu trúc JSON giữ nguyên hợp đồng API (xem docs/API.md).
 * Không ghi dữ liệu. Chỉ tra đúng các dòng liên quan qua chỉ mục, không quét cả bảng cho mỗi bản ghi.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  /** Tham chiếu người dùng cho giao diện; người không còn trong bảng vẫn hiện được theo mã. */
  function userRef(id) {
    var u = Q.Repo.users.find(id);
    return u ? { userId: u.user_id, name: u.full_name } : { userId: id, name: id || '' };
  }

  var Presenters = Q.Presenters = {};

  Presenters.userRef = userRef;

  Presenters.tasks = function (ctx, tasks) {
    var today = U.today();
    return tasks.map(function (t) {
      var p = null, c = null, k = Q.Repo.customers.find(t.customer_id), approved = 0, pending = 0;
      Q.Repo.assignments.forTask(t.task_id).forEach(function (a) {
        if (!a.active) return;
        if (a.assignment_role === 'primary') p = a; else c = a;
      });
      Q.Repo.updates.forTask(t.task_id).forEach(function (u) {
        if (u.review_status === 'approved') approved = Math.max(approved, u.progress_pct || 0);
        if (u.review_status === 'pending') pending++;
      });
      return {
        taskId: t.task_id, taskCode: t.task_code, title: t.title, description: t.description,
        status: t.status, priority: t.priority, dueAt: t.due_at,
        overdue: Q.Domain.Task.isOpen(t) && Q.Domain.Task.isLate(t, today),
        archived: !!t.archived_at,
        customer: k ? { customerId: k.customer_id, code: k.customer_code, name: k.name } : null,
        primary: p ? userRef(p.user_id) : null,
        collaborator: c ? userRef(c.user_id) : null,
        createdBy: userRef(t.created_by_user_id),
        createdAt: t.created_at, updatedAt: t.updated_at, completedAt: t.completed_at || null,
        approvedProgress: approved, pendingUpdates: pending
      };
    });
  };

  Presenters.updates = function (updates) {
    return updates.map(function (u) {
      return {
        updateId: u.update_id, taskId: u.task_id, progressPct: u.progress_pct, narrative: u.narrative,
        submittedBy: userRef(u.submitted_by_user_id), submittedAt: u.submitted_at,
        reviewStatus: u.review_status,
        reviewedBy: u.reviewed_by_user_id ? userRef(u.reviewed_by_user_id) : null,
        reviewedAt: u.reviewed_at || null, reviewComment: u.review_comment || ''
      };
    });
  };

  Presenters.customer = function (c) {
    return {
      customerId: c.customer_id, customerCode: c.customer_code, name: c.name, type: c.type, phone: c.phone,
      status: c.status, companyRepresentative: c.company_representative || '',
      archived: !!c.archived_at, createdAt: c.created_at, updatedAt: c.updated_at
    };
  };

  Presenters.user = function (u, roles) {
    var r = roles ? roles[u.role_id] : null;
    return {
      userId: u.user_id, email: u.email, employeeCode: u.employee_code, fullName: u.full_name,
      roleId: u.role_id, roleCode: r ? r.code : '', orgUnit: u.org_unit, status: u.status,
      createdAt: u.created_at, updatedAt: u.updated_at
    };
  };
})(QLCV);
