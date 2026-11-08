/* TỆP SINH TỰ ĐỘNG bởi tools/build.js – lõi backend chạy trong trình duyệt cho chế độ DEMO. */
/* ---- 00_Namespace.js ---- */
/**
 * QLCV_CBTD – Lõi backend.
 * Chạy nguyên bản trên: Google Apps Script (V8), trình duyệt (chế độ demo) và Node (kiểm thử).
 * Các tệp được nạp theo thứ tự số; mọi module gắn vào không gian tên QLCV.
 * Lược đồ khớp docs/appsheet/data-dictionary.md (10 tab) + 3 cột mở rộng ghi ở Q.Schema.extensions.
 */
var QLCV = (typeof QLCV !== 'undefined' && QLCV) ? QLCV : {};

(function (Q) {
  'use strict';

  Q.Config = {
    APP: 'QLCV_CBTD',
    VERSION: '1.0.0',
    TZ_OFFSET_MIN: 420,            // Asia/Ho_Chi_Minh = UTC+7, không có DST
    PAGE_SIZE: 20,
    PAGE_SIZE_MAX: 100,
    MAX_BODY_BYTES: 64 * 1024,
    RATE_LIMIT_PER_MIN: 240,
    TOKEN_CACHE_SEC: 300,
    BACKUP_RETENTION_DAYS: 30,
    LIMITS: { title: 200, description: 2000, narrative: 2000, comment: 1000, name: 200, phone: 20, org: 100 }
  };

  Q.Enums = {
    taskStatus: ['not_started', 'in_progress', 'completed'],
    manualTaskStatus: ['not_started', 'in_progress'],   // 'completed' chỉ đặt tự động theo R8
    priority: ['high', 'normal', 'low'],
    customerType: ['personal', 'business'],
    customerStatus: ['new', 'managed'],
    reviewStatus: ['pending', 'approved', 'rejected'],
    assignmentRole: ['primary', 'collaborator'],
    userStatus: ['active', 'inactive'],
    roleCodes: ['Admin', 'BGD', 'KSV', 'CBTD']
  };

  var REVIEW_FIELDS = ['review_status', 'reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at', 'review_comment'];

  var tables = {
    Roles: { cols: ['role_id', 'code', 'name', 'description'], pk: 'role_id', reference: true },
    Permissions: { cols: ['permission_id', 'code', 'name', 'description'], pk: 'permission_id', reference: true },
    RolePermissions: { cols: ['role_id', 'permission_id', 'created_at'], pk: null, reference: true },
    Users: {
      cols: ['user_id', 'email', 'employee_code', 'full_name', 'role_id', 'org_unit', 'status', 'created_at', 'updated_at'],
      pk: 'user_id', prefix: 'USR', immutable: ['user_id', 'email', 'created_at']
    },
    Customers: {
      cols: ['customer_id', 'customer_code', 'name', 'type', 'phone', 'status', 'created_at', 'updated_at',
        'company_representative', 'archived_at'],
      pk: 'customer_id', prefix: 'CUS', immutable: ['customer_id', 'created_at']
    },
    Tasks: {
      cols: ['task_id', 'task_code', 'customer_id', 'title', 'description', 'status', 'priority', 'due_at',
        'created_by_user_id', 'completed_at', 'created_at', 'updated_at', 'archived_at'],
      pk: 'task_id', prefix: 'TSK', immutable: ['task_id', 'task_code', 'created_by_user_id', 'created_at']
    },
    TaskAssignees: {
      cols: ['assignment_id', 'task_id', 'user_id', 'assignee_email_snapshot', 'assignment_role', 'assigned_at', 'active'],
      pk: 'assignment_id', prefix: 'ASG',
      immutable: ['assignment_id', 'task_id', 'user_id', 'assignee_email_snapshot', 'assignment_role', 'assigned_at']
    },
    TaskUpdates: {
      cols: ['update_id', 'task_id', 'progress_pct', 'narrative', 'submitted_by_user_id', 'submitted_by_email_snapshot',
        'submitted_at', 'review_status', 'reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at', 'review_comment'],
      pk: 'update_id', prefix: 'UPD',
      immutable: ['update_id', 'task_id', 'progress_pct', 'narrative', 'submitted_by_user_id', 'submitted_by_email_snapshot', 'submitted_at'],
      reviewFields: REVIEW_FIELDS
    },
    Notifications: {
      cols: ['notification_id', 'recipient_user_id', 'event_type', 'source_record_id', 'request_or_event_key', 'message',
        'created_at', 'read_at'],
      pk: 'notification_id', prefix: 'NTF',
      immutable: ['notification_id', 'recipient_user_id', 'event_type', 'source_record_id', 'request_or_event_key', 'message', 'created_at']
    },
    AuditLogs: {
      cols: ['audit_id', 'actor_user_id', 'actor_email_snapshot', 'action', 'entity_type', 'entity_id', 'request_or_event_key', 'created_at'],
      pk: 'audit_id', prefix: 'AUD', appendOnly: true
    }
  };

  var INT_COLS = { 'TaskUpdates.progress_pct': 1 };
  var BOOL_COLS = { 'TaskAssignees.active': 1 };

  function isoNoMs(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

  function coerceVal(table, col, v) {
    var key = table + '.' + col;
    if (INT_COLS[key]) {
      if (v === '' || v === null || v === undefined) return null;
      var n = typeof v === 'number' ? v : parseInt(v, 10);
      return isFinite(n) ? Math.round(n) : null;
    }
    if (BOOL_COLS[key]) return v === true || String(v).toUpperCase() === 'TRUE';
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return isoNoMs(v);
    return String(v);
  }

  Q.Schema = {
    tables: tables,
    /** Cột mở rộng so với data-dictionary.md (cần bổ sung vào từ điển khi nghiệp vụ chấp thuận). */
    extensions: [
      'Tasks.archived_at — lưu trữ thay vì xóa cứng (PER-03, R5)',
      'Customers.archived_at — xóa mềm (PER-08)',
      'Customers.company_representative — Người đại diện công ty (R17)'
    ],
    names: Object.keys(tables),
    cols: function (t) { return tables[t].cols; },
    normalize: function (t, obj) {
      var out = {};
      tables[t].cols.forEach(function (c) { out[c] = coerceVal(t, c, obj[c]); });
      return out;
    },
    toArray: function (t, obj) {
      return tables[t].cols.map(function (c) {
        var key = t + '.' + c, v = obj[c];
        if (BOOL_COLS[key]) return v ? 'TRUE' : 'FALSE';
        if (INT_COLS[key]) return (v === null || v === undefined) ? '' : v;
        return v === null || v === undefined ? '' : v;
      });
    }
  };
})(QLCV);

/* ---- 01_Util.js ---- */
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

/* ---- 02_Store.js ---- */
/**
 * Lớp lưu trữ dùng chung. Mọi quy tắc toàn vẹn nằm ở đây, độc lập với nơi lưu (Google Sheets / bộ nhớ / sau này là Postgres):
 *  - khóa chính duy nhất; sinh ID tuần tự bằng bộ đếm (không quét lại bảng mỗi lần ghi);
 *  - chỉ mục khóa chính và chỉ mục theo cột (findBy) được CẬP NHẬT TĂNG DẦN khi ghi, không dựng lại toàn bộ;
 *  - cột bất biến (immutable) không được sửa; AuditLogs chỉ được ghi thêm;
 *  - bộ nhớ đệm theo từng request, bản ghi trả về bị đóng băng (chống sửa nhầm).
 *
 * Driver cần cung cấp: read(table) -> [obj], append(table, obj), write(table, index, obj).
 * Tùy chọn: appendMany(table, [obj]) để ghi nhiều dòng trong một lượt gọi.
 * Vị trí (index) của một dòng trong mảng rows không đổi vì lớp này không xóa cứng dòng nào.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  function freeze(o) { return Object.freeze(o); }
  function keyOf(v) { return String(v); }

  /** Số thứ tự của một ID dạng PREFIX-123, hoặc null nếu không khớp. */
  function seqOf(def, id) {
    if (!def.prefix || typeof id !== 'string') return null;
    var m = new RegExp('^' + def.prefix + '-(\\d+)$').exec(id);
    return m ? parseInt(m[1], 10) : null;
  }

  Q.makeStore = function (driver) {
    var cache = {};

    function load(t) {
      if (!Q.Schema.tables[t]) U.fail('INTERNAL', 'Bảng không tồn tại: ' + t);
      if (!cache[t]) {
        cache[t] = {
          rows: driver.read(t).map(function (r) { return freeze(Q.Schema.normalize(t, r)); }),
          pk: null,            // khóa chính -> vị trí, dựng lần đầu khi cần
          by: Object.create(null), // cột -> (giá trị -> danh sách vị trí), dựng theo yêu cầu
          seq: undefined       // số thứ tự lớn nhất đã dùng, dựng lần đầu khi cần
        };
      }
      return cache[t];
    }

    function pkMap(t) {
      var c = load(t), pk = Q.Schema.tables[t].pk;
      if (!pk) U.fail('INTERNAL', 'Bảng ' + t + ' không có khóa chính.');
      if (!c.pk) {
        c.pk = Object.create(null);
        c.rows.forEach(function (r, i) { c.pk[r[pk]] = i; });
      }
      return c.pk;
    }

    function seqOfTable(t, c) {
      if (c.seq === undefined) {
        var def = Q.Schema.tables[t], max = 0;
        c.rows.forEach(function (r) { var n = seqOf(def, r[def.pk]); if (n !== null && n > max) max = n; });
        c.seq = max;
      }
      return c.seq;
    }

    /** Thêm một dòng mới vào cuối và đưa vào mọi chỉ mục đang có. */
    function addRow(t, c, row) {
      var def = Q.Schema.tables[t], i = c.rows.length;
      c.rows.push(row);
      if (c.pk && def.pk) c.pk[row[def.pk]] = i;
      Object.keys(c.by).forEach(function (col) {
        var m = c.by[col], k = keyOf(row[col]);
        (m[k] = m[k] || []).push(i);
      });
      if (c.seq !== undefined && def.pk) {
        var n = seqOf(def, row[def.pk]);
        if (n !== null && n > c.seq) c.seq = n;
      }
    }

    /** Chèn vị trí i vào danh sách đã sắp tăng dần, để thứ tự kết quả luôn theo thứ tự dòng (như khi dựng mới). */
    function insertSorted(list, i) {
      var lo = 0, hi = list.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (list[mid] < i) lo = mid + 1; else hi = mid; }
      list.splice(lo, 0, i);
    }

    /** Sau khi sửa một dòng tại vị trí i: chỉ di chuyển vị trí trong những chỉ mục theo cột có giá trị đổi. */
    function reindexChanged(c, i, before, after) {
      Object.keys(c.by).forEach(function (col) {
        var ko = keyOf(before[col]), kn = keyOf(after[col]);
        if (ko === kn) return;
        var m = c.by[col], list = m[ko] || [], at = list.indexOf(i);
        if (at >= 0) list.splice(at, 1);
        m[kn] = m[kn] || [];
        insertSorted(m[kn], i);
      });
    }

    var S = {
      reset: function () { cache = {}; if (driver.reset) driver.reset(); },
      all: function (t) { return load(t).rows.slice(); },
      find: function (t, id) {
        if (id === undefined || id === null || id === '') return null;
        var i = pkMap(t)[id];
        return i === undefined ? null : load(t).rows[i];
      },
      where: function (t, pred) { return load(t).rows.filter(pred); },
      /** Tra theo cột bất kỳ bằng chỉ mục (dựng một lần cho mỗi request, sau đó giữ đồng bộ khi ghi). */
      findBy: function (t, col, val) {
        var c = load(t);
        if (!c.by[col]) {
          var m = Object.create(null);
          c.rows.forEach(function (r, i) { var k = keyOf(r[col]); (m[k] = m[k] || []).push(i); });
          c.by[col] = m;
        }
        return (c.by[col][keyOf(val)] || []).map(function (i) { return c.rows[i]; });
      },
      insert: function (t, obj) {
        var def = Q.Schema.tables[t], row = freeze(Q.Schema.normalize(t, obj)), c = load(t);
        if (def.pk && S.find(t, row[def.pk])) U.fail('CONFLICT', 'Khóa ' + row[def.pk] + ' đã tồn tại trong ' + t + '.');
        driver.append(t, row);
        addRow(t, c, row);
        return row;
      },
      /**
       * Ghi nhiều dòng: kiểm tra trùng khóa TRƯỚC khi ghi dòng nào, rồi gọi driver.appendMany một lần (nếu có).
       */
      insertMany: function (t, objs) {
        var def = Q.Schema.tables[t], c = load(t), rows = [], seen = Object.create(null);
        objs.forEach(function (o) {
          var row = freeze(Q.Schema.normalize(t, o));
          if (def.pk) {
            var k = row[def.pk];
            if (seen[k] || S.find(t, k)) U.fail('CONFLICT', 'Khóa ' + k + ' đã tồn tại trong ' + t + '.');
            seen[k] = true;
          }
          rows.push(row);
        });
        if (!rows.length) return rows;
        if (driver.appendMany) driver.appendMany(t, rows);
        else rows.forEach(function (r) { driver.append(t, r); });
        rows.forEach(function (r) { addRow(t, c, r); });
        return rows;
      },
      update: function (t, id, patch) {
        var def = Q.Schema.tables[t];
        if (def.appendOnly) U.fail('INTERNAL', t + ' chỉ cho phép ghi thêm.');
        var c = load(t), i = pkMap(t)[id];
        if (i === undefined) U.fail('NOT_FOUND', 'Không tìm thấy bản ghi ' + id + ' trong ' + t + '.');
        var cur = c.rows[i];
        Object.keys(patch).forEach(function (k) {
          if (def.cols.indexOf(k) < 0) U.fail('INTERNAL', 'Cột không tồn tại: ' + t + '.' + k);
          if ((def.immutable || []).indexOf(k) >= 0 && String(patch[k]) !== String(cur[k])) {
            U.fail('INTERNAL', 'Cột bất biến không được sửa: ' + t + '.' + k);
          }
        });
        var merged = {};
        def.cols.forEach(function (k) { merged[k] = Object.prototype.hasOwnProperty.call(patch, k) ? patch[k] : cur[k]; });
        var row = freeze(Q.Schema.normalize(t, merged));
        driver.write(t, i, row);
        c.rows[i] = row;
        if (def.pk && row[def.pk] !== cur[def.pk]) { c.pk = null; c.seq = undefined; }   // khóa đổi: dựng lại hai chỉ mục này
        reindexChanged(c, i, cur, row);
        return row;
      },
      /** ID tiếp theo dạng PREFIX-001 (không ghi gì; dùng ngay trước khi insert). */
      nextId: function (t) {
        var def = Q.Schema.tables[t];
        return def.prefix + '-' + U.pad(seqOfTable(t, load(t)) + 1, 3);
      },
      count: function (t) { return load(t).rows.length; }
    };
    return S;
  };
})(QLCV);

/* ---- 10_Env_Gas.js ---- */
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

/* ---- 11_Driver_Sheet.js ---- */
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
    /** Ghi nhiều dòng bằng MỘT lượt setValues (thay vì appendRow từng dòng). */
    appendMany: function (t, objs) {
      if (!objs.length) return;
      var sh = sheetOf(t), n = Q.Schema.cols(t).length;
      var start = sh.getLastRow() + 1, arrs = objs.map(function (o) { return Q.Schema.toArray(t, o); });
      sh.getRange(start, 1, arrs.length, n).setValues(arrs);
      rowNums[t] = rowNums[t] || [];
      for (var k = 0; k < arrs.length; k++) rowNums[t].push(start + k);
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

/* ---- 20_Auth_Policy.js ---- */
/**
 * Xác thực (R1) và phân quyền cấp dữ liệu (R3).
 * - Danh tính: Google ID token, kiểm tra aud/iss/exp/email_verified (+ hd nếu cấu hình) rồi ánh xạ sang dòng Users đang hoạt động.
 * - Quyền: tra từ tab RolePermissions (dữ liệu, không ghi cứng) + phạm vi bản ghi cho CBTD.
 * Ẩn nút trên giao diện KHÔNG phải là phân quyền; mọi action đều kiểm tra lại ở đây.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  var Auth = Q.Auth = {};

  Auth.verifyToken = function (idToken) {
    var Env = Q.Env;
    if (typeof idToken !== 'string' || !idToken || idToken.length > 4096) {
      U.fail('UNAUTHENTICATED', 'Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.');
    }
    if (Env.allowDemoTokens && idToken.indexOf('demo:') === 0) return { email: idToken.slice(5).toLowerCase() };

    var ck = 'tok:' + Env.sha256(idToken), hit = Env.cacheGet(ck);
    if (hit) { try { return JSON.parse(hit); } catch (e) { /* bỏ qua, xác minh lại */ } }

    var clientId = Env.prop('GOOGLE_CLIENT_ID') || '980548527328-g4aiprfddm1fblgc376iuunrsh9o54j9.apps.googleusercontent.com';
    if (!clientId) U.fail('INTERNAL', 'Máy chủ chưa cấu hình GOOGLE_CLIENT_ID.');
    var r = Env.fetchJson('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (r.status !== 200 || !r.json) U.fail('UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

    var t = r.json, nowSec = Math.floor(Env.now().getTime() / 1000);
    if (t.aud !== clientId) U.fail('UNAUTHENTICATED', 'Mã đăng nhập không dành cho ứng dụng này.');
    if (['accounts.google.com', 'https://accounts.google.com'].indexOf(t.iss) < 0) U.fail('UNAUTHENTICATED', 'Nhà phát hành mã đăng nhập không hợp lệ.');
    if (String(t.email_verified) !== 'true' || !t.email) U.fail('UNAUTHENTICATED', 'Email Google chưa được xác minh.');
    if (Number(t.exp) <= nowSec) U.fail('UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn.');
    var hd = Env.prop('ALLOWED_DOMAIN');
    if (hd && String(t.hd || '').toLowerCase() !== hd.toLowerCase()) U.fail('FORBIDDEN', 'Tài khoản không thuộc tổ chức được phép.');

    var out = { email: String(t.email).toLowerCase() };
    Env.cachePut(ck, JSON.stringify(out), Math.min(Q.Config.TOKEN_CACHE_SEC, Number(t.exp) - nowSec));
    return out;
  };

  /** Trả về dòng Users đang hoạt động ứng với token. */
  Auth.authenticate = function (idToken) {
    var id = Auth.verifyToken(idToken);
    var user = Q.Store.findBy('Users', 'email', id.email)[0];
    if (!user) U.fail('FORBIDDEN', 'Tài khoản ' + id.email + ' chưa được cấp quyền sử dụng hệ thống.');
    if (user.status !== 'active') U.fail('FORBIDDEN', 'Tài khoản đã bị vô hiệu hóa.');
    return user;
  };

  var Policy = Q.Policy = {};

  function directorEmails() {
    return String(Q.Env.prop('DIRECTOR_EMAILS') || '').split(',')
      .map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }

  Policy.build = function (user) {
    var S = Q.Store, role = S.find('Roles', user.role_id);
    if (!role) U.fail('FORBIDDEN', 'Vai trò của tài khoản không hợp lệ.');
    var perms = {};
    S.findBy('RolePermissions', 'role_id', user.role_id).forEach(function (rp) {
      var p = S.find('Permissions', rp.permission_id);
      if (p) perms[p.code] = true;
    });
    // Cơ chế xác định "Giám đốc" trong BGD (điểm còn mở của plan): danh sách DIRECTOR_EMAILS.
    var isDirector = role.code === 'BGD' && directorEmails().indexOf(user.email) >= 0;
    if (isDirector) { perms['task.transfer'] = true; perms['dashboard.view_director'] = true; }
    return { user: user, role: role.code, roleName: role.name, perms: perms, isDirector: isDirector };
  };

  Policy.has = function (ctx, code) { return ctx.perms[code] === true; };
  Policy.require = function (ctx, code) {
    if (!ctx.perms[code]) U.fail('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', { permission: code });
  };
  Policy.isScoped = function (ctx) { return ctx.role === 'CBTD'; };

  /** Công việc mà người dùng đang được phân công (primary/collaborator còn hiệu lực). */
  Policy.assignedTaskIds = function (userId) {
    var ids = {};
    Q.Store.findBy('TaskAssignees', 'user_id', userId).forEach(function (a) { if (a.active) ids[a.task_id] = true; });
    return ids;
  };
  Policy.isAssignee = function (ctx, taskId) { return !!Policy.assignedTaskIds(ctx.user.user_id)[taskId]; };

  Policy.visibleTasks = function (ctx) {
    var tasks = Q.Store.all('Tasks');
    if (!Policy.isScoped(ctx)) return tasks;
    var mine = Policy.assignedTaskIds(ctx.user.user_id);
    return tasks.filter(function (t) { return mine[t.task_id]; });
  };

  /** Trả về công việc nếu nằm trong phạm vi; ngoài phạm vi trả NOT_FOUND để không lộ sự tồn tại. */
  Policy.taskOrFail = function (ctx, taskId) {
    var t = Q.Store.find('Tasks', taskId);
    if (!t || (Policy.isScoped(ctx) && !Policy.isAssignee(ctx, taskId))) U.fail('NOT_FOUND', 'Không tìm thấy công việc.');
    return t;
  };

  Policy.visibleCustomers = function (ctx) {
    var all = Q.Store.all('Customers');
    if (!Policy.isScoped(ctx)) return all;
    var ids = {};
    Policy.visibleTasks(ctx).forEach(function (t) { ids[t.customer_id] = true; });
    return all.filter(function (c) { return ids[c.customer_id]; });
  };

  Policy.customerOrFail = function (ctx, id) {
    var c = Q.Store.find('Customers', id);
    if (!c) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    if (Policy.isScoped(ctx)) {
      var ok = Policy.visibleTasks(ctx).some(function (t) { return t.customer_id === id; });
      if (!ok) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
    return c;
  };
})(QLCV);

/* ---- 30_Core.js ---- */
/**
 * Thành phần dùng chung: nhật ký kiểm toán (R12), thông báo (R11), DTO trả về cho giao diện.
 * Nội dung thông báo/audit KHÔNG chứa dữ liệu khách hàng nhạy cảm, token, mật khẩu.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  /** Quy tắc nghiệp vụ dùng chung cho công việc: một nơi duy nhất cho định nghĩa "đang mở" và "trễ hạn". */
  Q.Rules = {
    /** Đang mở: chưa hoàn thành và chưa lưu trữ. */
    isOpen: function (t) { return t.status !== 'completed' && !t.archived_at; },
    /** Trễ hạn: chưa hoàn thành và hạn trước ngày hôm nay (không xét lưu trữ; xem CODE_REVIEW). */
    isLate: function (t, today) { return t.status !== 'completed' && t.due_at < today; }
  };

  Q.Audit = {
    /** Dòng nhật ký đã ghi với khóa này (dùng để chống ghi trùng khi thử lại), hoặc null. */
    find: function (key) { return Q.Store.findBy('AuditLogs', 'request_or_event_key', key)[0] || null; },
    has: function (key) { return Q.Audit.find(key) !== null; },
    /** Ghi thêm một dòng; trả null nếu key đã tồn tại (idempotent). */
    log: function (ctx, action, entityType, entityId, key) {
      if (Q.Audit.has(key)) return null;
      return Q.Store.insert('AuditLogs', {
        audit_id: Q.Store.nextId('AuditLogs'),
        actor_user_id: ctx.user.user_id,
        actor_email_snapshot: ctx.user.email,
        action: action, entity_type: entityType, entity_id: entityId,
        request_or_event_key: key, created_at: U.isoNow()
      });
    }
  };

  Q.Notify = {
    /** Khóa khử trùng lặp: evt-<loại>-<bản ghi nguồn>-<người nhận>. */
    send: function (recipientId, eventType, sourceId, message) {
      var key = 'evt-' + eventType + '-' + sourceId + '-' + recipientId;
      if (Q.Store.findBy('Notifications', 'request_or_event_key', key).length) return null;
      return Q.Store.insert('Notifications', {
        notification_id: Q.Store.nextId('Notifications'),
        recipient_user_id: recipientId, event_type: eventType, source_record_id: sourceId,
        request_or_event_key: key, message: String(message).slice(0, 300), created_at: U.isoNow(), read_at: ''
      });
    }
  };

  /** Tham chiếu người dùng cho giao diện; người không còn trong bảng vẫn hiện được theo mã. */
  function userRef(id) {
    var u = Q.Store.find('Users', id);
    return u ? { userId: u.user_id, name: u.full_name } : { userId: id, name: id || '' };
  }

  var DTO = Q.DTO = {};

  /** Chuyển công việc sang DTO. Chỉ tra đúng các dòng liên quan qua chỉ mục (không quét cả bảng cho mỗi công việc). */
  DTO.tasks = function (ctx, tasks) {
    var S = Q.Store, today = U.today();
    return tasks.map(function (t) {
      var p = null, c = null, k = S.find('Customers', t.customer_id), approved = 0, pending = 0;
      S.findBy('TaskAssignees', 'task_id', t.task_id).forEach(function (a) {
        if (!a.active) return;
        if (a.assignment_role === 'primary') p = a; else c = a;
      });
      S.findBy('TaskUpdates', 'task_id', t.task_id).forEach(function (u) {
        if (u.review_status === 'approved') approved = Math.max(approved, u.progress_pct || 0);
        if (u.review_status === 'pending') pending++;
      });
      return {
        taskId: t.task_id, taskCode: t.task_code, title: t.title, description: t.description,
        status: t.status, priority: t.priority, dueAt: t.due_at,
        overdue: Q.Rules.isOpen(t) && Q.Rules.isLate(t, today),
        archived: !!t.archived_at,
        customer: k ? { customerId: k.customer_id, code: k.customer_code, name: k.name } : null,
        primary: p ? userRef(p.user_id) : null,
        collaborator: c ? userRef(c.user_id) : null,
        createdBy: userRef(t.created_by_user_id),
        createdAt: t.created_at, updatedAt: t.updated_at, completedAt: t.completed_at || null,
        approvedProgress: approved, pendingUpdates: pending
      };
    });
  };

  DTO.updates = function (updates) {
    return updates.map(function (u) {
      return {
        updateId: u.update_id, taskId: u.task_id, progressPct: u.progress_pct, narrative: u.narrative,
        submittedBy: userRef(u.submitted_by_user_id), submittedAt: u.submitted_at,
        reviewStatus: u.review_status,
        reviewedBy: u.reviewed_by_user_id ? userRef(u.reviewed_by_user_id) : null,
        reviewedAt: u.reviewed_at || null, reviewComment: u.review_comment || ''
      };
    });
  };

  DTO.customer = function (c) {
    return {
      customerId: c.customer_id, customerCode: c.customer_code, name: c.name, type: c.type, phone: c.phone,
      status: c.status, companyRepresentative: c.company_representative || '',
      archived: !!c.archived_at, createdAt: c.created_at, updatedAt: c.updated_at
    };
  };

  DTO.user = function (u, roles) {
    var r = roles ? roles[u.role_id] : null;
    return {
      userId: u.user_id, email: u.email, employeeCode: u.employee_code, fullName: u.full_name,
      roleId: u.role_id, roleCode: r ? r.code : '', orgUnit: u.org_unit, status: u.status,
      createdAt: u.created_at, updatedAt: u.updated_at
    };
  };

  Q.Core = {
    /** Những người cần được thông báo khi có tiến độ chờ duyệt: KSV cùng đơn vị (nếu không có thì mọi KSV) + Admin. */
    reviewersFor: function (submitter) {
      var S = Q.Store, roleByCode = {};
      S.all('Roles').forEach(function (r) { roleByCode[r.code] = r.role_id; });
      var active = S.all('Users').filter(function (u) { return u.status === 'active' && u.user_id !== submitter.user_id; });
      var ksv = active.filter(function (u) { return u.role_id === roleByCode.KSV; });
      var sameUnit = ksv.filter(function (u) { return u.org_unit === submitter.org_unit; });
      var admins = active.filter(function (u) { return u.role_id === roleByCode.Admin; });
      return (sameUnit.length ? sameUnit : ksv).concat(admins);
    },
    activeAssignments: function (taskId) {
      return Q.Store.findBy('TaskAssignees', 'task_id', taskId).filter(function (a) { return a.active; });
    },
    /** Người dùng CBTD đang hoạt động hợp lệ để phân công. */
    assigneeOrFail: function (userId, field) {
      var u = Q.Store.find('Users', userId);
      var role = u && Q.Store.find('Roles', u.role_id);
      if (!u || u.status !== 'active' || !role || role.code !== 'CBTD') {
        U.invalid(field, 'Người được giao phải là cán bộ tín dụng (CBTD) đang hoạt động.');
      }
      return u;
    },
    addAssignment: function (ctx, task, user, role) {
      var a = Q.Store.insert('TaskAssignees', {
        assignment_id: Q.Store.nextId('TaskAssignees'), task_id: task.task_id, user_id: user.user_id,
        assignee_email_snapshot: user.email, assignment_role: role, assigned_at: U.isoNow(), active: true
      });
      Q.Audit.log(ctx, 'task.assign', 'TaskAssignee', a.assignment_id, 'evt-task.assign-' + a.assignment_id);
      if (user.user_id !== ctx.user.user_id) {
        Q.Notify.send(user.user_id, 'task_assigned', a.assignment_id, 'Bạn được giao công việc ' + task.task_code + ': ' + task.title);
      }
      return a;
    },
    deactivate: function (a) { return Q.Store.update('TaskAssignees', a.assignment_id, { active: false }); }
  };
})(QLCV);

/* ---- 40_Svc_Tasks.js ---- */
/** Công việc & phân công (R5, R6, R17). Mọi thao tác ghi đều idempotent theo requestId. */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, S = function () { return Q.Store; };
  var L = Q.Config.LIMITS, E = Q.Enums;

  function openOrFail(task) {
    if (task.status === 'completed') U.fail('CONFLICT', 'Công việc đã hoàn thành, không thể thay đổi.');
    if (task.archived_at) U.fail('CONFLICT', 'Công việc đã được lưu trữ.');
  }

  function dtoOf(ctx, taskId) { return Q.DTO.tasks(ctx, [S().find('Tasks', taskId)])[0]; }

  var T = Q.TaskService = {};

  T.list = function (ctx, p) {
    P.require(ctx, 'task.view');
    p = p || {};
    var today = U.today(), tasks = P.visibleTasks(ctx);
    if (!U.bool(p.includeArchived)) tasks = tasks.filter(function (t) { return !t.archived_at; });
    if (p.status) tasks = tasks.filter(function (t) { return t.status === p.status; });
    if (p.priority) tasks = tasks.filter(function (t) { return t.priority === p.priority; });
    if (p.customerId) tasks = tasks.filter(function (t) { return t.customer_id === p.customerId; });
    if (U.bool(p.overdue)) tasks = tasks.filter(function (t) { return Q.Rules.isLate(t, today); });
    if (U.bool(p.mine)) { var mine = P.assignedTaskIds(ctx.user.user_id); tasks = tasks.filter(function (t) { return mine[t.task_id]; }); }
    if (p.assigneeUserId) { var theirs = P.assignedTaskIds(p.assigneeUserId); tasks = tasks.filter(function (t) { return theirs[t.task_id]; }); }

    var dtos = Q.DTO.tasks(ctx, tasks);
    if (p.q) {
      var q = U.norm(String(p.q).slice(0, 100));
      dtos = dtos.filter(function (d) { return U.norm(d.title + ' ' + d.taskCode + ' ' + (d.customer ? d.customer.name : '')).indexOf(q) >= 0; });
    }
    var rank = { high: 0, normal: 1, low: 2 }, dir = p.dir === 'desc' ? 'desc' : 'asc';
    var keyFns = {
      dueAt: function (d) { return d.dueAt + d.taskCode; },
      createdAt: function (d) { return d.createdAt + d.taskCode; },
      updatedAt: function (d) { return d.updatedAt + d.taskCode; },
      priority: function (d) { return rank[d.priority] + d.dueAt; }
    };
    var by = keyFns[p.sortBy] ? p.sortBy : 'dueAt';
    if (!p.sortBy) dir = 'asc';
    return U.paginate(U.sortBy(dtos, keyFns[by], dir), p);
  };

  T.get = function (ctx, p) {
    P.require(ctx, 'task.view');
    var t = P.taskOrFail(ctx, p && p.taskId);
    var updates = S().findBy('TaskUpdates', 'task_id', t.task_id);
    var history = S().findBy('TaskAssignees', 'task_id', t.task_id).map(function (a) {
      var u = S().find('Users', a.user_id);
      return { assignmentId: a.assignment_id, userId: a.user_id, name: u ? u.full_name : a.assignee_email_snapshot,
        role: a.assignment_role, assignedAt: a.assigned_at, active: a.active };
    });
    var me = ctx.user.user_id;
    var mineActive = history.some(function (h) { return h.userId === me && h.active; });
    var open = t.status !== 'completed' && !t.archived_at;
    return {
      task: Q.DTO.tasks(ctx, [t])[0],
      updates: Q.DTO.updates(U.sortBy(updates, function (u) { return u.submitted_at + u.update_id; }, 'desc')),
      assignments: history,
      can: {
        start: open && t.status === 'not_started' && P.has(ctx, 'task.start') && (!P.isScoped(ctx) || mineActive),
        submitProgress: open && P.has(ctx, 'progress.submit') && (!P.isScoped(ctx) || mineActive),
        edit: open && P.has(ctx, 'task.update'),
        transfer: open && P.has(ctx, 'task.transfer'),
        archive: !t.archived_at && P.has(ctx, 'task.update'),
        review: P.has(ctx, 'progress.review')
      }
    };
  };

  T.create = function (ctx, p, meta) {
    P.require(ctx, 'task.create');
    var key = 'evt-task.create-' + meta.requestId;
    var existing = Q.Audit.find(key);
    if (existing) return { task: dtoOf(ctx, existing.entity_id), replayed: true };

    var title = U.str(p.title, { field: 'title', label: 'Tiêu đề', required: true, max: L.title });
    var description = U.str(p.description, { field: 'description', label: 'Mô tả', max: L.description });
    var priority = U.oneOf(p.priority, E.priority, { field: 'priority', label: 'Mức ưu tiên', def: 'normal' });
    var dueAt = U.ymd(p.dueAt, { field: 'dueAt', label: 'Hạn xử lý', required: true });
    if (dueAt < U.today()) U.invalid('dueAt', 'Hạn xử lý không được nằm trong quá khứ.');

    var customer = S().find('Customers', p.customerId);
    if (!customer || customer.archived_at) U.invalid('customerId', 'Khách hàng không tồn tại hoặc đã lưu trữ.');
    if (P.isScoped(ctx) && !p.primaryUserId) p.primaryUserId = ctx.user.user_id;
    if (!p.primaryUserId) U.invalid('primaryUserId', 'Cần chọn cán bộ phụ trách chính.');
    // R6: CBTD chỉ được tạo công việc khi chính mình là người phụ trách chính.
    if (P.isScoped(ctx) && p.primaryUserId !== ctx.user.user_id) {
      U.fail('FORBIDDEN', 'CBTD chỉ được tạo công việc do chính mình phụ trách chính.');
    }
    var primary = Q.Core.assigneeOrFail(p.primaryUserId, 'primaryUserId');
    var collab = null;
    if (p.collaboratorUserId) {
      if (p.collaboratorUserId === p.primaryUserId) U.invalid('collaboratorUserId', 'Người phối hợp phải khác người phụ trách chính.');
      collab = Q.Core.assigneeOrFail(p.collaboratorUserId, 'collaboratorUserId');
    }

    var id = S().nextId('Tasks'), now = U.isoNow();
    var task = S().insert('Tasks', {
      task_id: id, task_code: 'CV-' + U.pad(parseInt(id.split('-')[1], 10), 4), customer_id: customer.customer_id,
      title: title, description: description, status: 'not_started', priority: priority, due_at: dueAt,
      created_by_user_id: ctx.user.user_id, completed_at: '', created_at: now, updated_at: now, archived_at: ''
    });
    Q.Audit.log(ctx, 'task.create', 'Task', task.task_id, key);
    Q.Core.addAssignment(ctx, task, primary, 'primary');
    if (collab) Q.Core.addAssignment(ctx, task, collab, 'collaborator');
    return { task: dtoOf(ctx, task.task_id), replayed: false };
  };

  T.update = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    var patch = {}, changed = [];
    if (p.title !== undefined) { patch.title = U.str(p.title, { field: 'title', label: 'Tiêu đề', required: true, max: L.title }); changed.push('title'); }
    if (p.description !== undefined) { patch.description = U.str(p.description, { field: 'description', label: 'Mô tả', max: L.description }); changed.push('description'); }
    if (p.priority !== undefined) { patch.priority = U.oneOf(p.priority, E.priority, { field: 'priority', label: 'Mức ưu tiên', required: true }); changed.push('priority'); }
    if (p.dueAt !== undefined) { patch.due_at = U.ymd(p.dueAt, { field: 'dueAt', label: 'Hạn xử lý', required: true }); changed.push('dueAt'); }
    if (p.status !== undefined) {
      if (p.status === 'completed') U.invalid('status', 'Trạng thái "Đã hoàn thành" chỉ được đặt khi duyệt tiến độ 100%.');
      patch.status = U.oneOf(p.status, E.manualTaskStatus, { field: 'status', label: 'Trạng thái', required: true });
      changed.push('status');
    }
    if (!changed.length) U.invalid(null, 'Không có thay đổi nào để lưu.');
    patch.updated_at = U.isoNow();
    S().update('Tasks', task.task_id, patch);
    Q.Audit.log(ctx, 'task.update', 'Task', task.task_id, 'evt-task.update-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  T.start = function (ctx, p, meta) {
    P.require(ctx, 'task.start');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    if (P.isScoped(ctx) && !P.isAssignee(ctx, task.task_id)) U.fail('FORBIDDEN', 'Bạn không được giao công việc này.');
    if (task.status !== 'not_started') U.fail('CONFLICT', 'Công việc đã được bắt đầu.');
    S().update('Tasks', task.task_id, { status: 'in_progress', updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.start', 'Task', task.task_id, 'evt-task.start-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  /** R17: chuyển giao người thực hiện chính. */
  T.transfer = function (ctx, p, meta) {
    P.require(ctx, 'task.transfer');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    var next = Q.Core.assigneeOrFail(p.newPrimaryUserId, 'newPrimaryUserId');
    var active = Q.Core.activeAssignments(task.task_id);
    var cur = active.filter(function (a) { return a.assignment_role === 'primary'; })[0];
    if (cur && cur.user_id === next.user_id) U.invalid('newPrimaryUserId', 'Người này đang là người phụ trách chính.');
    var key = 'evt-task.transfer-' + meta.requestId;
    if (Q.Audit.has(key)) return { task: dtoOf(ctx, task.task_id), replayed: true };

    active.forEach(function (a) {
      // Người nhận việc đang là người phối hợp thì thôi phối hợp để không trùng vai.
      if (a.assignment_role === 'primary' || a.user_id === next.user_id) Q.Core.deactivate(a);
    });
    Q.Core.addAssignment(ctx, task, next, 'primary');
    S().update('Tasks', task.task_id, { updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.transfer', 'Task', task.task_id, key);
    return { task: dtoOf(ctx, task.task_id), replayed: false };
  };

  T.setCollaborator = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    openOrFail(task);
    var active = Q.Core.activeAssignments(task.task_id);
    var primary = active.filter(function (a) { return a.assignment_role === 'primary'; })[0];
    var oldC = active.filter(function (a) { return a.assignment_role === 'collaborator'; })[0];
    var next = null;
    if (p.userId) {
      next = Q.Core.assigneeOrFail(p.userId, 'userId');
      if (primary && primary.user_id === next.user_id) U.invalid('userId', 'Người phối hợp phải khác người phụ trách chính.');
      if (oldC && oldC.user_id === next.user_id) return { task: dtoOf(ctx, task.task_id) };
    }
    if (oldC) Q.Core.deactivate(oldC);
    if (next) Q.Core.addAssignment(ctx, task, next, 'collaborator');
    S().update('Tasks', task.task_id, { updated_at: U.isoNow() });
    Q.Audit.log(ctx, 'task.update', 'Task', task.task_id, 'evt-task.collab-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };

  /** Lưu trữ / khôi phục (không xóa cứng vì lịch sử còn tham chiếu). */
  T.archive = function (ctx, p, meta) {
    P.require(ctx, 'task.update');
    var task = P.taskOrFail(ctx, p.taskId);
    var archive = p.archived === undefined ? true : U.bool(p.archived);
    if (archive === !!task.archived_at) return { task: dtoOf(ctx, task.task_id) };
    S().update('Tasks', task.task_id, { archived_at: archive ? U.isoNow() : '', updated_at: U.isoNow() });
    Q.Audit.log(ctx, archive ? 'task.archive' : 'task.restore', 'Task', task.task_id, 'evt-task.archive-' + meta.requestId);
    return { task: dtoOf(ctx, task.task_id) };
  };
})(QLCV);

/* ---- 41_Svc_Progress.js ---- */
/**
 * Tiến độ & phê duyệt (R7, R8).
 * - TaskUpdates chỉ ghi thêm; chỉ các cột duyệt được đổi (Store chặn sửa cột khác).
 * - Duyệt 100% -> tự động hoàn thành công việc (R8). Hoàn thành là trạng thái cuối (mặc định của plan).
 * - Người duyệt không được trùng người gửi (tách người lập – người duyệt).
 * - Side-effect của duyệt được làm lại an toàn khi retry/ sự cố giữa chừng (ensureReviewEffects idempotent).
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, L = Q.Config.LIMITS;
  function S() { return Q.Store; }

  var G = Q.ProgressService = {};

  G.submit = function (ctx, p, meta) {
    P.require(ctx, 'progress.submit');
    var key = 'evt-progress.submit-' + meta.requestId;
    var dup = Q.Audit.find(key);
    if (dup) return { update: Q.DTO.updates([S().find('TaskUpdates', dup.entity_id)])[0], replayed: true };

    var task = P.taskOrFail(ctx, p.taskId);
    if (task.archived_at) U.fail('CONFLICT', 'Công việc đã được lưu trữ.');
    if (task.status === 'completed') U.fail('CONFLICT', 'Công việc đã hoàn thành, không nhận thêm tiến độ.');
    if (P.isScoped(ctx) && !P.isAssignee(ctx, task.task_id)) U.fail('FORBIDDEN', 'Bạn không được giao công việc này.');

    var pct = U.pct(p.progressPct, { field: 'progressPct' });
    var narrative = U.str(p.narrative, { field: 'narrative', label: 'Nội dung diễn giải', required: true, min: 5, max: L.narrative });

    var u = S().insert('TaskUpdates', {
      update_id: S().nextId('TaskUpdates'), task_id: task.task_id, progress_pct: pct, narrative: narrative,
      submitted_by_user_id: ctx.user.user_id, submitted_by_email_snapshot: ctx.user.email, submitted_at: U.isoNow(),
      review_status: 'pending', reviewed_by_user_id: '', reviewed_by_email_snapshot: '', reviewed_at: '', review_comment: ''
    });
    Q.Audit.log(ctx, 'progress.submit', 'TaskUpdate', u.update_id, key);
    Q.Core.reviewersFor(ctx.user).forEach(function (r) {
      Q.Notify.send(r.user_id, 'progress_submitted', u.update_id,
        'Có cập nhật tiến độ mới cần duyệt cho ' + task.task_code + ' (' + pct + '%)');
    });
    return { update: Q.DTO.updates([u])[0], replayed: false };
  };

  /** Làm (hoặc làm lại) mọi hệ quả của một lần duyệt; mỗi bước đều idempotent theo khóa sự kiện. */
  function ensureReviewEffects(ctx, upd) {
    var task = S().find('Tasks', upd.task_id);
    var approved = upd.review_status === 'approved';
    Q.Audit.log(ctx, approved ? 'progress.approve' : 'progress.reject', 'TaskUpdate', upd.update_id, 'evt-review-' + upd.update_id);
    Q.Notify.send(upd.submitted_by_user_id, approved ? 'progress_approved' : 'progress_rejected', upd.update_id,
      approved ? 'Cập nhật tiến độ của bạn cho ' + task.task_code + ' đã được duyệt.'
        : 'Cập nhật tiến độ cho ' + task.task_code + ' bị từ chối. Vui lòng kiểm tra lý do trong ứng dụng và gửi lại.');

    if (approved && upd.progress_pct === 100 && task.status !== 'completed') {
      var now = U.isoNow();
      S().update('Tasks', task.task_id, { status: 'completed', completed_at: now, updated_at: now });
      Q.Audit.log(ctx, 'task.auto_complete', 'Task', task.task_id, 'evt-autocomplete-' + task.task_id);
      var ids = {};
      Q.Core.activeAssignments(task.task_id).forEach(function (a) { ids[a.user_id] = true; });
      ids[upd.submitted_by_user_id] = true;
      delete ids[ctx.user.user_id];
      Object.keys(ids).forEach(function (uid) {
        Q.Notify.send(uid, 'task_completed', task.task_id, 'Công việc ' + task.task_code + ' đã hoàn thành 100%.');
      });
    }
  }
  G._ensureReviewEffects = ensureReviewEffects;

  G.review = function (ctx, p) {
    P.require(ctx, 'progress.review');
    var decision = U.oneOf(p.decision, ['approve', 'reject'], { field: 'decision', label: 'Quyết định', required: true });
    var comment = U.str(p.comment, { field: 'comment', label: 'Lý do', max: L.comment, required: decision === 'reject', min: decision === 'reject' ? 3 : 0 });
    var upd = S().find('TaskUpdates', p.updateId);
    if (!upd) U.fail('NOT_FOUND', 'Không tìm thấy báo cáo tiến độ.');
    if (upd.submitted_by_user_id === ctx.user.user_id) {
      U.fail('FORBIDDEN', 'Không thể tự duyệt báo cáo do chính mình gửi.', { reason: 'SELF_REVIEW' });
    }
    var want = decision === 'approve' ? 'approved' : 'rejected';

    if (upd.review_status !== 'pending') {
      // Gửi lại cùng quyết định bởi cùng người duyệt: coi như retry, vá nốt hệ quả nếu còn thiếu.
      if (upd.review_status === want && upd.reviewed_by_user_id === ctx.user.user_id) {
        ensureReviewEffects(ctx, upd);
        return { update: Q.DTO.updates([S().find('TaskUpdates', upd.update_id)])[0], task: Q.DTO.tasks(ctx, [S().find('Tasks', upd.task_id)])[0], replayed: true };
      }
      U.fail('CONFLICT', 'Báo cáo này đã được xử lý trước đó.');
    }
    var done = S().update('TaskUpdates', upd.update_id, {
      review_status: want, reviewed_by_user_id: ctx.user.user_id, reviewed_by_email_snapshot: ctx.user.email,
      reviewed_at: U.isoNow(), review_comment: comment
    });
    ensureReviewEffects(ctx, done);
    return { update: Q.DTO.updates([S().find('TaskUpdates', upd.update_id)])[0], task: Q.DTO.tasks(ctx, [S().find('Tasks', upd.task_id)])[0], replayed: false };
  };

  /** Hàng đợi duyệt: báo cáo đang chờ, cũ nhất trước. */
  G.pending = function (ctx, p) {
    P.require(ctx, 'progress.review');
    var list = S().where('TaskUpdates', function (u) { return u.review_status === 'pending'; });
    var tasks = {};
    S().all('Tasks').forEach(function (t) { tasks[t.task_id] = t; });
    var items = Q.DTO.updates(U.sortBy(list, function (u) { return u.submitted_at + u.update_id; }, 'asc')).map(function (d) {
      var t = tasks[d.taskId];
      d.task = t ? { taskId: t.task_id, taskCode: t.task_code, title: t.title, dueAt: t.due_at } : null;
      d.ownSubmission = d.submittedBy.userId === ctx.user.user_id;
      return d;
    });
    return U.paginate(items, p);
  };
})(QLCV);

/* ---- 42_Svc_Customers.js ---- */
/**
 * Khách hàng (R9, R17). Không có dư nợ / nhóm nợ / thông tin tín dụng (R9, R13).
 * Trường "Người đại diện công ty" chỉ có ở khách hàng doanh nghiệp (R17). Xóa = lưu trữ (xóa mềm).
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, L = Q.Config.LIMITS, E = Q.Enums;
  function S() { return Q.Store; }

  function fields(p, partial) {
    var out = {};
    function has(k) { return p[k] !== undefined; }
    if (!partial || has('name')) out.name = U.str(p.name, { field: 'name', label: 'Tên khách hàng', required: true, max: L.name });
    if (!partial || has('type')) out.type = U.oneOf(p.type, E.customerType, { field: 'type', label: 'Loại khách hàng', required: true });
    if (!partial || has('phone')) out.phone = U.str(p.phone, { field: 'phone', label: 'Số điện thoại', required: true, max: L.phone, pattern: /^[0-9+\s().-]{8,20}$/ });
    if (!partial || has('status')) out.status = U.oneOf(p.status, E.customerStatus, { field: 'status', label: 'Nhóm khách hàng', def: 'new' });
    if (has('companyRepresentative')) out.company_representative = U.str(p.companyRepresentative, { field: 'companyRepresentative', label: 'Người đại diện', max: L.name });
    return out;
  }

  var C = Q.CustomerService = {};

  C.list = function (ctx, p) {
    P.require(ctx, 'customer.view');
    p = p || {};
    var rows = P.visibleCustomers(ctx);
    if (!U.bool(p.includeArchived)) rows = rows.filter(function (c) { return !c.archived_at; });
    if (p.type) rows = rows.filter(function (c) { return c.type === p.type; });
    if (p.status) rows = rows.filter(function (c) { return c.status === p.status; });
    if (p.q) {
      var q = U.norm(String(p.q).slice(0, 100));
      rows = rows.filter(function (c) { return U.norm(c.name + ' ' + c.customer_code + ' ' + c.phone).indexOf(q) >= 0; });
    }
    rows = U.sortBy(rows, function (c) { return U.norm(c.name); }, 'asc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(Q.DTO.customer);
    return page;
  };

  C.get = function (ctx, p) {
    P.require(ctx, 'customer.view');
    var c = P.customerOrFail(ctx, p && p.customerId);
    var tasks = P.visibleTasks(ctx).filter(function (t) { return t.customer_id === c.customer_id && !t.archived_at; });
    return { customer: Q.DTO.customer(c), tasks: Q.DTO.tasks(ctx, tasks) };
  };

  C.create = function (ctx, p, meta) {
    P.require(ctx, 'customer.maintain');
    var key = 'evt-customer.create-' + meta.requestId;
    var dup = Q.Audit.find(key);
    if (dup) return { customer: Q.DTO.customer(S().find('Customers', dup.entity_id)), replayed: true };

    var f = fields(p, false);
    if (f.type === 'personal' && f.company_representative) U.invalid('companyRepresentative', 'Chỉ khách hàng doanh nghiệp mới có người đại diện công ty.');
    var id = S().nextId('Customers'), code;
    if (p.customerCode) {
      code = U.str(p.customerCode, { field: 'customerCode', label: 'Mã khách hàng', max: 30, pattern: /^[A-Za-z0-9_-]{3,30}$/ });
    } else {
      code = 'KH-' + U.pad(parseInt(id.split('-')[1], 10), 4);
    }
    if (S().findBy('Customers', 'customer_code', code).length) U.invalid('customerCode', 'Mã khách hàng đã tồn tại.');
    var now = U.isoNow();
    var c = S().insert('Customers', {
      customer_id: id, customer_code: code, name: f.name, type: f.type, phone: f.phone, status: f.status,
      created_at: now, updated_at: now, company_representative: f.company_representative || '', archived_at: ''
    });
    Q.Audit.log(ctx, 'customer.create', 'Customer', c.customer_id, key);
    return { customer: Q.DTO.customer(c), replayed: false };
  };

  C.update = function (ctx, p, meta) {
    P.require(ctx, 'customer.maintain');
    var c = S().find('Customers', p.customerId);
    if (!c) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    if (c.archived_at) U.fail('CONFLICT', 'Khách hàng đã được lưu trữ.');
    var f = fields(p, true);
    var type = f.type || c.type;
    if (type === 'personal') {
      if (f.company_representative) U.invalid('companyRepresentative', 'Chỉ khách hàng doanh nghiệp mới có người đại diện công ty.');
      if (f.type === 'personal') f.company_representative = '';   // đổi sang cá nhân thì xóa trường đại diện
    }
    if (!Object.keys(f).length) U.invalid(null, 'Không có thay đổi nào để lưu.');
    f.updated_at = U.isoNow();
    var up = S().update('Customers', c.customer_id, f);
    Q.Audit.log(ctx, 'customer.update', 'Customer', c.customer_id, 'evt-customer.update-' + meta.requestId);
    return { customer: Q.DTO.customer(up) };
  };

  C.archive = function (ctx, p, meta) {
    P.require(ctx, 'customer.delete');
    var c = S().find('Customers', p.customerId);
    if (!c) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    var open = S().findBy('Tasks', 'customer_id', c.customer_id).filter(function (t) { return t.status !== 'completed' && !t.archived_at; });
    var archive = p.archived === undefined ? true : U.bool(p.archived);
    if (archive && open.length) U.fail('CONFLICT', 'Khách hàng còn ' + open.length + ' công việc chưa hoàn thành, không thể lưu trữ.');
    if (archive === !!c.archived_at) return { customer: Q.DTO.customer(c) };
    var up = S().update('Customers', c.customer_id, { archived_at: archive ? U.isoNow() : '', updated_at: U.isoNow() });
    Q.Audit.log(ctx, archive ? 'customer.archive' : 'customer.restore', 'Customer', c.customer_id, 'evt-customer.archive-' + meta.requestId);
    return { customer: Q.DTO.customer(up) };
  };
})(QLCV);

/* ---- 43_Svc_Admin.js ---- */
/**
 * Quản trị (R12, R16): người dùng, nhật ký kiểm toán, kiểm tra toàn vẹn, sao lưu.
 * Xóa người dùng KHÔNG được phép (giữ lịch sử); chỉ vô hiệu hóa. Restore bị khóa cho tới khi qua kiểm thử U7.
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, L = Q.Config.LIMITS, E = Q.Enums;
  function S() { return Q.Store; }

  function roleMap() { var m = {}; S().all('Roles').forEach(function (r) { m[r.role_id] = r; }); return m; }
  function roleIdByCode(code) {
    var r = S().findBy('Roles', 'code', code)[0];
    return r ? r.role_id : null;
  }
  function activeAdmins() {
    var id = roleIdByCode('Admin');
    return S().all('Users').filter(function (u) { return u.role_id === id && u.status === 'active'; });
  }

  /** Đếm người dùng hoạt động theo vai trò trên TOÀN BỘ bảng (không phụ thuộc trang đang xem). */
  function userCounts(users, roles) {
    var c = { active: 0, byRole: {} };
    users.forEach(function (u) {
      if (u.status !== 'active') return;
      c.active++;
      var r = roles[u.role_id];
      if (r) c.byRole[r.code] = (c.byRole[r.code] || 0) + 1;
    });
    return c;
  }

  var A = Q.AdminService = {};

  /* ---------- Người dùng ---------- */
  A.userList = function (ctx, p) {
    P.require(ctx, 'user.manage');
    p = p || {};
    var roles = roleMap(), rows = S().all('Users');
    if (p.status) rows = rows.filter(function (u) { return u.status === p.status; });
    if (p.roleCode) rows = rows.filter(function (u) { return roles[u.role_id] && roles[u.role_id].code === p.roleCode; });
    if (p.q) { var q = U.norm(String(p.q).slice(0, 100)); rows = rows.filter(function (u) { return U.norm(u.full_name + ' ' + u.email + ' ' + u.employee_code).indexOf(q) >= 0; }); }
    rows = U.sortBy(rows, function (u) { return u.user_id; }, 'asc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (u) { return Q.DTO.user(u, roles); });
    page.roles = Object.keys(roles).map(function (k) { return { roleId: roles[k].role_id, code: roles[k].code, name: roles[k].name }; });
    page.counts = userCounts(S().all('Users'), roles);
    return page;
  };

  /** Danh sách chọn người thực hiện: người có quyền giao việc thấy mọi CBTD; CBTD chỉ thấy chính mình (R6). */
  A.userOptions = function (ctx) {
    var cbtdId = roleIdByCode('CBTD');
    var list = P.isScoped(ctx)
      ? [ctx.user]
      : S().all('Users').filter(function (u) { return u.role_id === cbtdId && u.status === 'active'; });
    if (!P.isScoped(ctx) && !(P.has(ctx, 'task.create') || P.has(ctx, 'task.transfer') || P.has(ctx, 'task.update'))) {
      U.fail('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    }
    return { items: list.map(function (u) { return { userId: u.user_id, fullName: u.full_name, orgUnit: u.org_unit, employeeCode: u.employee_code }; }) };
  };

  A.userCreate = function (ctx, p, meta) {
    P.require(ctx, 'user.manage');
    var key = 'evt-user.create-' + meta.requestId;
    var dup = Q.Audit.find(key);
    if (dup) return { user: Q.DTO.user(S().find('Users', dup.entity_id), roleMap()), replayed: true };

    var email = U.email(p.email, { field: 'email' });
    var code = U.str(p.employeeCode, { field: 'employeeCode', label: 'Mã cán bộ', required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/ });
    var name = U.str(p.fullName, { field: 'fullName', label: 'Họ tên', required: true, max: L.name });
    var org = U.str(p.orgUnit, { field: 'orgUnit', label: 'Đơn vị', required: true, max: L.org });
    var role = S().find('Roles', p.roleId);
    if (!role) U.invalid('roleId', 'Vai trò không hợp lệ.');
    if (S().findBy('Users', 'email', email).length) U.invalid('email', 'Email đã tồn tại.');
    if (S().findBy('Users', 'employee_code', code).length) U.invalid('employeeCode', 'Mã cán bộ đã tồn tại.');
    var now = U.isoNow();
    var u = S().insert('Users', {
      user_id: S().nextId('Users'), email: email, employee_code: code, full_name: name, role_id: role.role_id,
      org_unit: org, status: 'active', created_at: now, updated_at: now
    });
    Q.Audit.log(ctx, 'user.create', 'User', u.user_id, key);
    return { user: Q.DTO.user(u, roleMap()), replayed: false };
  };

  A.userUpdate = function (ctx, p, meta) {
    P.require(ctx, 'user.manage');
    var u = S().find('Users', p.userId);
    if (!u) U.fail('NOT_FOUND', 'Không tìm thấy người dùng.');
    var patch = {};
    if (p.fullName !== undefined) patch.full_name = U.str(p.fullName, { field: 'fullName', label: 'Họ tên', required: true, max: L.name });
    if (p.orgUnit !== undefined) patch.org_unit = U.str(p.orgUnit, { field: 'orgUnit', label: 'Đơn vị', required: true, max: L.org });
    if (p.employeeCode !== undefined) {
      patch.employee_code = U.str(p.employeeCode, { field: 'employeeCode', label: 'Mã cán bộ', required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/ });
      var same = S().findBy('Users', 'employee_code', patch.employee_code).filter(function (x) { return x.user_id !== u.user_id; });
      if (same.length) U.invalid('employeeCode', 'Mã cán bộ đã tồn tại.');
    }
    if (p.roleId !== undefined) { if (!S().find('Roles', p.roleId)) U.invalid('roleId', 'Vai trò không hợp lệ.'); patch.role_id = p.roleId; }
    if (p.status !== undefined) patch.status = U.oneOf(p.status, E.userStatus, { field: 'status', label: 'Trạng thái', required: true });
    if (!Object.keys(patch).length) U.invalid(null, 'Không có thay đổi nào để lưu.');

    // Chống tự khóa: không hạ quyền/vô hiệu hóa chính mình, không bỏ Admin cuối cùng.
    var adminId = roleIdByCode('Admin');
    var losesAdmin = (patch.role_id && patch.role_id !== adminId && u.role_id === adminId) || (patch.status === 'inactive' && u.role_id === adminId);
    if (losesAdmin) {
      if (u.user_id === ctx.user.user_id) U.fail('CONFLICT', 'Không thể tự hạ quyền hoặc vô hiệu hóa tài khoản Admin của chính mình.');
      if (activeAdmins().length <= 1) U.fail('CONFLICT', 'Hệ thống phải còn ít nhất một Admin đang hoạt động.');
    }
    if (u.user_id === ctx.user.user_id && patch.status === 'inactive') U.fail('CONFLICT', 'Không thể tự vô hiệu hóa tài khoản của mình.');

    patch.updated_at = U.isoNow();
    var up = S().update('Users', u.user_id, patch);
    Q.Audit.log(ctx, 'user.update', 'User', u.user_id, 'evt-user.update-' + meta.requestId);
    return { user: Q.DTO.user(up, roleMap()) };
  };

  /* ---------- Nhật ký kiểm toán ---------- */
  A.auditList = function (ctx, p) {
    P.require(ctx, 'audit.view');
    p = p || {};
    var rows = S().all('AuditLogs');
    if (p.action) rows = rows.filter(function (a) { return a.action === p.action; });
    if (p.actorUserId) rows = rows.filter(function (a) { return a.actor_user_id === p.actorUserId; });
    if (p.entityId) rows = rows.filter(function (a) { return a.entity_id === p.entityId; });
    if (p.from) rows = rows.filter(function (a) { return a.created_at.slice(0, 10) >= p.from; });
    if (p.to) rows = rows.filter(function (a) { return a.created_at.slice(0, 10) <= p.to; });
    rows = U.sortBy(rows, function (a) { return a.created_at + a.audit_id; }, 'desc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (a) {
      return { auditId: a.audit_id, actorUserId: a.actor_user_id, actorEmail: a.actor_email_snapshot, action: a.action,
        entityType: a.entity_type, entityId: a.entity_id, createdAt: a.created_at };
    });
    return page;
  };

  /* ---------- Kiểm tra toàn vẹn (cùng bộ quy tắc với tools/appsheet/check-integrity.js) ---------- */
  A.integrity = function (ctx, p) {
    P.require(ctx, 'user.manage');
    var issues = [];
    function bad(t, id, msg) { issues.push({ table: t, id: id, message: msg }); }

    Q.Schema.names.forEach(function (t) {
      var def = Q.Schema.tables[t];
      if (def.pk) {
        var seen = {};
        S().all(t).forEach(function (r) { if (seen[r[def.pk]]) bad(t, r[def.pk], 'Khóa chính trùng'); seen[r[def.pk]] = 1; });
      }
    });
    function uniq(t, col) {
      var seen = {};
      S().all(t).forEach(function (r) { var v = String(r[col]); if (seen[v]) bad(t, r[Q.Schema.tables[t].pk], col + ' trùng: ' + v); seen[v] = 1; });
    }
    uniq('Users', 'email'); uniq('Users', 'employee_code'); uniq('Customers', 'customer_code'); uniq('Tasks', 'task_code');
    uniq('Notifications', 'request_or_event_key'); uniq('AuditLogs', 'request_or_event_key');

    function ref(t, col, pt) {
      S().all(t).forEach(function (r) {
        var v = r[col];
        if (v && !S().find(pt, v)) bad(t, r[Q.Schema.tables[t].pk] || '-', col + ' trỏ tới ' + pt + ' không tồn tại: ' + v);
      });
    }
    ref('Users', 'role_id', 'Roles'); ref('Tasks', 'customer_id', 'Customers'); ref('Tasks', 'created_by_user_id', 'Users');
    ref('TaskAssignees', 'task_id', 'Tasks'); ref('TaskAssignees', 'user_id', 'Users');
    ref('TaskUpdates', 'task_id', 'Tasks'); ref('TaskUpdates', 'submitted_by_user_id', 'Users'); ref('TaskUpdates', 'reviewed_by_user_id', 'Users');
    ref('Notifications', 'recipient_user_id', 'Users'); ref('AuditLogs', 'actor_user_id', 'Users');

    S().all('Tasks').forEach(function (t) {
      var act = Q.Core.activeAssignments(t.task_id);
      var prim = act.filter(function (a) { return a.assignment_role === 'primary'; });
      var col = act.filter(function (a) { return a.assignment_role === 'collaborator'; });
      if (prim.length !== 1) bad('Tasks', t.task_id, 'Phải có đúng 1 người phụ trách chính đang hoạt động (hiện ' + prim.length + ')');
      if (col.length > 1) bad('Tasks', t.task_id, 'Có hơn 1 người phối hợp đang hoạt động');
      if (prim[0] && col[0] && prim[0].user_id === col[0].user_id) bad('Tasks', t.task_id, 'Người phụ trách chính trùng người phối hợp');
      if (t.status === 'completed' && !t.completed_at) bad('Tasks', t.task_id, 'Đã hoàn thành nhưng thiếu completed_at');
      if (t.status !== 'completed' && t.completed_at) bad('Tasks', t.task_id, 'Chưa hoàn thành nhưng có completed_at');
    });
    S().all('TaskUpdates').forEach(function (u) {
      if (u.progress_pct === null || u.progress_pct < 0 || u.progress_pct > 100) bad('TaskUpdates', u.update_id, 'Tiến độ ngoài 0–100');
      if (u.review_status !== 'pending' && (!u.reviewed_by_user_id || !u.reviewed_at)) bad('TaskUpdates', u.update_id, 'Đã duyệt/từ chối nhưng thiếu người duyệt hoặc thời điểm');
      if (u.review_status === 'pending' && u.reviewed_by_user_id) bad('TaskUpdates', u.update_id, 'Đang chờ duyệt nhưng đã có người duyệt');
      if (u.review_status === 'rejected' && !u.review_comment) bad('TaskUpdates', u.update_id, 'Từ chối nhưng thiếu lý do');
      var t = S().find('Tasks', u.task_id);
      if (t && u.review_status === 'approved' && u.progress_pct === 100 && t.status !== 'completed') {
        bad('TaskUpdates', u.update_id, 'Đã duyệt 100% nhưng công việc chưa hoàn thành (có thể sửa bằng admin.reconcile)');
      }
    });
    return { ok: issues.length === 0, issueCount: issues.length, issues: issues.slice(0, 200), checkedAt: U.isoNow() };
  };

  /** Vá các hệ quả duyệt bị đứt giữa chừng (an toàn, idempotent). */
  A.reconcile = function (ctx) {
    P.require(ctx, 'user.manage');
    var fixed = [];
    S().all('TaskUpdates').forEach(function (u) {
      var t = S().find('Tasks', u.task_id);
      if (t && u.review_status === 'approved' && u.progress_pct === 100 && t.status !== 'completed') {
        Q.ProgressService._ensureReviewEffects(ctx, u);
        fixed.push(u.update_id);
      }
    });
    if (fixed.length) Q.Audit.log(ctx, 'admin.reconcile', 'System', 'reconcile', 'evt-reconcile-' + Q.Env.uuid());
    return { fixed: fixed };
  };

  /* ---------- Sao lưu (R16) ---------- */
  A.backup = function (ctx) {
    P.require(ctx, 'user.manage');
    if (Q.Env.runtime !== 'gas') return { enabled: false, message: 'Sao lưu chỉ khả dụng trên môi trường Google Workspace.' };
    var res = Q.Backup.run('manual');
    Q.Audit.log(ctx, 'admin.backup', 'System', res.fileId, 'evt-backup-' + Q.Env.uuid());
    return res;
  };

  A.restore = function (ctx) {
    P.require(ctx, 'user.manage');
    U.fail('NOT_ENABLED', 'Khôi phục dữ liệu bị khóa trên môi trường sản xuất cho tới khi hoàn tất kiểm thử U7. Hãy thực hiện theo operations-runbook.');
  };
})(QLCV);

/* ---- 44_Svc_Dashboard.js ---- */
/**
 * Bảng điều khiển (R10, R15) và thông báo trong ứng dụng (R11).
 * Mọi số liệu tính động trên đúng tập bản ghi người dùng được phép xem (R3) – không có bảng tổng hợp tĩnh.
 * Không có số liệu tín dụng (dư nợ, nhóm nợ).
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy;
  function S() { return Q.Store; }

  function unread(ctx) {
    return S().findBy('Notifications', 'recipient_user_id', ctx.user.user_id).filter(function (n) { return !n.read_at; }).length;
  }

  var D = Q.DashboardService = {};

  D.me = function (ctx) {
    var start = ctx.role === 'CBTD' ? 'tasks' : ctx.role === 'KSV' ? 'reviews' : ctx.role === 'Admin' ? 'admin' : 'dashboard';
    return {
      user: { userId: ctx.user.user_id, email: ctx.user.email, fullName: ctx.user.full_name,
        employeeCode: ctx.user.employee_code, orgUnit: ctx.user.org_unit },
      role: { code: ctx.role, name: ctx.roleName },
      permissions: Object.keys(ctx.perms).sort(),
      isDirector: ctx.isDirector,
      startView: start,
      unreadNotifications: unread(ctx),
      today: U.today(), serverTime: U.isoNow(), version: Q.Config.VERSION
    };
  };

  D.get = function (ctx) {
    P.require(ctx, 'dashboard.view');
    var today = U.today();
    var tasks = P.visibleTasks(ctx).filter(function (t) { return !t.archived_at; });
    var open = tasks.filter(function (t) { return t.status !== 'completed'; });
    function n(status) { return tasks.filter(function (t) { return t.status === status; }).length; }
    var overdue = open.filter(function (t) { return t.due_at < today; });   // hạn = hôm nay chưa tính quá hạn
    var kpis = {
      inProgress: n('in_progress'), notStarted: n('not_started'), completed: n('completed'),
      overdue: overdue.length, total: tasks.length,
      dueToday: open.filter(function (t) { return t.due_at === today; }).length,
      completionRate: tasks.length ? Math.round(n('completed') * 100 / tasks.length) : 0,
      customers: P.visibleCustomers(ctx).filter(function (c) { return !c.archived_at; }).length
    };
    var out = { kpis: kpis, today: today, byStatus: [
      { status: 'not_started', count: kpis.notStarted }, { status: 'in_progress', count: kpis.inProgress },
      { status: 'completed', count: kpis.completed }] };

    var visible = {};
    tasks.forEach(function (t) { visible[t.task_id] = true; });
    if (P.has(ctx, 'progress.review')) {
      var pend = S().where('TaskUpdates', function (u) { return u.review_status === 'pending'; });
      kpis.pendingReviews = pend.length;
    }
    if (!P.isScoped(ctx)) {
      var rows = {};
      S().all('TaskAssignees').forEach(function (a) {
        if (!a.active || a.assignment_role !== 'primary' || !visible[a.task_id]) return;
        var t = S().find('Tasks', a.task_id), u = S().find('Users', a.user_id);
        if (t.status === 'completed') return;
        var r = rows[a.user_id] = rows[a.user_id] || { userId: a.user_id, name: u ? u.full_name : a.user_id, open: 0, overdue: 0 };
        r.open++; if (t.due_at < today) r.overdue++;
      });
      out.byAssignee = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.open - a.open; });
    }
    var soon = U.sortBy(open, function (t) { return t.due_at + t.task_code; }, 'asc').slice(0, 5);
    out.upcoming = Q.DTO.tasks(ctx, soon);
    return out;
  };

  /** R15 – công việc ưu tiên cho Giám đốc: (ưu tiên cao HOẶC quá hạn) VÀ chưa hoàn thành. */
  D.director = function (ctx) {
    P.require(ctx, 'dashboard.view_director');
    var today = U.today();
    var rows = P.visibleTasks(ctx).filter(function (t) {
      return Q.Rules.isOpen(t) && (t.priority === 'high' || Q.Rules.isLate(t, today));
    });
    rows = U.sortBy(rows, function (t) { return (t.due_at < today ? '0' : '1') + t.due_at + t.task_code; }, 'asc');
    var dtos = Q.DTO.tasks(ctx, rows);
    return {
      today: today, total: dtos.length,
      highOpen: dtos.filter(function (d) { return d.priority === 'high'; }).length,
      overdue: dtos.filter(function (d) { return d.overdue; }).length,
      items: dtos
    };
  };

  /* ---------- Thông báo ---------- */
  var N = Q.NotificationService = {};

  N.list = function (ctx, p) {
    P.require(ctx, 'notification.view');
    p = p || {};
    var rows = S().findBy('Notifications', 'recipient_user_id', ctx.user.user_id);
    if (U.bool(p.unreadOnly)) rows = rows.filter(function (r) { return !r.read_at; });
    rows = U.sortBy(rows, function (r) { return r.created_at + r.notification_id; }, 'desc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(function (r) {
      return { notificationId: r.notification_id, eventType: r.event_type, sourceRecordId: r.source_record_id,
        message: r.message, createdAt: r.created_at, readAt: r.read_at || null };
    });
    page.unread = unread(ctx);
    return page;
  };

  N.count = function (ctx) { P.require(ctx, 'notification.view'); return { unread: unread(ctx) }; };

  N.markRead = function (ctx, p) {
    P.require(ctx, 'notification.view');
    var ids = Array.isArray(p.ids) ? p.ids.slice(0, 100) : [];
    var now = U.isoNow(), n = 0;
    ids.forEach(function (id) {
      var r = S().find('Notifications', id);
      // Chỉ chủ nhận mới đánh dấu được; id của người khác bị bỏ qua, không báo lỗi để không lộ sự tồn tại.
      if (r && r.recipient_user_id === ctx.user.user_id && !r.read_at) { S().update('Notifications', id, { read_at: now }); n++; }
    });
    return { updated: n, unread: unread(ctx) };
  };

  N.markAllRead = function (ctx) {
    P.require(ctx, 'notification.view');
    var now = U.isoNow(), n = 0;
    S().findBy('Notifications', 'recipient_user_id', ctx.user.user_id).forEach(function (r) {
      if (!r.read_at) { S().update('Notifications', r.notification_id, { read_at: now }); n++; }
    });
    return { updated: n, unread: 0 };
  };
})(QLCV);

/* ---- 90_Router.js ---- */
/**
 * Bộ định tuyến API. Một endpoint duy nhất:  POST  { action, idToken, params, requestId }
 * Trả về luôn dạng:  { ok:true, data, meta } | { ok:false, error:{ code, message, details }, meta }
 *
 * Giao thức cho trình duyệt: gửi Content-Type: text/plain (request "đơn giản" nên không cần preflight CORS –
 * Apps Script Web App không trả được header CORS cho OPTIONS). Token đặt trong body, KHÔNG đặt trên URL.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  // write=true: chạy trong khóa script + bắt buộc requestId để thử lại an toàn. auth=false: công khai.
  var ACTIONS = {
    'system.health': { auth: false, fn: function () { return { status: 'ok', app: Q.Config.APP, version: Q.Config.VERSION, runtime: Q.Env.runtime, time: U.isoNow() }; } },
    'auth.me': { fn: Q.DashboardService.me },

    'dashboard.get': { fn: Q.DashboardService.get },
    'dashboard.director': { fn: Q.DashboardService.director },

    'task.list': { fn: Q.TaskService.list },
    'task.get': { fn: Q.TaskService.get },
    'task.create': { write: true, fn: Q.TaskService.create },
    'task.update': { write: true, fn: Q.TaskService.update },
    'task.start': { write: true, fn: Q.TaskService.start },
    'task.transfer': { write: true, fn: Q.TaskService.transfer },
    'task.setCollaborator': { write: true, fn: Q.TaskService.setCollaborator },
    'task.archive': { write: true, fn: Q.TaskService.archive },

    'progress.submit': { write: true, fn: Q.ProgressService.submit },
    'progress.review': { write: true, fn: Q.ProgressService.review },
    'progress.pending': { fn: Q.ProgressService.pending },

    'customer.list': { fn: Q.CustomerService.list },
    'customer.get': { fn: Q.CustomerService.get },
    'customer.create': { write: true, fn: Q.CustomerService.create },
    'customer.update': { write: true, fn: Q.CustomerService.update },
    'customer.archive': { write: true, fn: Q.CustomerService.archive },

    'notification.list': { fn: Q.NotificationService.list },
    'notification.count': { fn: Q.NotificationService.count },
    'notification.markRead': { write: true, fn: Q.NotificationService.markRead },
    'notification.markAllRead': { write: true, fn: Q.NotificationService.markAllRead },

    'user.options': { fn: Q.AdminService.userOptions },
    'user.list': { fn: Q.AdminService.userList },
    'user.create': { write: true, fn: Q.AdminService.userCreate },
    'user.update': { write: true, fn: Q.AdminService.userUpdate },

    'audit.list': { fn: Q.AdminService.auditList },
    'admin.integrity': { fn: Q.AdminService.integrity },
    'admin.reconcile': { write: true, fn: Q.AdminService.reconcile },
    'admin.backup': { write: true, fn: Q.AdminService.backup },
    'admin.restore': { write: true, fn: Q.AdminService.restore }
  };

  var REQ_ID = /^[A-Za-z0-9_-]{8,64}$/;

  function throttle(email) {
    var Env = Q.Env, k = 'rl:' + Env.sha256(email) + ':' + Math.floor(Env.now().getTime() / 60000);
    var n = parseInt(Env.cacheGet(k) || '0', 10) + 1;
    if (n > Q.Config.RATE_LIMIT_PER_MIN) U.fail('TOO_MANY_REQUESTS', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.');
    Env.cachePut(k, String(n), 70);
  }

  /** Xử lý một request đã parse. Không bao giờ ném lỗi ra ngoài. */
  Q.handle = function (body) {
    var Env = Q.Env, t0 = Env.now().getTime(), meta = { version: Q.Config.VERSION }, action = null, who = null;
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) U.fail('VALIDATION', 'Yêu cầu không hợp lệ.');
      action = body.action;
      var def = typeof action === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
      if (!def) U.fail('NOT_FOUND', 'Hành động không tồn tại.');
      var params = body.params === undefined ? {} : body.params;
      if (!params || typeof params !== 'object' || Array.isArray(params)) U.fail('VALIDATION', 'Tham số không hợp lệ.');

      var requestId = body.requestId;
      if (requestId !== undefined && !REQ_ID.test(String(requestId))) U.fail('VALIDATION', 'requestId không hợp lệ.');
      if (def.write && !requestId) U.fail('VALIDATION', 'Thiếu requestId cho thao tác ghi.');
      meta.requestId = requestId || null;

      Q.Store.reset();
      var ctx = null;
      if (def.auth !== false) {
        var user = Q.Auth.authenticate(body.idToken);
        who = user.email;
        throttle(who);
        ctx = Q.Policy.build(user);
      }
      var data;
      if (def.write) {
        data = Env.lock(function () {
          // Dựng lại ngữ cảnh trong khóa để đọc dữ liệu mới nhất (tránh quyết định trên dữ liệu cũ).
          Q.Store.reset();
          var fresh = Q.Auth.authenticate(body.idToken);
          ctx = Q.Policy.build(fresh);
          return def.fn(ctx, params, { requestId: String(requestId) });
        });
        Env.flush();
      } else {
        // Đọc: dùng bộ đệm đã nạp lúc xác thực (không đặt lại để khỏi đọc lại Users, Roles...).
        data = def.fn(ctx, params, { requestId: requestId });
      }
      meta.serverTime = U.isoNow();
      if (who) Env.log({ action: action, user: who, ok: true, ms: Env.now().getTime() - t0 });
      return { ok: true, data: data, meta: meta };
    } catch (e) {
      meta.serverTime = U.isoNow();
      if (e instanceof U.AppError) {
        Env.log({ action: action, user: who, ok: false, code: e.code, ms: Env.now().getTime() - t0 });
        return { ok: false, error: { code: e.code, message: e.message, details: e.details }, meta: meta };
      }
      var errorId = Env.uuid().slice(0, 8);
      Env.logError({ errorId: errorId, action: action, user: who, message: String(e && e.message), stack: String(e && e.stack).slice(0, 800) });
      return { ok: false, error: { code: 'INTERNAL', message: 'Lỗi hệ thống. Mã tham chiếu: ' + errorId + '. Nếu lặp lại, hãy báo quản trị viên.', details: null }, meta: meta };
    }
  };

  Q.actions = function () { return Object.keys(ACTIONS); };

  // ---- Điểm vào của Apps Script Web App ----
  function out(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  }
  Q.doPost = function (e) {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > Q.Config.MAX_BODY_BYTES) {
      return out({ ok: false, error: { code: 'VALIDATION', message: 'Nội dung yêu cầu trống hoặc quá lớn.' } });
    }
    var body;
    try { body = JSON.parse(raw); } catch (err) { return out({ ok: false, error: { code: 'VALIDATION', message: 'Yêu cầu không phải JSON hợp lệ.' } }); }
    return out(Q.handle(body));
  };
  Q.doGet = function () { return out(Q.handle({ action: 'system.health' })); };
})(QLCV);

// Hàm toàn cục bắt buộc của Apps Script
function doPost(e) { return QLCV.doPost(e); }
function doGet(e) { return QLCV.doGet(e); }

/* ---- 95_Setup.js ---- */
/**
 * Khởi tạo & vận hành trên Google Sheets (chạy từ trình soạn thảo Apps Script hoặc menu "QLCV").
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
  if (typeof SpreadsheetApp === 'undefined') { Q.Setup = {}; Q.Backup = {}; return; }

  var Setup = Q.Setup = {};

  function book() { return Q.SheetDriver.book(); }

  Setup.ensureTabs = function () {
    var ss = book(), report = [];
    Q.Schema.names.forEach(function (t) {
      var cols = Q.Schema.cols(t), sh = ss.getSheetByName(t);
      if (!sh) { sh = ss.insertSheet(t); report.push('Tạo tab ' + t); }
      var head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
      var empty = head.every(function (v) { return v === ''; });
      if (empty) {
        sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e8f0ec');
        sh.setFrozenRows(1);
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

  function insertAll(table, rows) { Q.Store.insertMany(table, rows); }

  Setup.loadReference = function () {
    var R = Q.SeedData.reference;
    ['Roles', 'Permissions', 'RolePermissions'].forEach(function (t) {
      if (Q.Store.count(t) === 0) insertAll(t, R[t]);
    });
  };

  Setup.bootstrapDatabase = function () {
    Q.Store.reset();
    var report = Setup.ensureTabs();
    Q.Store.reset();
    Setup.loadReference();
    var adminEmail = (Q.Env.prop('ADMIN_EMAIL') || '').trim().toLowerCase();
    if (Q.Store.count('Users') === 0) {
      if (!adminEmail) throw new Error('Đặt Script Property ADMIN_EMAIL trước khi bootstrap.');
      var now = U.isoNow();
      Q.Store.insert('Users', { user_id: 'USR-001', email: U.email(adminEmail), employee_code: 'ADMIN-001', full_name: 'Quản trị hệ thống',
        role_id: 'ROL-ADMIN', org_unit: 'HOI-SO', status: 'active', created_at: now, updated_at: now });
      report.push('Tạo Admin đầu tiên: ' + adminEmail);
    }
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
      if (Q.Store.count(t) > 0) throw new Error('Từ chối: tab ' + t + ' đã có dữ liệu.');
    });
    Setup.loadReference();
    var adminEmail = (Q.Env.prop('ADMIN_EMAIL') || '').trim().toLowerCase();
    var D = Q.SeedData.demo;
    Object.keys(D).forEach(function (t) {
      insertAll(t, D[t].map(function (r) {
        // Cho phép đăng nhập thử bằng tài khoản Admin thật của người cài đặt.
        if (t === 'Users' && r.user_id === 'USR-001' && adminEmail) { r = Object.assign({}, r, { email: adminEmail }); }
        return r;
      }));
    });
    console.log('Đã nạp dữ liệu tổng hợp.');
  };

  Setup.checkIntegrity = function () {
    Q.Store.reset();
    var admin = Q.Store.all('Users').filter(function (u) { return u.role_id === 'ROL-ADMIN'; })[0];
    var res = Q.AdminService.integrity({ perms: { 'user.manage': true }, user: admin });
    console.log(JSON.stringify(res, null, 2));
    return res;
  };

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

  /* ---------- Sao lưu ---------- */
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

/* ---- 96_Seed.js ---- */
/* TỆP SINH TỰ ĐỘNG bởi tools/build.js từ data/appsheet-synthetic/*.csv – KHÔNG sửa tay.
 * Chỉ chứa dữ liệu tham chiếu (vai trò, quyền) và dữ liệu TỔNG HỢP (R13). Không có dữ liệu thật. */
QLCV.SeedData = {
 "reference": {
  "Roles": [
   {
    "role_id": "ROL-ADMIN",
    "code": "Admin",
    "name": "Quản trị",
    "description": "Quản lý người dùng và toàn bộ phạm vi thí điểm"
   },
   {
    "role_id": "ROL-BGD",
    "code": "BGD",
    "name": "Ban Giám đốc",
    "description": "Xem phạm vi thí điểm; tạo và giao việc; chỉ đọc khách hàng"
   },
   {
    "role_id": "ROL-KSV",
    "code": "KSV",
    "name": "Kiểm soát viên",
    "description": "Quản lý công việc; duyệt tiến độ; duy trì khách hàng"
   },
   {
    "role_id": "ROL-CBTD",
    "code": "CBTD",
    "name": "Cán bộ tín dụng",
    "description": "Xem và xử lý công việc được giao; gửi tiến độ"
   }
  ],
  "Permissions": [
   {
    "permission_id": "PER-01",
    "code": "task.view",
    "name": "Xem công việc",
    "description": "Xem công việc trong phạm vi được phép"
   },
   {
    "permission_id": "PER-02",
    "code": "task.create",
    "name": "Tạo công việc",
    "description": "Tạo công việc và giao người thực hiện"
   },
   {
    "permission_id": "PER-03",
    "code": "task.update",
    "name": "Cập nhật công việc",
    "description": "Cập nhật phân công và quản trị công việc; lưu trữ thay vì xóa cứng"
   },
   {
    "permission_id": "PER-04",
    "code": "task.transfer",
    "name": "Chuyển giao người thực hiện chính",
    "description": "Đổi CBTD chính của công việc"
   },
   {
    "permission_id": "PER-05",
    "code": "task.start",
    "name": "Bắt đầu công việc",
    "description": "Chuyển công việc được giao sang Đang thực hiện"
   },
   {
    "permission_id": "PER-06",
    "code": "customer.view",
    "name": "Xem khách hàng",
    "description": "Xem khách hàng trong phạm vi được phép"
   },
   {
    "permission_id": "PER-07",
    "code": "customer.maintain",
    "name": "Duy trì khách hàng",
    "description": "Tạo và cập nhật khách hàng; không xóa"
   },
   {
    "permission_id": "PER-08",
    "code": "customer.delete",
    "name": "Xóa khách hàng",
    "description": "Xóa khách hàng"
   },
   {
    "permission_id": "PER-09",
    "code": "progress.submit",
    "name": "Gửi tiến độ",
    "description": "Gửi cập nhật tiến độ cho công việc được giao"
   },
   {
    "permission_id": "PER-10",
    "code": "progress.review",
    "name": "Duyệt tiến độ",
    "description": "Duyệt hoặc từ chối cập nhật tiến độ"
   },
   {
    "permission_id": "PER-11",
    "code": "dashboard.view",
    "name": "Xem bảng điều khiển",
    "description": "Số liệu trong phạm vi được phép"
   },
   {
    "permission_id": "PER-12",
    "code": "dashboard.view_director",
    "name": "Bảng điều khiển Giám đốc",
    "description": "Có điều kiện; chờ xác nhận cho BGD"
   },
   {
    "permission_id": "PER-13",
    "code": "audit.view",
    "name": "Xem nhật ký kiểm toán",
    "description": "Xem nhật ký kiểm toán"
   },
   {
    "permission_id": "PER-14",
    "code": "notification.view",
    "name": "Xem thông báo",
    "description": "Xem thông báo của chính mình"
   },
   {
    "permission_id": "PER-15",
    "code": "user.manage",
    "name": "Quản lý người dùng",
    "description": "Quản lý người dùng; Backup và Restore"
   }
  ],
  "RolePermissions": [
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-03",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-04",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-07",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-08",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-10",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-12",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-13",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-15",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-03",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-03",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-04",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-07",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-10",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   }
  ]
 },
 "demo": {
  "Users": [
   {
    "user_id": "USR-001",
    "email": "admin@example.com",
    "employee_code": "NV-TEST-001",
    "full_name": "Quản trị mẫu",
    "role_id": "ROL-ADMIN",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-002",
    "email": "bgd@example.com",
    "employee_code": "NV-TEST-002",
    "full_name": "Ban giám đốc mẫu",
    "role_id": "ROL-BGD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-003",
    "email": "ksv01@example.com",
    "employee_code": "NV-TEST-003",
    "full_name": "KSV mẫu 01",
    "role_id": "ROL-KSV",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-004",
    "email": "cbtd01@example.com",
    "employee_code": "NV-TEST-004",
    "full_name": "CBTD mẫu 01",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-005",
    "email": "cbtd02@example.com",
    "employee_code": "NV-TEST-005",
    "full_name": "CBTD mẫu 02",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-006",
    "email": "cbtd03@example.com",
    "employee_code": "NV-TEST-006",
    "full_name": "CBTD mẫu 03",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-007",
    "email": "cbtd-inactive@example.com",
    "employee_code": "NV-TEST-007",
    "full_name": "CBTD không hoạt động mẫu",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "inactive",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   }
  ],
  "Customers": [
   {
    "customer_id": "CUS-001",
    "customer_code": "KH-TEST-001",
    "name": "Khách hàng mẫu A",
    "type": "personal",
    "phone": "0900000001",
    "status": "managed",
    "created_at": "2026-10-13T07:52:00Z",
    "updated_at": "2026-10-13T07:52:00Z",
    "archived_at": "",
    "company_representative": ""
   },
   {
    "customer_id": "CUS-002",
    "customer_code": "KH-TEST-002",
    "name": "Công ty mẫu B",
    "type": "business",
    "phone": "0900000002",
    "status": "new",
    "created_at": "2026-10-13T07:52:00Z",
    "updated_at": "2026-10-13T07:52:00Z",
    "archived_at": "",
    "company_representative": "Người đại diện mẫu B"
   },
   {
    "customer_id": "CUS-003",
    "customer_code": "KH-TEST-003",
    "name": "Khách hàng mẫu C",
    "type": "personal",
    "phone": "0900000003",
    "status": "managed",
    "created_at": "2026-10-13T07:52:00Z",
    "updated_at": "2026-10-13T07:52:00Z",
    "archived_at": "",
    "company_representative": ""
   }
  ],
  "Tasks": [
   {
    "task_id": "TSK-001",
    "task_code": "CV-TEST-001",
    "customer_id": "CUS-001",
    "title": "Thẩm định hồ sơ mẫu A",
    "description": "Thu thập và kiểm tra hồ sơ mẫu",
    "status": "in_progress",
    "priority": "high",
    "due_at": "2026-10-20",
    "created_by_user_id": "USR-003",
    "completed_at": "",
    "created_at": "2026-10-13T08:10:00Z",
    "updated_at": "2026-10-13T09:30:00Z",
    "archived_at": ""
   },
   {
    "task_id": "TSK-002",
    "task_code": "CV-TEST-002",
    "customer_id": "CUS-002",
    "title": "Kiểm tra tài sản bảo đảm mẫu B",
    "description": "Kiểm tra tài sản theo danh mục mẫu",
    "status": "not_started",
    "priority": "normal",
    "due_at": "2026-10-25",
    "created_by_user_id": "USR-004",
    "completed_at": "",
    "created_at": "2026-10-13T08:20:00Z",
    "updated_at": "2026-10-13T08:20:00Z",
    "archived_at": ""
   },
   {
    "task_id": "TSK-003",
    "task_code": "CV-TEST-003",
    "customer_id": "CUS-003",
    "title": "Thu thập hồ sơ tài chính mẫu C",
    "description": "Thu thập báo cáo tài chính mẫu",
    "status": "completed",
    "priority": "high",
    "due_at": "2026-10-10",
    "created_by_user_id": "USR-001",
    "completed_at": "2026-10-12T10:00:00Z",
    "created_at": "2026-10-09T09:00:00Z",
    "updated_at": "2026-10-12T10:00:00Z",
    "archived_at": ""
   },
   {
    "task_id": "TSK-004",
    "task_code": "CV-TEST-004",
    "customer_id": "CUS-001",
    "title": "Báo cáo tiến độ mẫu D",
    "description": "Báo cáo định kỳ mẫu",
    "status": "not_started",
    "priority": "low",
    "due_at": "2026-10-30",
    "created_by_user_id": "USR-002",
    "completed_at": "",
    "created_at": "2026-10-13T08:30:00Z",
    "updated_at": "2026-10-13T08:30:00Z",
    "archived_at": ""
   }
  ],
  "TaskAssignees": [
   {
    "assignment_id": "ASG-001",
    "task_id": "TSK-001",
    "user_id": "USR-004",
    "assignee_email_snapshot": "cbtd01@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-13T08:10:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-002",
    "task_id": "TSK-001",
    "user_id": "USR-005",
    "assignee_email_snapshot": "cbtd02@example.com",
    "assignment_role": "collaborator",
    "assigned_at": "2026-10-13T08:12:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-003",
    "task_id": "TSK-001",
    "user_id": "USR-006",
    "assignee_email_snapshot": "cbtd03@example.com",
    "assignment_role": "collaborator",
    "assigned_at": "2026-10-13T08:11:00Z",
    "active": "FALSE"
   },
   {
    "assignment_id": "ASG-004",
    "task_id": "TSK-002",
    "user_id": "USR-004",
    "assignee_email_snapshot": "cbtd01@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-13T08:20:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-005",
    "task_id": "TSK-003",
    "user_id": "USR-004",
    "assignee_email_snapshot": "cbtd01@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-09T09:00:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-006",
    "task_id": "TSK-004",
    "user_id": "USR-006",
    "assignee_email_snapshot": "cbtd03@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-13T08:30:00Z",
    "active": "TRUE"
   }
  ],
  "TaskUpdates": [
   {
    "update_id": "UPD-001",
    "task_id": "TSK-001",
    "progress_pct": "30",
    "narrative": "Đã thu thập giấy tờ cơ bản mẫu",
    "submitted_by_user_id": "USR-004",
    "submitted_by_email_snapshot": "cbtd01@example.com",
    "submitted_at": "2026-10-13T09:00:00Z",
    "review_status": "approved",
    "reviewed_by_user_id": "USR-003",
    "reviewed_by_email_snapshot": "ksv01@example.com",
    "reviewed_at": "2026-10-13T09:30:00Z",
    "review_comment": "Đạt"
   },
   {
    "update_id": "UPD-002",
    "task_id": "TSK-001",
    "progress_pct": "60",
    "narrative": "Đang đối chiếu hồ sơ mẫu",
    "submitted_by_user_id": "USR-005",
    "submitted_by_email_snapshot": "cbtd02@example.com",
    "submitted_at": "2026-10-13T10:00:00Z",
    "review_status": "pending",
    "reviewed_by_user_id": "",
    "reviewed_by_email_snapshot": "",
    "reviewed_at": "",
    "review_comment": ""
   },
   {
    "update_id": "UPD-003",
    "task_id": "TSK-003",
    "progress_pct": "80",
    "narrative": "Còn thiếu một chứng từ mẫu",
    "submitted_by_user_id": "USR-004",
    "submitted_by_email_snapshot": "cbtd01@example.com",
    "submitted_at": "2026-10-11T09:00:00Z",
    "review_status": "rejected",
    "reviewed_by_user_id": "USR-003",
    "reviewed_by_email_snapshot": "ksv01@example.com",
    "reviewed_at": "2026-10-11T11:00:00Z",
    "review_comment": "Cần bổ sung chứng từ"
   },
   {
    "update_id": "UPD-004",
    "task_id": "TSK-003",
    "progress_pct": "100",
    "narrative": "Hoàn thành hồ sơ mẫu",
    "submitted_by_user_id": "USR-004",
    "submitted_by_email_snapshot": "cbtd01@example.com",
    "submitted_at": "2026-10-12T09:00:00Z",
    "review_status": "approved",
    "reviewed_by_user_id": "USR-003",
    "reviewed_by_email_snapshot": "ksv01@example.com",
    "reviewed_at": "2026-10-12T10:00:00Z",
    "review_comment": "Đạt"
   }
  ],
  "Notifications": [
   {
    "notification_id": "NTF-001",
    "recipient_user_id": "USR-004",
    "event_type": "task_assigned",
    "source_record_id": "ASG-001",
    "request_or_event_key": "evt-assign-ASG-001",
    "message": "Bạn được giao công việc CV-TEST-001",
    "created_at": "2026-10-13T08:10:00Z",
    "read_at": "2026-10-13T08:15:00Z"
   },
   {
    "notification_id": "NTF-002",
    "recipient_user_id": "USR-003",
    "event_type": "progress_submitted",
    "source_record_id": "UPD-001",
    "request_or_event_key": "evt-submit-UPD-001",
    "message": "Có cập nhật tiến độ chờ duyệt CV-TEST-001",
    "created_at": "2026-10-13T09:00:00Z",
    "read_at": ""
   },
   {
    "notification_id": "NTF-003",
    "recipient_user_id": "USR-004",
    "event_type": "progress_approved",
    "source_record_id": "UPD-001",
    "request_or_event_key": "evt-review-UPD-001",
    "message": "Cập nhật tiến độ CV-TEST-001 đã được duyệt",
    "created_at": "2026-10-13T09:30:00Z",
    "read_at": ""
   },
   {
    "notification_id": "NTF-004",
    "recipient_user_id": "USR-004",
    "event_type": "progress_rejected",
    "source_record_id": "UPD-003",
    "request_or_event_key": "evt-review-UPD-003",
    "message": "Cập nhật tiến độ CV-TEST-003 bị từ chối; xem lý do trong ứng dụng",
    "created_at": "2026-10-11T11:00:00Z",
    "read_at": ""
   }
  ],
  "AuditLogs": [
   {
    "audit_id": "AUD-001",
    "actor_user_id": "USR-001",
    "actor_email_snapshot": "admin@example.com",
    "action": "user.create",
    "entity_type": "User",
    "entity_id": "USR-004",
    "request_or_event_key": "evt-aud-001",
    "created_at": "2026-10-13T07:55:00Z"
   },
   {
    "audit_id": "AUD-002",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "customer.create",
    "entity_type": "Customer",
    "entity_id": "CUS-001",
    "request_or_event_key": "evt-aud-002",
    "created_at": "2026-10-13T08:00:00Z"
   },
   {
    "audit_id": "AUD-003",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "task.create",
    "entity_type": "Task",
    "entity_id": "TSK-001",
    "request_or_event_key": "evt-aud-003",
    "created_at": "2026-10-13T08:10:00Z"
   },
   {
    "audit_id": "AUD-004",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "task.assign",
    "entity_type": "TaskAssignee",
    "entity_id": "ASG-001",
    "request_or_event_key": "evt-aud-004",
    "created_at": "2026-10-13T08:10:00Z"
   },
   {
    "audit_id": "AUD-005",
    "actor_user_id": "USR-004",
    "actor_email_snapshot": "cbtd01@example.com",
    "action": "progress.submit",
    "entity_type": "TaskUpdate",
    "entity_id": "UPD-001",
    "request_or_event_key": "evt-aud-005",
    "created_at": "2026-10-13T09:00:00Z"
   },
   {
    "audit_id": "AUD-006",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "progress.approve",
    "entity_type": "TaskUpdate",
    "entity_id": "UPD-001",
    "request_or_event_key": "evt-aud-006",
    "created_at": "2026-10-13T09:30:00Z"
   },
   {
    "audit_id": "AUD-007",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "progress.reject",
    "entity_type": "TaskUpdate",
    "entity_id": "UPD-003",
    "request_or_event_key": "evt-aud-007",
    "created_at": "2026-10-11T11:00:00Z"
   },
   {
    "audit_id": "AUD-008",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "task.auto_complete",
    "entity_type": "Task",
    "entity_id": "TSK-003",
    "request_or_event_key": "evt-aud-008",
    "created_at": "2026-10-12T10:00:00Z"
   }
  ]
 }
};

/* ---- Env_Memory.js ---- */
/**
 * Môi trường bộ nhớ – dùng cho (1) kiểm thử Node, (2) chế độ demo trong trình duyệt.
 * KHÔNG đẩy lên Apps Script (nằm ngoài backend/src). Cho phép token "demo:<email>" – tuyệt đối không bật ở sản xuất.
 */
(function (Q) {
  'use strict';
  if (typeof SpreadsheetApp !== 'undefined') return;   // đang ở Apps Script: bỏ qua

  var props = {}, cache = {}, fixed = null, tables = {}, clock = 0, flushHook = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  Q.Env = {
    runtime: 'memory',
    allowDemoTokens: true,
    now: function () { return fixed ? new Date(fixed.getTime() + clock) : new Date(); },
    setNow: function (d) { fixed = d ? new Date(d) : null; clock = 0; },
    advance: function (ms) { clock += ms; },
    prop: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
    setProp: function (k, v) { if (v === null) delete props[k]; else props[k] = v; },
    lock: function (fn) { return fn(); },
    cacheGet: function (k) { var e = cache[k]; return e && e.exp > Date.now() ? e.v : null; },
    cachePut: function (k, v, sec) { cache[k] = { v: v, exp: Date.now() + sec * 1000 }; },
    sha256: function (s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(16); },
    fetchJson: function () { return { status: 503, json: null }; },
    uuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); },
    log: function () {},
    logError: function (o) { if (Q.Env.verbose) console.error(JSON.stringify(o)); },
    flush: function () { if (flushHook) flushHook(); }
  };

  Q.MemoryDriver = {
    read: function (t) { return clone(tables[t] || []); },
    append: function (t, row) { (tables[t] = tables[t] || []).push(clone(row)); },
    appendMany: function (t, rows) { rows.forEach(function (row) { (tables[t] = tables[t] || []).push(clone(row)); }); },
    write: function (t, i, row) { tables[t][i] = clone(row); }
  };
  Q.Store = Q.makeStore(Q.MemoryDriver);

  Q.Dev = {
    /** Nạp lại dữ liệu mẫu (đồng bộ với tab trong Google Sheets). */
    reset: function () {
      tables = {}; cache = {};
      Q.Schema.names.forEach(function (t) { tables[t] = []; });
      var R = Q.SeedData.reference, D = Q.SeedData.demo;
      Object.keys(R).forEach(function (t) { tables[t] = clone(R[t]); });
      Object.keys(D).forEach(function (t) { tables[t] = clone(D[t]); });
      Q.Store.reset();
    },
    dump: function () { return clone(tables); },
    load: function (snapshot) { tables = clone(snapshot); Q.Store.reset(); },
    onFlush: function (fn) { flushHook = fn; },
    seedProps: function (o) { Object.keys(o).forEach(function (k) { props[k] = o[k]; }); }
  };
  Q.Dev.reset();
})(QLCV);
