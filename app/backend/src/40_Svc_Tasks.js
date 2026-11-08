/**
 * Use case: công việc và phân công (R5, R6, R17). Ghi dữ liệu đều idempotent theo requestId.
 * Quy tắc thuần nằm ở Q.Domain; truy cập dữ liệu qua Q.Repo; DTO qua Q.Presenters.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, E = Q.Enums, L = Q.Config.LIMITS, D = Q.Domain;

  function dtoOf(ctx, taskId) { return Q.Presenters.tasks(ctx, [Q.Repo.tasks.find(taskId)])[0]; }

  var T = Q.TaskService = {};

  /** Danh sách có lọc, tìm kiếm không dấu, sắp xếp và phân trang. Chỉ dựng DTO cho trang đang xem. */
  T.list = function (ctx, p) {
    P.require(ctx, 'task.view');
    p = p || {};
    var today = U.today(), tasks = P.visibleTasks(ctx);
    if (!U.bool(p.includeArchived)) tasks = tasks.filter(function (t) { return !t.archived_at; });
    if (p.status) tasks = tasks.filter(function (t) { return t.status === p.status; });
    if (p.priority) tasks = tasks.filter(function (t) { return t.priority === p.priority; });
    if (p.customerId) tasks = tasks.filter(function (t) { return t.customer_id === p.customerId; });
    if (U.bool(p.overdue)) tasks = tasks.filter(function (t) { return D.Task.isLate(t, today); });
    if (U.bool(p.mine)) { var mine = P.assignedTaskIds(ctx.user.user_id); tasks = tasks.filter(function (t) { return mine[t.task_id]; }); }
    if (p.assigneeUserId) { var theirs = P.assignedTaskIds(p.assigneeUserId); tasks = tasks.filter(function (t) { return theirs[t.task_id]; }); }

    if (p.q) {
      var q = U.norm(String(p.q).slice(0, 100));
      tasks = tasks.filter(function (t) {
        var c = Q.Repo.customers.find(t.customer_id);
        return U.norm(t.title + ' ' + t.task_code + ' ' + (c ? c.name : '')).indexOf(q) >= 0;
      });
    }
    var rank = { high: 0, normal: 1, low: 2 }, dir = p.dir === 'desc' ? 'desc' : 'asc';
    var keyFns = {
      dueAt: function (t) { return t.due_at + t.task_code; },
      createdAt: function (t) { return t.created_at + t.task_code; },
      updatedAt: function (t) { return t.updated_at + t.task_code; },
      priority: function (t) { return rank[t.priority] + t.due_at; }
    };
    var by = keyFns[p.sortBy] ? p.sortBy : 'dueAt';
    if (!p.sortBy) dir = 'asc';
    var m = dir === 'desc' ? -1 : 1;
    var keyed = tasks.map(function (t) { return { t: t, k: keyFns[by](t) }; });   // khóa tính một lần/dòng
    keyed.sort(function (x, y) { return x.k < y.k ? -m : x.k > y.k ? m : 0; });
    var page = U.paginate(keyed.map(function (e) { return e.t; }), p);
    page.items = Q.Presenters.tasks(ctx, page.items);
    return page;
  };

  /** Chi tiết công việc kèm lịch sử tiến độ, danh sách phân công và cờ "can" cho giao diện. */
  T.get = function (ctx, p) {
    P.require(ctx, 'task.view');
    var t = P.taskOrFail(ctx, p && p.taskId);
    var updates = Q.Repo.updates.forTask(t.task_id);
    var history = Q.Repo.assignments.forTask(t.task_id).map(function (a) {
      var u = Q.Repo.users.find(a.user_id);
      return { assignmentId: a.assignment_id, userId: a.user_id, name: u ? u.full_name : a.assignee_email_snapshot,
        role: a.assignment_role, assignedAt: a.assigned_at, active: a.active };
    });
    var me = ctx.user.user_id;
    var mineActive = history.some(function (h) { return h.userId === me && h.active; });
    var open = D.Task.isOpen(t);
    return {
      task: Q.Presenters.tasks(ctx, [t])[0],
      updates: Q.Presenters.updates(U.sortBy(updates, function (u) { return u.submitted_at + u.update_id; }, 'desc')),
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

  /** Tạo công việc (R6: CBTD chỉ tạo khi là người phụ trách chính). Thử lại cùng requestId trả về việc đã tạo. */
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

    var customer = Q.Repo.customers.find(p.customerId);
    if (!customer || customer.archived_at) U.invalid('customerId', 'Khách hàng không tồn tại hoặc đã lưu trữ.');
    if (P.isScoped(ctx) && !p.primaryUserId) p.primaryUserId = ctx.user.user_id;
    if (!p.primaryUserId) U.invalid('primaryUserId', 'Cần chọn cán bộ phụ trách chính.');
    D.Task.assertCbtdCreatesForSelf(P.isScoped(ctx), p.primaryUserId, ctx.user.user_id);
    var primary = Q.Assignments.assigneeOrFail(p.primaryUserId, 'primaryUserId');
    var collab = null;
    if (p.collaboratorUserId) {
      if (p.collaboratorUserId === p.primaryUserId) U.invalid('collaboratorUserId', 'Người phối hợp phải khác người phụ trách chính.');
      collab = Q.Assignments.assigneeOrFail(p.collaboratorUserId, 'collaboratorUserId');
    }

    var id = Q.Repo.tasks.nextId(), now = U.isoNow();
    var task = Q.Repo.tasks.insert({
      task_id: id, task_code: D.Codes.taskCodeFor(id), customer_id: customer.customer_id,
      title: title, description: description, status: 'not_started', priority: priority, due_at: dueAt,
      created_by_user_id: ctx.user.user_id, completed_at: '', created_at: now, updated_at: now, archived_at: '',
      approved_progress: 0, pending_updates: 0
    });
    Q.Audit.log(ctx, 'task.create', 'Task', task.task_id, key);
    Q.Assignments.addAssignment(ctx, task, primary, 'primary');
    if (collab) Q.Assignments.addAssignment(ctx, task, collab, 'collaborator');
    return { task: dtoOf(ctx, task.task_id), replayed: false };
  };

  /** Sửa thông tin công việc; "hoàn thành" không đặt được bằng tay (R8). */
  T.update = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    D.Task.assertEditable(task);
    var patch = {}, changed = [];
    if (p.title !== undefined) { patch.title = U.str(p.title, { field: 'title', label: 'Tiêu đề', required: true, max: L.title }); changed.push('title'); }
    if (p.description !== undefined) { patch.description = U.str(p.description, { field: 'description', label: 'Mô tả', max: L.description }); changed.push('description'); }
    if (p.priority !== undefined) { patch.priority = U.oneOf(p.priority, E.priority, { field: 'priority', label: 'Mức ưu tiên', required: true }); changed.push('priority'); }
    if (p.dueAt !== undefined) { patch.due_at = U.ymd(p.dueAt, { field: 'dueAt', label: 'Hạn xử lý', required: true }); changed.push('dueAt'); }
    if (p.status !== undefined) {
      D.Task.assertNotCompletedByHand(p.status);
      patch.status = U.oneOf(p.status, E.manualTaskStatus, { field: 'status', label: 'Trạng thái', required: true });
      changed.push('status');
    }
    if (!changed.length) U.invalid(null, 'Không có thay đổi nào để lưu.');
    patch.updated_at = U.isoNow();
    Q.Repo.tasks.update(task.task_id, patch);
    Q.Audit.log(ctx, 'task.update', 'Task', task.task_id, 'evt-task.update-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  /** CBTD được giao bắt đầu công việc: not_started -> in_progress. */
  T.start = function (ctx, p, meta) {
    P.require(ctx, 'task.start');
    var task = P.taskOrFail(ctx, p.taskId);
    D.Task.assertEditable(task);
    if (P.isScoped(ctx) && !P.isAssignee(ctx, task.task_id)) U.fail('FORBIDDEN', 'Bạn không được giao công việc này.');
    if (task.status !== 'not_started') U.fail('CONFLICT', 'Công việc đã được bắt đầu.');
    Q.Repo.tasks.update(task.task_id, { status: 'in_progress', updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.start', 'Task', task.task_id, 'evt-task.start-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  /** R17: chuyển giao người thực hiện chính. */
  T.transfer = function (ctx, p, meta) {
    P.require(ctx, 'task.transfer');
    var task = P.taskOrFail(ctx, p.taskId);
    D.Task.assertEditable(task);
    var next = Q.Assignments.assigneeOrFail(p.newPrimaryUserId, 'newPrimaryUserId');
    var active = Q.Assignments.activeOf(task.task_id);
    var cur = D.Assignment.primaryOf(active);
    if (cur && cur.user_id === next.user_id) U.invalid('newPrimaryUserId', 'Người này đang là người phụ trách chính.');
    var key = 'evt-task.transfer-' + meta.requestId;
    if (Q.Audit.has(key)) return { task: dtoOf(ctx, task.task_id), replayed: true };

    active.forEach(function (a) {
      // Người nhận việc đang là người phối hợp thì thôi phối hợp để không trùng vai.
      if (a.assignment_role === 'primary' || a.user_id === next.user_id) Q.Assignments.deactivate(a);
    });
    Q.Assignments.addAssignment(ctx, task, next, 'primary');
    Q.Repo.tasks.update(task.task_id, { updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.transfer', 'Task', task.task_id, key);
    return { task: dtoOf(ctx, task.task_id), replayed: false };
  };

  /** Đặt hoặc gỡ người phối hợp (một người tối đa). */
  T.setCollaborator = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    D.Task.assertEditable(task);
    var active = Q.Assignments.activeOf(task.task_id);
    var primary = D.Assignment.primaryOf(active);
    var oldC = D.Assignment.collaboratorOf(active);
    var next = null;
    if (p.userId) {
      next = Q.Assignments.assigneeOrFail(p.userId, 'userId');
      D.Assignment.assertCollaboratorDiffers(primary, next.user_id);
      if (oldC && oldC.user_id === next.user_id) return { task: dtoOf(ctx, task.task_id) };
    }
    if (oldC) Q.Assignments.deactivate(oldC);
    if (next) Q.Assignments.addAssignment(ctx, task, next, 'collaborator');
    Q.Repo.tasks.update(task.task_id, { updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.update', 'Task', task.task_id, 'evt-task.collab-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  /** Lưu trữ / khôi phục (không xóa cứng vì lịch sử còn tham chiếu). */
  T.archive = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    var archive = p.archived === undefined ? true : U.bool(p.archived);
    if (archive === !!task.archived_at) return { task: dtoOf(ctx, task.task_id) };
    Q.Repo.tasks.update(task.task_id, { archived_at: archive ? U.isoNow() : '', updated_at: U.isoNow() });
    Q.Audit.log(ctx, archive ? 'task.archive' : 'task.restore', 'Task', task.task_id, 'evt-task.archive-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };
})(QLCV);
