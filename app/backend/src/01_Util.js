/** Tiện ích: lỗi nghiệp vụ, kiểm tra đầu vào, ngày giờ, phân trang. */
(function (Q) {
  'use strict';

  function AppError(code, message, details) {
    this.name = 'AppError';
    this.code = code;
    this.message = message;
    this.details = details || null;
  }
  AppError.prototype = Object.create(Error.prototype);
  AppError.prototype.constructor = AppError;

  var U = Q.Util = { AppError: AppError };

  U.fail = function (code, message, details) { throw new AppError(code, message, details); };
  U.invalid = function (field, message) { throw new AppError('VALIDATION', message, { field: field }); };

  function isoNoMs(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  U.iso = isoNoMs;
  U.isoNow = function () { return isoNoMs(Q.Env.now()); };
  /** Ngày hiện tại theo múi giờ Việt Nam, dạng YYYY-MM-DD. */
  U.today = function () {
    return new Date(Q.Env.now().getTime() + Q.Config.TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
  };
  U.pad = function (n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; };
  U.uniq = function (a) { var m = {}, o = []; a.forEach(function (x) { if (!m[x]) { m[x] = 1; o.push(x); } }); return o; };

  /** Chuẩn hóa để tìm kiếm không dấu. */
  U.norm = function (s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  };

  var CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  U.str = function (v, o) {
    o = o || {};
    var label = o.label || o.field || 'Giá trị';
    if (v === null || v === undefined) v = '';
    if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') U.invalid(o.field, label + ' không hợp lệ.');
    v = v.replace(CTRL, '').trim();
    if (o.required && !v) U.invalid(o.field, label + ' là bắt buộc.');
    if (v && o.min && v.length < o.min) U.invalid(o.field, label + ' tối thiểu ' + o.min + ' ký tự.');
    if (o.max && v.length > o.max) U.invalid(o.field, label + ' tối đa ' + o.max + ' ký tự.');
    if (v && o.pattern && !o.pattern.test(v)) U.invalid(o.field, label + ' không đúng định dạng.');
    return v;
  };

  U.oneOf = function (v, list, o) {
    o = o || {};
    if (v === undefined || v === null || v === '') {
      if (o.def !== undefined) return o.def;
      if (o.required) U.invalid(o.field, (o.label || o.field) + ' là bắt buộc.');
      return '';
    }
    if (list.indexOf(v) < 0) U.invalid(o.field, (o.label || o.field) + ' không hợp lệ.');
    return v;
  };

  U.ymd = function (v, o) {
    o = o || {};
    var s = U.str(v, { field: o.field, label: o.label, required: o.required });
    if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    var ok = false;
    if (m) {
      var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      ok = d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
    }
    if (!ok) U.invalid(o.field, (o.label || o.field) + ' phải có dạng YYYY-MM-DD.');
    return s;
  };

  /** Tiến độ lũy kế: chỉ nhận số nguyên 0–100 (chặn "50%", 150, -1, 50.5). */
  U.pct = function (v, o) {
    o = o || {};
    var n;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && /^\d{1,3}$/.test(v.trim())) n = parseInt(v, 10);
    else n = NaN;
    if (!isFinite(n) || Math.floor(n) !== n || n < 0 || n > 100) {
      U.invalid(o.field || 'progressPct', 'Tiến độ phải là số nguyên từ 0 đến 100.');
    }
    return n;
  };

  U.email = function (v, o) {
    o = o || {};
    var s = U.str(v, { field: o.field, label: o.label || 'Email', required: true, max: 254 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) U.invalid(o.field, (o.label || 'Email') + ' không hợp lệ.');
    return s;
  };

  U.bool = function (v) { return v === true || v === 'true' || v === 'TRUE' || v === 1; };

  U.pageArgs = function (p) {
    var page = parseInt(p && p.page, 10), size = parseInt(p && p.pageSize, 10);
    if (!(page >= 1)) page = 1;
    if (!(size >= 1)) size = Q.Config.PAGE_SIZE;
    if (size > Q.Config.PAGE_SIZE_MAX) size = Q.Config.PAGE_SIZE_MAX;
    return { page: page, size: size };
  };

  U.paginate = function (items, p) {
    var a = U.pageArgs(p), start = (a.page - 1) * a.size;
    return { items: items.slice(start, start + a.size), page: a.page, pageSize: a.size, total: items.length };
  };

  U.sortBy = function (arr, keyFn, dir) {
    var m = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (x, y) {
      var a = keyFn(x), b = keyFn(y);
      return a < b ? -m : a > b ? m : 0;
    });
  };
})(QLCV);
