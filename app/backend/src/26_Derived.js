/**
 * Ứng dụng: duy trì số liệu dẫn xuất (tối ưu đọc, P1/P2 trong docs/REVIEW_TEAM.md).
 *  - Tasks.approved_progress = tiến độ lớn nhất trong các báo cáo đã duyệt của công việc.
 *  - Tasks.pending_updates   = số báo cáo đang chờ duyệt của công việc.
 *  - Users.unread_notifications = số thông báo chưa đọc của người dùng.
 * Nguồn sự thật vẫn là TaskUpdates và Notifications; các cột này chỉ là bản tóm tắt để màn hình danh sách,
 * dashboard và auth.me không phải đọc trọn hai bảng lớn đó. Cập nhật tăng dần tại đúng chỗ đổi trạng thái;
 * expected()/recomputeAll() tính lại từ nguồn để kiểm tra toàn vẹn và sửa lệch.
 * Không đổi updated_at (số liệu dẫn xuất không phải thay đổi nghiệp vụ).
 */
(function (Q) {
  'use strict';

  var Derived = Q.Derived = {};

  /** Một báo cáo tiến độ mới được gửi (luôn ở trạng thái pending). */
  Derived.onSubmitted = function (taskId) {
    var t = Q.Repo.tasks.find(taskId);
    if (t) Q.Repo.tasks.update(taskId, { pending_updates: (t.pending_updates || 0) + 1 });
  };

  /** Một báo cáo chuyển từ pending sang approved/rejected (chỉ gọi ở lần chuyển đầu tiên, không gọi khi thử lại). */
  Derived.onReviewed = function (taskId, status, pct) {
    var t = Q.Repo.tasks.find(taskId);
    if (!t) return;
    var patch = { pending_updates: Math.max(0, (t.pending_updates || 0) - 1) };
    if (status === 'approved') patch.approved_progress = Math.max(t.approved_progress || 0, pct || 0);
    Q.Repo.tasks.update(taskId, patch);
  };

  /** Một thông báo chưa đọc được tạo cho người nhận. */
  Derived.onNotificationCreated = function (userId) {
    var u = Q.Repo.users.find(userId);
    if (!u) return;
    Q.UserCache.put(Q.Repo.users.update(userId, { unread_notifications: (u.unread_notifications || 0) + 1 }));
  };

  /** n thông báo vừa được đánh dấu đã đọc. Trả về số chưa đọc còn lại. */
  Derived.onNotificationsRead = function (userId, n) {
    var u = Q.Repo.users.find(userId);
    if (!u) return 0;
    var left = Math.max(0, (u.unread_notifications || 0) - n);
    if (n > 0) Q.UserCache.put(Q.Repo.users.update(userId, { unread_notifications: left }));
    return left;
  };

  /** Giá trị đúng tính lại từ bảng nguồn: { tasks: {task_id: {approved, pending}}, users: {user_id: unread} }. */
  Derived.expected = function () {
    var tasks = {}, users = {};
    Q.Repo.updates.all().forEach(function (u) {
      var c = tasks[u.task_id] = tasks[u.task_id] || { approved: 0, pending: 0 };
      if (u.review_status === 'approved') c.approved = Math.max(c.approved, u.progress_pct || 0);
      if (u.review_status === 'pending') c.pending++;
    });
    Q.Repo.notifications.all().forEach(function (n) {
      if (!n.read_at) users[n.recipient_user_id] = (users[n.recipient_user_id] || 0) + 1;
    });
    return { tasks: tasks, users: users };
  };

  /** Ghi lại các giá trị lệch so với nguồn. Trả về số dòng đã sửa. */
  Derived.recomputeAll = function () {
    var exp = Derived.expected(), fixed = { tasks: 0, users: 0 };
    Q.Repo.tasks.all().forEach(function (t) {
      var c = exp.tasks[t.task_id] || { approved: 0, pending: 0 };
      if (t.approved_progress !== c.approved || t.pending_updates !== c.pending) {
        Q.Repo.tasks.update(t.task_id, { approved_progress: c.approved, pending_updates: c.pending });
        fixed.tasks++;
      }
    });
    Q.Repo.users.all().forEach(function (u) {
      var want = exp.users[u.user_id] || 0;
      if (u.unread_notifications !== want) {
        Q.UserCache.put(Q.Repo.users.update(u.user_id, { unread_notifications: want }));
        fixed.users++;
      }
    });
    return fixed;
  };
})(QLCV);
