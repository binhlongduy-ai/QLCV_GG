/**
 * Miền nghiệp vụ (domain). Chỉ chứa quy tắc thuần: nhận dữ liệu đã đọc, trả về quyết định hoặc ném lỗi nghiệp vụ.
 * KHÔNG đọc/ghi dữ liệu, KHÔNG gọi môi trường (Env, Store). Mọi tầng khác phụ thuộc vào đây, không ngược lại.
 * Thông báo lỗi giữ nguyên từ phiên bản trước để giao diện và kiểm thử không đổi.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  var Domain = Q.Domain = {};

  /* ---------- Công việc ---------- */
  Domain.Task = {
    /** Đang mở: chưa hoàn thành và chưa lưu trữ. */
    isOpen: function (t) { return t.status !== 'completed' && !t.archived_at; },
    /** Trễ hạn: chưa hoàn thành và hạn trước ngày hôm nay (không xét lưu trữ; xem CODE_REVIEW). */
    isLate: function (t, today) { return t.status !== 'completed' && t.due_at < today; },
    /** Hoàn thành là trạng thái cuối và lưu trữ khóa mọi thay đổi. */
    assertEditable: function (t) {
      if (t.status === 'completed') U.fail('CONFLICT', 'Công việc đã hoàn thành, không thể thay đổi.');
      if (t.archived_at) U.fail('CONFLICT', 'Công việc đã được lưu trữ.');
    },
    /** R6: CBTD chỉ được tạo công việc mà chính mình là người phụ trách chính. */
    assertCbtdCreatesForSelf: function (scoped, primaryUserId, actorUserId) {
      if (scoped && primaryUserId !== actorUserId) {
        U.fail('FORBIDDEN', 'CBTD chỉ được tạo công việc do chính mình phụ trách chính.');
      }
    },
    /** Trạng thái "completed" chỉ đặt tự động khi duyệt 100% (R8), không đặt tay. */
    assertNotCompletedByHand: function (status) {
      if (status === 'completed') U.invalid('status', 'Trạng thái "Đã hoàn thành" chỉ được đặt khi duyệt tiến độ 100%.');
    }
  };

  /* ---------- Phân công ---------- */
  Domain.Assignment = {
    primaryOf: function (active) { return active.filter(function (a) { return a.assignment_role === 'primary'; })[0]; },
    collaboratorOf: function (active) { return active.filter(function (a) { return a.assignment_role === 'collaborator'; })[0]; },
    /** Người phối hợp không được trùng người phụ trách chính (đã kiểm tra khi tạo việc và khi đổi phối hợp). */
    assertCollaboratorDiffers: function (primary, userId) {
      if (primary && primary.user_id === userId) U.invalid('userId', 'Người phối hợp phải khác người phụ trách chính.');
    }
  };

  /* ---------- Tiến độ & duyệt (R7, R8, R10) ---------- */
  Domain.Progress = {
    /** Quyết định duyệt -> trạng thái báo cáo. */
    statusOf: function (decision) { return decision === 'approve' ? 'approved' : 'rejected'; },
    /** R8: duyệt 100% khi công việc chưa hoàn thành thì tự động hoàn thành. */
    completesTask: function (upd, task) {
      return upd.review_status === 'approved' && upd.progress_pct === 100 && task.status !== 'completed';
    },
    /** R10: người lập không được tự duyệt báo cáo của mình. */
    assertNotSelfReview: function (upd, userId) {
      if (upd.submitted_by_user_id === userId) {
        U.fail('FORBIDDEN', 'Không thể tự duyệt báo cáo do chính mình gửi.', { reason: 'SELF_REVIEW' });
      }
    }
  };

  /* ---------- Khách hàng (R17) ---------- */
  Domain.Customer = {
    /** Người đại diện công ty chỉ dành cho khách hàng doanh nghiệp. */
    assertRepresentativeAllowed: function (type, representative) {
      if (type === 'personal' && representative) {
        U.invalid('companyRepresentative', 'Chỉ khách hàng doanh nghiệp mới có người đại diện công ty.');
      }
    }
  };

  /* ---------- Người dùng & vai trò ---------- */
  Domain.User = {
    /**
     * Chống tự khóa: người đang đăng nhập không tự hạ quyền hoặc vô hiệu hóa Admin của chính mình,
     * và hệ thống luôn còn ít nhất một Admin đang hoạt động.
     * activeAdminCount là một hàm trả về số Admin hoạt động (chỉ gọi khi cần).
     */
    assertKeepsAnAdmin: function (actorId, target, adminRoleId, patch, activeAdminCount) {
      var losesAdmin = (patch.role_id && patch.role_id !== adminRoleId && target.role_id === adminRoleId) ||
        (patch.status === 'inactive' && target.role_id === adminRoleId);
      if (!losesAdmin) return;
      if (target.user_id === actorId) U.fail('CONFLICT', 'Không thể tự hạ quyền hoặc vô hiệu hóa tài khoản Admin của chính mình.');
      if (activeAdminCount() <= 1) U.fail('CONFLICT', 'Hệ thống phải còn ít nhất một Admin đang hoạt động.');
    },
    assertNotSelfDeactivate: function (actorId, targetId, patch) {
      if (targetId === actorId && patch.status === 'inactive') U.fail('CONFLICT', 'Không thể tự vô hiệu hóa tài khoản của mình.');
    }
  };

  /* ---------- Mã hiển thị ---------- */
  Domain.Codes = {
    /** Mã công việc hiển thị: CV-0001 từ TSK-1. */
    taskCodeFor: function (taskId) { return 'CV-' + U.pad(parseInt(taskId.split('-')[1], 10), 4); },
    /** Mã khách hàng tự sinh: KH-0001 từ CUS-1. */
    customerCodeFor: function (customerId) { return 'KH-' + U.pad(parseInt(customerId.split('-')[1], 10), 4); }
  };
})(QLCV);
