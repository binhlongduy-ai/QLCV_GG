/** Công việc & phân công (R5, R6, R17). Mọi thao tác ghi đều idempotent theo requestId. */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, S = function () { return Q.Store; };
  var L = Q.Config.LIMITS, E = Q.Enums;

  function openOrFail(task) {
    if (task.status === 'completed') U.fail('CONFLICT', 'Công việc đã hoàn thành, không thể thay đổi.');
    if (task.archived_at) U.fail('CONFLICT', 'Công việc đã được lưu trữ.');
  }

  function dtoOf(ctx, taskId) { return Q.DTO.tasks(ctx, [S().find('Tasks', taskId)])[0]; }

  var T = Q.TaskService = {};

  T.list = function (ctx, p) {
    P.require(ctx, 'task.view');
    p = p || {};
    var today = U.today(), tasks = P.visibleTasks(ctx);
    if (!U.bool(p.includeArchived)) tasks = tasks.filter(function (t) { return !t.archived_at; });
    if (p.status) tasks = tasks.filter(function (t) { return t.status === p.status; });
    if (p.priority) tasks = tasks.filter(function (t) { return t.priority === p.priority; });
    if (p.customerId) tasks = tasks.filter(function (t) { return t.customer_id === p.customerId; });
    if (U.bool(p.overdue)) tasks = tasks.filter(function (t) { return Q.Rules.isLate(t, today); });
    if (U.bool(p.mine)) { var mine = P.assignedTaskIds(ctx.user.user_id); tasks = tasks.filter(function (t) { return mine[t.task_id]; }); }
    if (p.assigneeUserId) { var theirs = P.assignedTaskIds(p.assigneeUserId); tasks = tasks.filter(function (t) { return theirs[t.task_id]; }); }

    var dtos = Q.DTO.tasks(ctx, tasks);
    if (p.q) {
      var q = U.norm(String(p.q).slice(0, 100));
      dtos = dtos.filter(function (d) { return U.norm(d.title + ' ' + d.taskCode + ' ' + (d.customer ? d.customer.name : '')).indexOf(q) >= 0; });
    }
    var rank = { high: 0, normal: 1, low: 2 }, dir = p.dir === 'desc' ? 'desc' : 'asc';
    var keyFns = {
      dueAt: function (d) { return d.dueAt + d.taskCode; },
      createdAt: function (d) { return d.createdAt + d.taskCode; },
      updatedAt: function (d) { return d.updatedAt + d.taskCode; },
      priority: function (d) { return rank[d.priority] + d.dueAt; }
    };
    var by = keyFns[p.sortBy] ? p.sortBy : 'dueAt';
    if (!p.sortBy) dir = 'asc';
    return U.paginate(U.sortBy(dtos, keyFns[by], dir), p);
  };

  T.get = function (ctx, p) {
    P.require(ctx, 'task.view');
    var t = P.taskOrFail(ctx, p && p.taskId);
    var updates = S().findBy('TaskUpdates', 'task_id', t.task_id);
    var history = S().findBy('TaskAssignees', 'task_id', t.task_id).map(function (a) {
      var u = S().find('Users', a.user_id);
      return { assignmentId: a.assignment_id, userId: a.user_id, name: u ? u.full_name : a.assignee_email_snapshot,
        role: a.assignment_role, assignedAt: a.assigned_at, active: a.active };
    });
    var me = ctx.user.user_id;
    var mineActive = history.some(function (h) { return h.userId === me && h.active; });
    var open = t.status !== 'completed' && !t.archived_at;
    return {
      task: Q.DTO.tasks(ctx, [t])[0],
      updates: Q.DTO.updates(U.sortBy(updates, function (u) { return u.submitted_at + u.update_id; }, 'desc')),
      assignments: history,
      can: {
        start: open && t.status === 'not_started' && P.has(ctx, 'task.start') && (!P.isScoped(ctx) || mineActive),
        submitProgress: open && P.has(ctx, 'progress.submit') && (!P.isScoped(ctx) || mineActive),
        edit: open && P.has(ctx, 'task.update'),
        transfer: open && P.has(ctx, 'task.transfer'),
        archive: !t.archived_at && P.has(ctx, 'task.update'),
        review: P.has(ctx, 'progress.review')
      }
    };
  };

  T.create = function (ctx, p, meta) {
    P.require(ctx, 'task.create');
    var key = 'evt-task.create-' + meta.requestId;
    var existing = Q.Audit.find(key);
    if (existing) return { task: dtoOf(ctx, existing.entity_id), replayed: true };

    var title = U.str(p.title, { field: 'title', label: 'Tiêu đề', required: true, max: L.title });
    var description = U.str(p.description, { field: 'description', label: 'Mô tả', max: L.description });
    var priority = U.oneOf(p.priority, E.priority, { field: 'priority', label: 'Mức ưu tiên', def: 'normal' });
    var dueAt = U.ymd(p.dueAt, { field: 'dueAt', label: 'Hạn xử lý', required: true });
    if (dueAt < U.today()) U.invalid('dueAt', 'Hạn xử lý không được nằm trong quá khứ.');

    var customer = S().find('Customers', p.customerId);
    if (!customer || customer.archived_at) U.invalid('customerId', 'Khách hàng không tồn tại hoặc đã lưu trữ.');
    if (P.isScoped(ctx) && !p.primaryUserId) p.primaryUserId = ctx.user.user_id;
    if (!p.primaryUserId) U.invalid('primaryUserId', 'Cần chọn cán bộ phụ trách chính.');
    // R6: CBTD chỉ được tạo công việc khi chính mình là người phụ trách chính.
    if (P.isScoped(ctx) && p.primaryUserId !== ctx.user.user_id) {
      U.fail('FORBIDDEN', 'CBTD chỉ được tạo công việc do chính mình phụ trách chính.');
    }
    var primary = Q.Core.assigneeOrFail(p.primaryUserId, 'primaryUserId');
    var collab = null;
    if (p.collaboratorUserId) {
      if (p.collaboratorUserId === p.primaryUserId) U.invalid('collaboratorUserId', 'Người phối hợp phải khác người phụ trách chính.');
      collab = Q.Core.assigneeOrFail(p.collaboratorUserId, 'collaboratorUserId');
    }

    var id = S().nextId('Tasks'), now = U.isoNow();
    var task = S().insert('Tasks', {
      task_id: id, task_code: 'CV-' + U.pad(parseInt(id.split('-')[1], 10), 4), customer_id: customer.customer_id,
      title: title, description: description, status: 'not_started', priority: priority, due_at: dueAt,
      created_by_user_id: ctx.user.user_id, completed_at: '', created_at: now, updated_at: now, archived_at: ''
    });
    Q.Audit.log(ctx, 'task.create', 'Task', task.task_id, key);
    Q.Core.addAssignment(ctx, task, primary, 'primary');
    if (collab) Q.Core.addAssignment(ctx, task, collab, 'collaborator');
    return { task: dtoOf(ctx, task.task_id), replayed: false };
  };

  T.update = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    var patch = {}, changed = [];
    if (p.title !== undefined) { patch.title = U.str(p.title, { field: 'title', label: 'Tiêu đề', required: true, max: L.title }); changed.push('title'); }
    if (p.description !== undefined) { patch.description = U.str(p.description, { field: 'description', label: 'Mô tả', max: L.description }); changed.push('description'); }
    if (p.priority !== undefined) { patch.priority = U.oneOf(p.priority, E.priority, { field: 'priority', label: 'Mức ưu tiên', required: true }); changed.push('priority'); }
    if (p.dueAt !== undefined) { patch.due_at = U.ymd(p.dueAt, { field: 'dueAt', label: 'Hạn xử lý', required: true }); changed.push('dueAt'); }
    if (p.status !== undefined) {
      if (p.status === 'completed') U.invalid('status', 'Trạng thái "Đã hoàn thành" chỉ được đặt khi duyệt tiến độ 100%.');
      patch.status = U.oneOf(p.status, E.manualTaskStatus, { field: 'status', label: 'Trạng thái', required: true });
      changed.push('status');
    }
    if (!changed.length) U.invalid(null, 'Không có thay đổi nào để lưu.');
    patch.updated_at = U.isoNow();
    S().update('Tasks', task.task_id, patch);
    Q.Audit.log(ctx, 'task.update', 'Task', task.task_id, 'evt-task.update-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  T.start = function (ctx, p, meta) {
    P.require(ctx, 'task.start');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    if (P.isScoped(ctx) && !P.isAssignee(ctx, task.task_id)) U.fail('FORBIDDEN', 'Bạn không được giao công việc này.');
    if (task.status !== 'not_started') U.fail('CONFLICT', 'Công việc đã được bắt đầu.');
    S().update('Tasks', task.task_id, { status: 'in_progress', updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.start', 'Task', task.task_id, 'evt-task.start-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  /** R17: chuyển giao người thực hiện chính. */
  T.transfer = function (ctx, p, meta) {
    P.require(ctx, 'task.transfer');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    var next = Q.Core.assigneeOrFail(p.newPrimaryUserId, 'newPrimaryUserId');
    var active = Q.Core.activeAssignments(task.task_id);
    var cur = active.filter(function (a) { return a.assignment_role === 'primary'; })[0];
    if (cur && cur.user_id === next.user_id) U.invalid('newPrimaryUserId', 'Người này đang là người phụ trách chính.');
    var key = 'evt-task.transfer-' + meta.requestId;
    if (Q.Audit.has(key)) return { task: dtoOf(ctx, task.task_id), replayed: true };

    active.forEach(function (a) {
      // Người nhận việc đang là người phối hợp thì thôi phối hợp để không trùng vai.
      if (a.assignment_role === 'primary' || a.user_id === next.user_id) Q.Core.deactivate(a);
    });
    Q.Core.addAssignment(ctx, task, next, 'primary');
    S().update('Tasks', task.task_id, { updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.transfer', 'Task', task.task_id, key);
    return { task: dtoOf(ctx, task.task_id), replayed: false };
  };

  T.setCollaborator = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    var active = Q.Core.activeAssignments(task.task_id);
    var primary = active.filter(function (a) { return a.assignment_role === 'primary'; })[0];
    var oldC = active.filter(function (a) { return a.assignment_role === 'collaborator'; })[0];
    var next = null;
    if (p.userId) {
      next = Q.Core.assigneeOrFail(p.userId, 'userId');
      if (primary && primary.user_id === next.user_id) U.invalid('userId', 'Người phối hợp phải khác người phụ trách chính.');
      if (oldC && oldC.user_id === next.user_id) return { task: dtoOf(ctx, task.task_id) };
    }
    if (oldC) Q.Core.deactivate(oldC);
    if (next) Q.Core.addAssignment(ctx, task, next, 'collaborator');
    S().update('Tasks', task.task_id, { updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.update', 'Task', task.task_id, 'evt-task.collab-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  /** Lưu trữ / khôi phục (không xóa cứng vì lịch sử còn tham chiếu). */
  T.archive = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    var archive = p.archived === undefined ? true : U.bool(p.archived);
    if (archive === !!task.archived_at) return { task: dtoOf(ctx, task.task_id) };
    S().update('Tasks', task.task_id, { archived_at: archive ? U.isoNow() : '', updated_at: U.isoNow() });
    Q.Audit.log(ctx, archive ? 'task.archive' : 'task.restore', 'Task', task.task_id, 'evt-task.archive-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };
})(QLCV);
