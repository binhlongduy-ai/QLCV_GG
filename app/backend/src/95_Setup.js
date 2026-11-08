/**
 * Khởi tạo & vận hành trên Google Sheets (chạy từ trình soạn thảo Apps Script hoặc menu "QLCV").
 * Đây là công cụ quản trị một lần/định kỳ, không phải đường xử lý request; ghi dữ liệu qua Q.Repo.
 *  1) Đặt Script Properties:  SPREADSHEET_ID (nếu script không gắn sổ), GOOGLE_CLIENT_ID, ADMIN_EMAIL,
 *     tùy chọn ALLOWED_DOMAIN, DIRECTOR_EMAILS, BACKUP_FOLDER_ID.
 *  2) Chạy bootstrapDatabase()  -> tạo 10 tab, nạp Roles/Permissions/RolePermissions, tạo Admin đầu tiên.
 *  3) (Chỉ môi trường thử) đặt ALLOW_SEED=true rồi chạy seedDemoData().
 *  4) installTriggers() -> sao lưu hằng ngày.
 * Không nạp dữ liệu khách hàng thật cho tới khi qua cổng bảo mật/chủ dữ liệu (R13).
 */
(function (Q) {
  'use strict';
  var U = Q.Util;
  if (typeof SpreadsheetApp === 'undefined') { Q.Setup = {}; return; }

  var Setup = Q.Setup = {};

  function book() { return Q.SheetDriver.book(); }

  /** Tạo đủ các tab theo lược đồ; kiểm tra tiêu đề cột của tab đã có (sai thì dừng, không ghi đè). */
  Setup.ensureTabs = function () {
    var ss = book(), report = [];
    Q.Schema.names.forEach(function (t) {
      var cols = Q.Schema.cols(t), sh = ss.getSheetByName(t);
      if (!sh) { sh = ss.insertSheet(t); report.push('Tạo tab ' + t); }
      var head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
      var empty = head.every(function (v) { return v === ''; });
      // Di trú bổ sung: tab cũ có đúng các cột đầu, chỉ thiếu cột mới ở cuối -> thêm tiêu đề cột thiếu (không đụng dữ liệu).
      var n = 0;
      while (n < cols.length && String(head[n]) !== '') n++;
      var prefixOk = n > 0 && cols.slice(0, n).every(function (c, i) { return String(head[i]) === c; }) &&
        head.slice(n).every(function (v) { return v === ''; });
      if (empty) {
        sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e8f0ec');
        sh.setFrozenRows(1);
      } else if (prefixOk && n < cols.length) {
        sh.getRange(1, n + 1, 1, cols.length - n).setValues([cols.slice(n)]).setFontWeight('bold').setBackground('#e8f0ec');
        report.push('Thêm cột vào tab ' + t + ': ' + cols.slice(n).join(', '));
      } else {
        cols.forEach(function (c, i) { if (String(head[i]) !== c) throw new Error('Tab ' + t + ' sai cột ' + (i + 1) + ': cần "' + c + '", đang là "' + head[i] + '".'); });
      }
      // Định dạng văn bản cho toàn bộ cột dữ liệu để tránh Sheets tự đổi kiểu ngày/số.
      sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), cols.length).setNumberFormat('@');
    });
    var def = ss.getSheetByName('Sheet1');
    if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
    return report;
  };

  /** Nạp bảng tham chiếu (vai trò, quyền) khi bảng còn trống, rồi xóa bộ nhớ đệm vai trò/quyền. */
  Setup.loadReference = function () {
    var R = Q.SeedData.reference;
    ['Roles', 'Permissions', 'RolePermissions'].forEach(function (t) {
      if (Q.Repo.of(t).count() === 0) Q.Repo.of(t).insertMany(R[t]);
    });
    Q.Policy.clearReference();
  };

  Setup.bootstrapDatabase = function () {
    Q.Store.reset();
    var report = Setup.ensureTabs();
    Q.Store.reset();
    Setup.loadReference();
    var adminEmail = (Q.Env.prop('ADMIN_EMAIL') || '').trim().toLowerCase();
    if (Q.Repo.users.count() === 0) {
      if (!adminEmail) throw new Error('Đặt Script Property ADMIN_EMAIL trước khi bootstrap.');
      var now = U.isoNow();
      Q.Repo.users.insert({ user_id: 'USR-001', email: U.email(adminEmail), employee_code: 'ADMIN-001', full_name: 'Quản trị hệ thống',
        role_id: 'ROL-ADMIN', org_unit: 'HOI-SO', status: 'active', created_at: now, updated_at: now, unread_notifications: 0 });
      report.push('Tạo Admin đầu tiên: ' + adminEmail);
    }
    var fixed = Q.Derived.recomputeAll();   // điền số liệu dẫn xuất cho dữ liệu có sẵn (kể cả sau khi thêm cột)
    if (fixed.tasks || fixed.users) report.push('Tính lại số liệu dẫn xuất: ' + fixed.tasks + ' công việc, ' + fixed.users + ' người dùng');
    console.log(report.join('\n') || 'Cơ sở dữ liệu đã sẵn sàng.');
    return report;
  };

  /** Chỉ cho môi trường thử: nạp dữ liệu tổng hợp (data/appsheet-synthetic). Từ chối nếu đã có dữ liệu. */
  Setup.seedDemoData = function () {
    if (Q.Env.prop('ALLOW_SEED') !== 'true') throw new Error('Từ chối: cần ALLOW_SEED=true (chỉ môi trường thử, dữ liệu tổng hợp).');
    Q.Store.reset();
    Setup.ensureTabs();
    Q.Store.reset();
    ['Users', 'Customers', 'Tasks', 'TaskAssignees', 'TaskUpdates', 'Notifications', 'AuditLogs'].forEach(function (t) {
      if (Q.Repo.of(t).count() > 0) throw new Error('Từ chối: tab ' + t + ' đã có dữ liệu.');
    });
    Setup.loadReference();
    var adminEmail = (Q.Env.prop('ADMIN_EMAIL') || '').trim().toLowerCase();
    var D = Q.SeedData.demo;
    Object.keys(D).forEach(function (t) {
      Q.Repo.of(t).insertMany(D[t].map(function (r) {
        // Cho phép đăng nhập thử bằng tài khoản Admin thật của người cài đặt.
        if (t === 'Users' && r.user_id === 'USR-001' && adminEmail) { r = Object.assign({}, r, { email: adminEmail }); }
        return r;
      }));
    });
    Q.Derived.recomputeAll();   // dữ liệu mẫu (CSV) không có cột dẫn xuất: tính từ TaskUpdates và Notifications
    console.log('Đã nạp dữ liệu tổng hợp.');
  };

  /** Chạy kiểm tra toàn vẹn dưới quyền Admin đầu tiên (dùng từ trình soạn thảo). */
  Setup.checkIntegrity = function () {
    Q.Store.reset();
    var admin = Q.Repo.users.byRole(Q.Repo.roles.idByCode('Admin'))[0];
    var res = Q.IntegrityService.check({ perms: { 'user.manage': true }, user: admin });
    console.log(JSON.stringify(res, null, 2));
    return res;
  };

  /** Chỉ chủ sở hữu được sửa trực tiếp các tab (R4). */
  Setup.protectSheets = function () {
    var me = Session.getEffectiveUser();
    Q.Schema.names.forEach(function (t) {
      var sh = book().getSheetByName(t), prot = sh.protect().setDescription('QLCV: chỉ chủ sở hữu được sửa trực tiếp (R4)');
      prot.addEditor(me);
      prot.removeEditors(prot.getEditors().filter(function (u) { return u.getEmail() !== me.getEmail(); }));
      if (prot.canDomainEdit()) prot.setDomainEdit(false);
    });
  };

  Setup.installTriggers = function () {
    ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(tr); });
    ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).create();
  };

  Setup.showConfig = function () {
    var out = { spreadsheet: Q.Env.prop('SPREADSHEET_ID') || '(gắn sổ)', clientId: !!Q.Env.prop('GOOGLE_CLIENT_ID'),
      allowedDomain: Q.Env.prop('ALLOWED_DOMAIN') || '(không giới hạn)', directors: Q.Env.prop('DIRECTOR_EMAILS') || '(chưa đặt)',
      backupFolder: Q.Env.prop('BACKUP_FOLDER_ID') || '(thư mục gốc Drive)', allowSeed: Q.Env.prop('ALLOW_SEED') === 'true', version: Q.Config.VERSION };
    console.log(JSON.stringify(out, null, 2));
    return out;
  };
})(QLCV);

// ---- Hàm toàn cục để chọn trong trình soạn thảo / menu ----
function bootstrapDatabase() { return QLCV.Setup.bootstrapDatabase(); }
function seedDemoData() { return QLCV.Setup.seedDemoData(); }
function checkIntegrity() { return QLCV.Setup.checkIntegrity(); }
function protectSheets() { return QLCV.Setup.protectSheets(); }
function installTriggers() { return QLCV.Setup.installTriggers(); }
function showConfig() { return QLCV.Setup.showConfig(); }
function dailyBackup() { QLCV.Env.flush(); return QLCV.Backup.run('daily'); }
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('QLCV')
      .addItem('Khởi tạo cơ sở dữ liệu', 'bootstrapDatabase')
      .addItem('Kiểm tra toàn vẹn', 'checkIntegrity')
      .addItem('Khóa quyền sửa trực tiếp các tab', 'protectSheets')
      .addItem('Cài sao lưu hằng ngày', 'installTriggers')
      .addItem('Hiển thị cấu hình', 'showConfig')
      .addToUi();
  } catch (e) { /* không có UI (chạy độc lập) */ }
}
