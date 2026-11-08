/**
 * Môi trường Google Apps Script. Chỉ kích hoạt khi chạy trên Apps Script (có SpreadsheetApp).
 * Cấu hình đọc từ Script Properties (không ghi cứng trong mã):
 *   SPREADSHEET_ID, GOOGLE_CLIENT_ID, ALLOWED_DOMAIN (tùy chọn), DIRECTOR_EMAILS (tùy chọn),
 *   ADMIN_EMAIL (khởi tạo), BACKUP_FOLDER_ID (tùy chọn), ALLOW_SEED (chỉ môi trường thử).
 */
(function (Q) {
  'use strict';
  if (typeof SpreadsheetApp === 'undefined' || typeof PropertiesService === 'undefined') return;
  var U = Q.Util;

  Q.Env = {
    runtime: 'gas',
    allowDemoTokens: false,           // Không bao giờ bật trên môi trường thật
    now: function () { return new Date(); },
    prop: function (k) { return PropertiesService.getScriptProperties().getProperty(k); },
    lock: function (fn) {
      var lock = LockService.getScriptLock();
      try { lock.waitLock(20000); } catch (e) { U.fail('BUSY', 'Hệ thống đang bận, vui lòng thử lại sau giây lát.'); }
      try { return fn(); } finally { lock.releaseLock(); }
    },
    cacheGet: function (k) { return CacheService.getScriptCache().get(k); },
    cachePut: function (k, v, sec) { CacheService.getScriptCache().put(k, v, Math.max(1, Math.min(21600, sec))); },
    sha256: function (s) {
      var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
      return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    },
    fetchJson: function (url) {
      var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      var json = null;
      try { json = JSON.parse(r.getContentText()); } catch (e) { /* để json = null */ }
      return { status: r.getResponseCode(), json: json };
    },
    uuid: function () { return Utilities.getUuid(); },
    log: function (o) { console.log(JSON.stringify(o)); },
    logError: function (o) { console.error(JSON.stringify(o)); },
    flush: function () { SpreadsheetApp.flush(); }
  };
})(QLCV);
