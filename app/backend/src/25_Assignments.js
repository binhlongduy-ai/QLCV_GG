/**
 * Ứng dụng: phân công công việc và xác định người nhận thông báo duyệt.
 * Quy tắc "một người phụ trách chính, tối đa một người phối hợp" được kiểm tra ở Domain.Assignment và tại use case;
 * module này chỉ thực hiện thao tác phân công (thêm/gỡ) kèm nhật ký và thông báo.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  Q.Assignments = {
    /**
     * Những người cần được thông báo khi có tiến độ chờ duyệt: KSV cùng đơn vị (nếu không có thì mọi KSV) + Admin.
     * Không gồm chính người gửi.
     */
    reviewersFor: function (submitter) {
      var roleByCode = {};
      Q.Repo.roles.all().forEach(function (r) { roleByCode[r.code] = r.role_id; });
      var active = Q.Repo.users.all().filter(function (u) { return u.status === 'active' && u.user_id !== submitter.user_id; });
      var ksv = active.filter(function (u) { return u.role_id === roleByCode.KSV; });
      var sameUnit = ksv.filter(function (u) { return u.org_unit === submitter.org_unit; });
      var admins = active.filter(function (u) { return u.role_id === roleByCode.Admin; });
      return (sameUnit.length ? sameUnit : ksv).concat(admins);
    },

    activeOf: function (taskId) { return Q.Repo.assignments.activeForTask(taskId); },

    /** Người dùng CBTD đang hoạt động hợp lệ để phân công; sai thì báo lỗi VALIDATION tại trường field. */
    assigneeOrFail: function (userId, field) {
      var u = Q.Repo.users.find(userId);
      var role = u && Q.Repo.roles.find(u.role_id);
      if (!u || u.status !== 'active' || !role || role.code !== 'CBTD') {
        U.invalid(field, 'Người được giao phải là cán bộ tín dụng (CBTD) đang hoạt động.');
      }
      return u;
    },

    /** Thêm phân công, ghi nhật ký và thông báo người được giao (trừ khi tự phân công cho mình). */
    addAssignment: function (ctx, task, user, role) {
      var a = Q.Repo.assignments.insert({
        assignment_id: Q.Repo.assignments.nextId(), task_id: task.task_id, user_id: user.user_id,
        assignee_email_snapshot: user.email, assignment_role: role, assigned_at: U.isoNow(), active: true
      });
      Q.Audit.log(ctx, 'task.assign', 'TaskAssignee', a.assignment_id, 'evt-task.assign-' + a.assignment_id);
      if (user.user_id !== ctx.user.user_id) {
        Q.Notify.send(user.user_id, 'task_assigned', a.assignment_id, 'Bạn được giao công việc ' + task.task_code + ': ' + task.title);
      }
      return a;
    },

    /** Gỡ phân công: đặt active = false, không xóa dòng (giữ lịch sử). */
    deactivate: function (a) { return Q.Repo.assignments.update(a.assignment_id, { active: false }); }
  };
})(QLCV);
