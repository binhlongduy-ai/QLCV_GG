/**
 * Hạ tầng sao lưu (R16): sao chép tab tính toán thành một bản Google Sheets trên Drive, và dọn bản cũ.
 * Chỉ chạy trên Apps Script (cần DriveApp). Use case gọi qua 48_Svc_Maintenance.js và dailyBackup() ở 95_Setup.js.
 */
(function (Q) {
  'use strict';
  if (typeof SpreadsheetApp === 'undefined') { Q.Backup = {}; return; }

  function book() { return Q.SheetDriver.book(); }

  Q.Backup = {
    run: function (kind) {
      var stamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmm');
      var file = DriveApp.getFileById(book().getId());
      var folderId = Q.Env.prop('BACKUP_FOLDER_ID');
      var name = 'QLCV_backup_' + kind + '_' + stamp;
      var copy = folderId ? file.makeCopy(name, DriveApp.getFolderById(folderId)) : file.makeCopy(name);
      var removed = Q.Backup.prune(folderId);
      return { enabled: true, fileId: copy.getId(), name: name, pruned: removed };
    },
    /** Đưa vào thùng rác bản sao lưu cũ hơn BACKUP_RETENTION_DAYS (chỉ trong thư mục sao lưu, theo tiền tố tên). */
    prune: function (folderId) {
      if (!folderId) return 0;
      var cutoff = Date.now() - Q.Config.BACKUP_RETENTION_DAYS * 86400000, n = 0;
      var it = DriveApp.getFolderById(folderId).getFiles();
      while (it.hasNext()) {
        var f = it.next();
        if (f.getName().indexOf('QLCV_backup_') === 0 && f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); n++; }
      }
      return n;
    }
  };
})(QLCV);
