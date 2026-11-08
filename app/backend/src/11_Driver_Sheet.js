/**
 * Driver Google Sheets cho Q.makeStore.
 * - Mỗi tab = một bảng; hàng 1 là tiêu đề, được kiểm tra khớp lược đồ trước khi đọc/ghi.
 * - Mọi cột định dạng văn bản ('@') nên ngày ISO và "=..." không bị Sheets tự diễn giải.
 * - Đọc cả tab một lần/request; ghi theo từng dòng. Gọi trong khóa (Env.lock) khi ghi.
 */
(function (Q) {
  'use strict';
  if (typeof SpreadsheetApp === 'undefined') return;
  var U = Q.Util;

  var book = null, sheets = {}, rowNums = {};

  function openBook() {
    if (book) return book;
    var id = Q.Env.prop('SPREADSHEET_ID');
    book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!book) U.fail('INTERNAL', 'Chưa cấu hình SPREADSHEET_ID.');
    return book;
  }

  function sheetOf(t) {
    if (!sheets[t]) {
      var sh = openBook().getSheetByName(t);
      if (!sh) U.fail('INTERNAL', 'Thiếu tab "' + t + '". Hãy chạy bootstrapDatabase().');
      var cols = Q.Schema.cols(t);
      var head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
      for (var i = 0; i < cols.length; i++) {
        if (String(head[i]) !== cols[i]) U.fail('INTERNAL', 'Tab "' + t + '" sai tiêu đề cột ' + (i + 1) + ': cần "' + cols[i] + '".');
      }
      sheets[t] = sh;
    }
    return sheets[t];
  }

  function rowToObj(t, arr) {
    var o = {};
    Q.Schema.cols(t).forEach(function (c, i) { o[c] = arr[i]; });
    return o;
  }

  Q.SheetDriver = {
    reset: function () { book = null; sheets = {}; rowNums = {}; },
    read: function (t) {
      var sh = sheetOf(t), last = sh.getLastRow(), n = Q.Schema.cols(t).length;
      rowNums[t] = [];
      if (last < 2) return [];
      var vals = sh.getRange(2, 1, last - 1, n).getValues(), out = [];
      vals.forEach(function (arr, i) {
        var blank = arr.every(function (v) { return v === '' || v === null; });
        if (blank) return;
        out.push(rowToObj(t, arr));
        rowNums[t].push(i + 2);
      });
      return out;
    },
    append: function (t, obj) {
      var sh = sheetOf(t);
      sh.appendRow(Q.Schema.toArray(t, obj));
      (rowNums[t] = rowNums[t] || []).push(sh.getLastRow());
    },
    write: function (t, index, obj) {
      var sh = sheetOf(t), rn = rowNums[t] && rowNums[t][index];
      if (!rn) U.fail('INTERNAL', 'Không xác định được dòng cần ghi trong ' + t + '.');
      var arr = Q.Schema.toArray(t, obj);
      sh.getRange(rn, 1, 1, arr.length).setValues([arr]);
    },
    book: openBook
  };

  if (Q.Env && Q.Env.runtime === 'gas') Q.Store = Q.makeStore(Q.SheetDriver);
})(QLCV);
