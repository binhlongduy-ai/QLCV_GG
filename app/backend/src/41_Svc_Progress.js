/**
 * Use case: tiến độ và phê duyệt (R7, R8, R10).
 * - TaskUpdates chỉ ghi thêm; duyệt chỉ đổi các cột duyệt (Repo/Store chặn sửa cột bất biến).
 * - Duyệt 100% tự động hoàn thành công việc (R8); hoàn thành là trạng thái cuối.
 * - Người duyệt không được trùng người gửi (R10).
 * - Hệ quả của một lần duyệt được làm lại an toàn khi thử lại hoặc sự cố giữa chừng (ensureReviewEffects idempotent).
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, L = Q.Config.LIMITS, D = Q.Domain;

  var G = Q.ProgressService = {};

  G.submit = function (ctx, p, meta) {
    P.require(ctx, 'progress.submit');
    var key = 'evt-progress.submit-' + meta.requestId;
    var dup = Q.Audit.find(key);
    if (dup) return { update: Q.Presenters.updates([Q.Repo.updates.find(dup.entity_id)])[0], replayed: true };

    var task = P.taskOrFail(ctx, p.taskId);
    if (task.archived_at) U.fail('CONFLICT', 'Công việc đã được lưu trữ.');
    if (task.status === 'completed') U.fail('CONFLICT', 'Công việc đã hoàn thành, không nhận thêm tiến độ.');
    if (P.isScoped(ctx) && !P.isAssignee(ctx, task.task_id)) U.fail('FORBIDDEN', 'Bạn không được giao công việc này.');

    var pct = U.pct(p.progressPct, { field: 'progressPct' });
    var narrative = U.str(p.narrative, { field: 'narrative', label: 'Nội dung diễn giải', required: true, min: 5, max: L.narrative });

    var u = Q.Repo.updates.insert({
      update_id: Q.Repo.updates.nextId(), task_id: task.task_id, progress_pct: pct, narrative: narrative,
      submitted_by_user_id: ctx.user.user_id, submitted_by_email_snapshot: ctx.user.email, submitted_at: U.isoNow(),
      review_status: 'pending', reviewed_by_user_id: '', reviewed_by_email_snapshot: '', reviewed_at: '', review_comment: ''
    });
    Q.Audit.log(ctx, 'progress.submit', 'TaskUpdate', u.update_id, key);
    Q.Assignments.reviewersFor(ctx.user).forEach(function (r) {
      Q.Notify.send(r.user_id, 'progress_submitted', u.update_id,
        'Có cập nhật tiến độ mới cần duyệt cho ' + task.task_code + ' (' + pct + '%)');
    });
    return { update: Q.Presenters.updates([u])[0], replayed: false };
  };

  /** Làm (hoặc làm lại) mọi hệ quả của một lần duyệt; mỗi bước đều idempotent theo khóa sự kiện. */
  function ensureReviewEffects(ctx, upd) {
    var task = Q.Repo.tasks.find(upd.task_id);
    var approved = upd.review_status === 'approved';
    Q.Audit.log(ctx, approved ? 'progress.approve' : 'progress.reject', 'TaskUpdate', upd.update_id, 'evt-review-' + upd.update_id);
    Q.Notify.send(upd.submitted_by_user_id, approved ? 'progress_approved' : 'progress_rejected', upd.update_id,
      approved ? 'Cập nhật tiến độ của bạn cho ' + task.task_code + ' đã được duyệt.'
        : 'Cập nhật tiến độ cho ' + task.task_code + ' bị từ chối. Vui lòng kiểm tra lý do trong ứng dụng và gửi lại.');

    if (D.Progress.completesTask(upd, task)) {
      var now = U.isoNow();
      Q.Repo.tasks.update(task.task_id, { status: 'completed', completed_at: now, updated_at: now });
      Q.Audit.log(ctx, 'task.auto_complete', 'Task', task.task_id, 'evt-autocomplete-' + task.task_id);
      var ids = {};
      Q.Assignments.activeOf(task.task_id).forEach(function (a) { ids[a.user_id] = true; });
      ids[upd.submitted_by_user_id] = true;
      delete ids[ctx.user.user_id];
      Object.keys(ids).forEach(function (uid) {
        Q.Notify.send(uid, 'task_completed', task.task_id, 'Công việc ' + task.task_code + ' đã hoàn thành 100%.');
      });
    }
  }
  G._ensureReviewEffects = ensureReviewEffects;

  /** Duyệt hoặc từ chối. Gửi lại cùng quyết định bởi cùng người duyệt được coi là thử lại an toàn. */
  G.review = function (ctx, p) {
    P.require(ctx, 'progress.review');
    var decision = U.oneOf(p.decision, ['approve', 'reject'], { field: 'decision', label: 'Quyết định', required: true });
    var comment = U.str(p.comment, { field: 'comment', label: 'Lý do', max: L.comment, required: decision === 'reject', min: decision === 'reject' ? 3 : 0 });
    var upd = Q.Repo.updates.find(p.updateId);
    if (!upd) U.fail('NOT_FOUND', 'Không tìm thấy báo cáo tiến độ.');
    D.Progress.assertNotSelfReview(upd, ctx.user.user_id);
    var want = D.Progress.statusOf(decision);

    if (upd.review_status !== 'pending') {
      if (upd.review_status === want && upd.reviewed_by_user_id === ctx.user.user_id) {
        ensureReviewEffects(ctx, upd);
        return { update: Q.Presenters.updates([Q.Repo.updates.find(upd.update_id)])[0], task: Q.Presenters.tasks(ctx, [Q.Repo.tasks.find(upd.task_id)])[0], replayed: true };
      }
      U.fail('CONFLICT', 'Báo cáo này đã được xử lý trước đó.');
    }
    var done = Q.Repo.updates.update(upd.update_id, {
      review_status: want, reviewed_by_user_id: ctx.user.user_id, reviewed_by_email_snapshot: ctx.user.email,
      reviewed_at: U.isoNow(), review_comment: comment
    });
    ensureReviewEffects(ctx, done);
    return { update: Q.Presenters.updates([Q.Repo.updates.find(upd.update_id)])[0], task: Q.Presenters.tasks(ctx, [Q.Repo.tasks.find(upd.task_id)])[0], replayed: false };
  };

  /** Hàng đợi duyệt: báo cáo đang chờ, cũ nhất trước. */
  G.pending = function (ctx, p) {
    P.require(ctx, 'progress.review');
    var list = Q.Repo.updates.pending();
    var tasks = {};
    Q.Repo.tasks.all().forEach(function (t) { tasks[t.task_id] = t; });
    var items = Q.Presenters.updates(U.sortBy(list, function (u) { return u.submitted_at + u.update_id; }, 'asc')).map(function (d) {
      var t = tasks[d.taskId];
      d.task = t ? { taskId: t.task_id, taskCode: t.task_code, title: t.title, dueAt: t.due_at } : null;
      d.ownSubmission = d.submittedBy.userId === ctx.user.user_id;
      return d;
    });
    return U.paginate(items, p);
  };
})(QLCV);
