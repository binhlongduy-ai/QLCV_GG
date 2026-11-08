/**
 * Use case: bảo trì (R16): sao lưu thủ công và khôi phục.
 * Khôi phục bị khóa trên môi trường sản xuất cho tới khi hoàn tất kiểm thử U7.
 * Phần kỹ thuật sao lưu (sao chép file Drive, dọn bản cũ) nằm ở 98_Backup.js.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy;

  var Maint = Q.MaintenanceService = {};

  Maint.backup = function (ctx) {
    P.require(ctx, 'user.manage');
    if (Q.Env.runtime !== 'gas') return { enabled: false, message: 'Sao lưu chỉ khả dụng trên môi trường Google Workspace.' };
    var res = Q.Backup.run('manual');
    Q.Audit.log(ctx, 'admin.backup', 'System', res.fileId, 'evt-backup-' + Q.Env.uuid());
    return res;
  };

  Maint.restore = function (ctx) {
    P.require(ctx, 'user.manage');
    U.fail('NOT_ENABLED', 'Khôi phục dữ liệu bị khóa trên môi trường sản xuất cho tới khi hoàn tất kiểm thử U7. Hãy thực hiện theo operations-runbook.');
  };
})(QLCV);
