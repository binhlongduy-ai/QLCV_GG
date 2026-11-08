/**
 * ============================================================================
 *  QLCV CBTD – Backend (Google Apps Script)
 * ============================================================================
 *  - Đọc/ghi dữ liệu trên Google Sheet (4 sheet: Users, CongViec, NhatKy, KhachHang)
 *  - Xác thực bằng Google Login: Session.getActiveUser().getEmail()
 *  - Phân quyền: Admin, KSV, BGD, CBTD (hỗ trợ CBTD1 chính & CBTD2 hợp công)
 *  - Deploy: Execute as "User accessing the web app",
 *            Who has access: "Anyone within [tổ chức của bạn]"
 * ============================================================================
 */

const SHEET_USERS = "Users";
const SHEET_CONGVIEC = "CongViec";
const SHEET_NHATKY = "NhatKy";
const SHEET_KHACHHANG = "KhachHang";

// ─────────────────────────────────────────────────────────────────────────
//  ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Entry point cho Web App.
 *  - Có ?action=...    → chuyển sang handleRequest() xử lý API (JSON)
 *  - Không có ?action= → serve index.html như SPA
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action;

  if (action) {
    return handleRequest(action, params);
  }
  return serveIndexHtml();
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ status: "error", message: "Payload không hợp lệ" });
  }
  return handleRequest(body.action, body);
}

/**
 * Serve SPA: trả index.html và inject email người dùng
 */
function serveIndexHtml() {
  const userEmail = (() => {
    try { return Session.getActiveUser().getEmail(); }
    catch (e) { return ""; }
  })();

  const template = HtmlService.createTemplateFromFile("index");
  template.userEmail = userEmail;

  return template.evaluate()
    .setTitle("QLCV CBTD – Quản lý Công việc Cán Bộ Tín Dụng")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

/**
 * Helper include file HTML/CSS/JS vào trong template.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function handleRequest(action, params) {
  try {
    let activeEmail = "";
    try {
      activeEmail = Session.getActiveUser().getEmail();
    } catch (e) {
      throw new Error("Không xác định được tài khoản Google đang đăng nhập. Hãy kiểm tra: (1) đã đăng nhập Gmail/Google Workspace, (2) Web App đã deploy đúng 'Execute as: User accessing the web app'.");
    }

    switch (action) {
      case "login":
        return jsonOut({ status: "success", data: login(activeEmail) });

      case "getUsers":
        requireRole(activeEmail, ["Admin"]);
        return jsonOut({ status: "success", data: getUsers() });

      case "getKhachHang":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: getKhachHang() });

      case "getCongViec":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: getCongViec(params, activeEmail) });

      case "getNhatKy":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: getNhatKy(params, activeEmail) });

      case "getAllNhatKy":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: getAllNhatKy() });

      case "getDashboard":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: getDashboard(params, activeEmail) });

      case "addCongViec":
        requireRole(activeEmail, ["Admin", "KSV", "BGD", "CBTD"]);
        return jsonOut({ status: "success", data: addCongViec(params, activeEmail) });

      case "updateCongViec":
        requireRole(activeEmail, ["Admin", "KSV", "BGD"]);
        return jsonOut({ status: "success", data: updateCongViec(params) });

      case "updateTrangThai":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: updateTrangThai(params, activeEmail) });

      case "updateDienGiai":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: updateDienGiai(params, activeEmail) });

      case "addNhatKy":
        requireLogin(activeEmail);
        return jsonOut({ status: "success", data: addNhatKy(params, activeEmail) });

      case "duyetTienDo":
        requireRole(activeEmail, ["KSV", "Admin"]);
        return jsonOut({ status: "success", data: duyetTienDo(params) });

      case "addKhachHang":
        requireRole(activeEmail, ["Admin", "KSV", "BGD", "CBTD"]);
        return jsonOut({ status: "success", data: addKhachHang(params) });

      case "updateKhachHang":
        requireRole(activeEmail, ["Admin", "KSV", "BGD"]);
        return jsonOut({ status: "success", data: updateKhachHang(params) });

      case "deleteKhachHang":
        requireRole(activeEmail, ["Admin"]);
        return jsonOut({ status: "success", data: deleteKhachHang(params) });

      case "addUser":
        requireRole(activeEmail, ["Admin"]);
        return jsonOut({ status: "success", data: addUser(params) });

      case "updateUser":
        requireRole(activeEmail, ["Admin"]);
        return jsonOut({ status: "success", data: updateUser(params) });

      case "deleteUser":
        requireRole(activeEmail, ["Admin"]);
        return jsonOut({ status: "success", data: deleteUser(params) });

      case "syncToDb":
        requireRole(activeEmail, ["Admin"]);
        return jsonOut({ status: "success", data: syncToDb(params) });

      case "checkIntegrity":
        requireRole(activeEmail, ["Admin"]);
        return jsonOut({ status: "success", data: checkIntegrity() });

      default:
        return jsonOut({ status: "error", message: "Action không hợp lệ: " + action });
    }
  } catch (err) {
    return jsonOut({ status: "error", message: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────
//  AUTH HELPERS
// ─────────────────────────────────────────────────────────────────────────

function findUserByEmail(email) {
  if (!email) return null;
  const users = getUsers();
  return users.find(u => String(u.Email || "").toLowerCase() === String(email).toLowerCase()) || null;
}

function requireLogin(email) {
  if (!email || !String(email).trim()) {
    throw new Error("Không xác định được tài khoản Google đang đăng nhập. Vui lòng đăng nhập Gmail/Google Workspace rồi thử lại.");
  }
  const user = findUserByEmail(email);
  if (!user) {
    throw new Error(`Tài khoản "${email}" chưa được cấp quyền truy cập hệ thống. Liên hệ Admin để được thêm vào danh sách người dùng.`);
  }
  return user;
}

function requireRole(email, roles) {
  const user = requireLogin(email);
  if (roles.indexOf(user.Role) === -1) {
    throw new Error("Bạn không có quyền thực hiện thao tác này");
  }
  return user;
}

function login(activeEmail) {
  if (!activeEmail) {
    throw new Error("Không xác định được tài khoản Google đang đăng nhập");
  }
  const user = findUserByEmail(activeEmail);
  if (!user) {
    throw new Error("Email " + activeEmail + " không có trong danh sách người dùng được cấp quyền");
  }
  return {
    email: user.Email,
    tenCanbo: user.TenCanbo || user.Email.split("@")[0],
    role: user.Role
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  LOCK & SHEET HELPERS
// ─────────────────────────────────────────────────────────────────────────

function withScriptLock(fn) {
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(15000);
  if (!hasLock) {
    throw new Error("Hệ thống đang bận xử lý dữ liệu đồng thời. Vui lòng thử lại sau vài giây.");
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Không tìm thấy sheet: " + name);
  return sheet;
}

/** Đọc toàn bộ sheet thành mảng object, dùng dòng 1 làm header */
function sheetToObjects(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === "" || c === null)) continue; // bỏ dòng trống
    const obj = {};
    headers.forEach((h, idx) => {
      let v = row[idx];
      if (v instanceof Date) v = v.toISOString();
      obj[h] = v;
    });
    obj.__row = i + 1; // vị trí dòng thực tế trên sheet (1-based)
    rows.push(obj);
  }
  return rows;
}

/** Thêm 1 dòng mới vào sheet theo đúng thứ tự cột header */
function appendRow(name, obj) {
  return withScriptLock(() => {
    const sheet = getSheet(name);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ""));
    sheet.appendRow(row);
    return obj;
  });
}

/** Cập nhật 1 dòng đã tìm được (__row) với các field mới trong patch */
function updateRow(name, rowIndex, patch) {
  return withScriptLock(() => {
    const sheet = getSheet(name);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    headers.forEach((h, idx) => {
      if (patch[h] !== undefined) {
        sheet.getRange(rowIndex, idx + 1).setValue(patch[h]);
      }
    });
  });
}

function deleteRowByMatch(name, keyField, keyValue) {
  return withScriptLock(() => {
    const sheet = getSheet(name);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h).trim());
    const colIdx = headers.indexOf(keyField);
    if (colIdx === -1) throw new Error("Không tìm thấy cột " + keyField);

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colIdx]) === String(keyValue)) {
        sheet.deleteRow(i + 1);
        return true;
      }
    }
    throw new Error("Không tìm thấy dòng có " + keyField + " = " + keyValue);
  });
}

function genId(prefix, existingIds) {
  let n = 1;
  let id;
  do {
    id = prefix + String(n).padStart(3, "0");
    n++;
  } while (existingIds.indexOf(id) !== -1);
  return id;
}

// ─────────────────────────────────────────────────────────────────────────
//  USERS
// ─────────────────────────────────────────────────────────────────────────

function getUsers() {
  return sheetToObjects(SHEET_USERS).map(u => ({
    Email: u.Email, TenCanbo: u.TenCanbo, Role: u.Role
  }));
}

function addUser(p) {
  const email = String(p.email || "").trim();
  const role = String(p.role || "").trim();
  if (!email || !role) throw new Error("Thiếu email hoặc role");

  const users = sheetToObjects(SHEET_USERS);
  if (users.find(u => String(u.Email).toLowerCase() === email.toLowerCase())) {
    throw new Error("Email đã tồn tại: " + email);
  }

  appendRow(SHEET_USERS, {
    Email: email,
    TenCanbo: p.tenCanbo || "",
    Role: role
  });
  return { email, role };
}

function updateUser(p) {
  const email = String(p.email || "").trim();
  const users = sheetToObjects(SHEET_USERS);
  const user = users.find(u => String(u.Email).toLowerCase() === email.toLowerCase());
  if (!user) throw new Error("Không tìm thấy người dùng: " + email);

  const patch = {};
  if (p.tenCanbo !== undefined) patch.TenCanbo = p.tenCanbo;
  if (p.role !== undefined) patch.Role = p.role;
  updateRow(SHEET_USERS, user.__row, patch);
  return { email };
}

function deleteUser(p) {
  const email = String(p.email || "").trim();
  const users = sheetToObjects(SHEET_USERS);
  const user = users.find(u => String(u.Email).toLowerCase() === email.toLowerCase());
  if (!user) throw new Error("Không tìm thấy người dùng: " + email);
  deleteRowByMatch(SHEET_USERS, "Email", user.Email);
  return { email };
}

// ─────────────────────────────────────────────────────────────────────────
//  KHÁCH HÀNG
// ─────────────────────────────────────────────────────────────────────────

function getKhachHang() {
  return sheetToObjects(SHEET_KHACHHANG).map(k => ({
    MaKH: k.MaKH, TenKH: k.TenKH, NhomKH: k.NhomKH, LoaiKH: k.LoaiKH, NhomNo: k.NhomNo
  }));
}

function addKhachHang(p) {
  const maKH = String(p.maKH || "").trim();
  const tenKH = String(p.tenKH || "").trim();
  if (!maKH || !tenKH) throw new Error("Thiếu mã KH hoặc tên KH");

  const list = sheetToObjects(SHEET_KHACHHANG);
  if (list.find(k => String(k.MaKH).toLowerCase() === maKH.toLowerCase())) {
    throw new Error("Mã khách hàng đã tồn tại: " + maKH);
  }

  appendRow(SHEET_KHACHHANG, {
    MaKH: maKH,
    TenKH: tenKH,
    NhomKH: p.nhomKH || "",
    LoaiKH: p.loaiKH || "Đang phát triển",
    NhomNo: p.nhomNo || "Chưa dư nợ"
  });
  return { maKH };
}

function updateKhachHang(p) {
  const maKH = String(p.maKH || "").trim();
  const list = sheetToObjects(SHEET_KHACHHANG);
  const kh = list.find(k => String(k.MaKH) === maKH);
  if (!kh) throw new Error("Không tìm thấy khách hàng: " + maKH);

  const patch = {};
  if (p.tenKH !== undefined) patch.TenKH = p.tenKH;
  if (p.nhomKH !== undefined) patch.NhomKH = p.nhomKH;
  if (p.loaiKH !== undefined) patch.LoaiKH = p.loaiKH;
  if (p.nhomNo !== undefined) patch.NhomNo = p.nhomNo;
  updateRow(SHEET_KHACHHANG, kh.__row, patch);
  return { maKH };
}

function deleteKhachHang(p) {
  const maKH = String(p.maKH || "").trim();
  deleteRowByMatch(SHEET_KHACHHANG, "MaKH", maKH);
  return { maKH };
}

// ─────────────────────────────────────────────────────────────────────────
//  CÔNG VIỆC (Hỗ trợ CBTD1 & CBTD2)
// ─────────────────────────────────────────────────────────────────────────

/**
 * getCongViec(params, activeEmail) — hỗ trợ filter phía server và phân quyền 2 cán bộ.
 */
function getCongViec(params, activeEmail) {
  if (!params) params = {};

  let list = sheetToObjects(SHEET_CONGVIEC).map(c => {
    const cbtd1 = c.CBTD1 || c.Email_CBTD || "";
    const cbtd2 = c.CBTD2 || "";
    return {
      MaCV: c.MaCV,
      MaKH: c.MaKH,
      NoiDung: c.NoiDung,
      CBTD1: cbtd1,
      CBTD2: cbtd2,
      Email_CBTD: cbtd1, // Tương thích ngược
      HanChot: c.HanChot,
      TrangThai: c.TrangThai,
      Mucdo: c.Mucdo,
      DienGiai: c.DienGiai
    };
  });

  // Xác thực vai trò từ CSDL backend để chống giả mạo quyền client
  const activeUser = findUserByEmail(activeEmail || params.email);
  const userRole = activeUser ? activeUser.Role : (params.role || "");
  const userEmail = (activeEmail || params.email || "").toLowerCase();

  // ── Phân quyền CBTD: chỉ nhìn thấy CV do mình làm CBTD1 HOẶC CBTD2 ──
  if (userRole === "CBTD" && userEmail) {
    list = list.filter(c =>
      String(c.CBTD1 || "").toLowerCase() === userEmail ||
      String(c.CBTD2 || "").toLowerCase() === userEmail ||
      String(c.Email_CBTD || "").toLowerCase() === userEmail
    );
  }

  // ── Filter bổ sung ──
  if (params.trangThai) {
    list = list.filter(c => String(c.TrangThai) === String(params.trangThai));
  }
  if (params.mucdo || params.mucDo) {
    const md = String(params.mucdo || params.mucDo);
    list = list.filter(c => String(c.Mucdo || "Bình thường") === md);
  }
  if (params.cbtd && userRole !== "CBTD") {
    // Admin/KSV/BGD lọc theo CBTD cụ thể
    const targetEmail = String(params.cbtd).toLowerCase();
    list = list.filter(c =>
      String(c.CBTD1 || "").toLowerCase() === targetEmail ||
      String(c.CBTD2 || "").toLowerCase() === targetEmail ||
      String(c.Email_CBTD || "").toLowerCase() === targetEmail
    );
  }
  if (params.maKH) {
    const targetKH = String(params.maKH).toLowerCase();
    list = list.filter(c => String(c.MaKH || "").toLowerCase() === targetKH);
  }
  if (params.search) {
    const q = String(params.search).toLowerCase().trim();
    if (q) {
      list = list.filter(c =>
        String(c.MaCV || "").toLowerCase().includes(q) ||
        String(c.NoiDung || "").toLowerCase().includes(q) ||
        String(c.MaKH || "").toLowerCase().includes(q) ||
        String(c.DienGiai || "").toLowerCase().includes(q) ||
        String(c.CBTD1 || "").toLowerCase().includes(q) ||
        String(c.CBTD2 || "").toLowerCase().includes(q)
      );
    }
  }

  return list;
}

function addCongViec(p, activeEmail) {
  const maCV = String(p.maCV || "").trim();
  const noiDung = String(p.noiDung || "").trim();
  if (!maCV || !noiDung) throw new Error("Thiếu mã CV hoặc nội dung");

  const list = sheetToObjects(SHEET_CONGVIEC);
  if (list.find(c => String(c.MaCV).toLowerCase() === maCV.toLowerCase())) {
    throw new Error("Mã công việc đã tồn tại: " + maCV);
  }

  const cbtd1 = String(p.cbtd1 || p.emailCBTD || "").trim();
  const cbtd2 = String(p.cbtd2 || "").trim();

  // Phân quyền CBTD: chỉ được giao việc có CBTD1 là chính mình.
  const activeUser = findUserByEmail(activeEmail);
  if (activeUser && activeUser.Role === "CBTD") {
    const myEmail = String(activeEmail || "").toLowerCase();
    if (cbtd1.toLowerCase() !== myEmail) {
      throw new Error("Bạn chỉ được tạo công việc có CBTD1 là chính mình.");
    }
  }

  appendRow(SHEET_CONGVIEC, {
    MaCV: maCV,
    MaKH: p.maKH || "",
    NoiDung: noiDung,
    CBTD1: cbtd1,
    CBTD2: cbtd2,
    Email_CBTD: cbtd1, // Tương thích ngược nếu sheet đang dùng header cũ
    HanChot: p.hanChot || "",
    TrangThai: p.trangThai || "Mới giao",
    Mucdo: p.mucDo || p.mucdo || "Bình thường",
    DienGiai: p.dienGiai || ""
  });
  return { maCV };
}

function updateCongViec(p) {
  const maCV = String(p.maCV || "").trim();
  const list = sheetToObjects(SHEET_CONGVIEC);
  const cv = list.find(c => String(c.MaCV) === maCV);
  if (!cv) throw new Error("Không tìm thấy công việc: " + maCV);

  const patch = {};
  if (p.noiDung !== undefined) patch.NoiDung = p.noiDung;
  if (p.maKH !== undefined) patch.MaKH = p.maKH;
  if (p.cbtd1 !== undefined) patch.CBTD1 = p.cbtd1;
  if (p.cbtd2 !== undefined) patch.CBTD2 = p.cbtd2;
  if (p.emailCBTD !== undefined || p.cbtd1 !== undefined) patch.Email_CBTD = p.cbtd1 || p.emailCBTD;
  if (p.hanChot !== undefined) patch.HanChot = p.hanChot;
  if (p.trangThai !== undefined) patch.TrangThai = p.trangThai;
  if (p.mucDo !== undefined || p.mucdo !== undefined) patch.Mucdo = p.mucDo || p.mucdo;
  if (p.dienGiai !== undefined) patch.DienGiai = p.dienGiai;

  updateRow(SHEET_CONGVIEC, cv.__row, patch);
  return { maCV };
}

function updateTrangThai(p, activeEmail) {
  const maCV = String(p.maCV || "").trim();
  const list = sheetToObjects(SHEET_CONGVIEC);
  const cv = list.find(c => String(c.MaCV) === maCV);
  if (!cv) throw new Error("Không tìm thấy công việc: " + maCV);

  // Phân quyền CBTD: chỉ được đổi trạng thái CV của chính mình (CBTD1 hoặc CBTD2).
  const activeUser = findUserByEmail(activeEmail);
  if (activeUser && activeUser.Role === "CBTD") {
    const myEmail = String(activeEmail || "").toLowerCase();
    const c1 = String(cv.CBTD1 || cv.Email_CBTD || "").toLowerCase();
    const c2 = String(cv.CBTD2 || "").toLowerCase();
    if (myEmail !== c1 && myEmail !== c2) {
      throw new Error("Bạn không phụ trách công việc này.");
    }
  }

  updateRow(SHEET_CONGVIEC, cv.__row, { TrangThai: p.trangThai });
  return { maCV, trangThai: p.trangThai };
}

function updateDienGiai(p, activeEmail) {
  const maCV = String(p.maCV || "").trim();
  const list = sheetToObjects(SHEET_CONGVIEC);
  const cv = list.find(c => String(c.MaCV) === maCV);
  if (!cv) throw new Error("Không tìm thấy công việc: " + maCV);

  // Phân quyền CBTD: chỉ được cập nhật di�n giải CV của chính mình.
  const activeUser = findUserByEmail(activeEmail);
  if (activeUser && activeUser.Role === "CBTD") {
    const myEmail = String(activeEmail || "").toLowerCase();
    const c1 = String(cv.CBTD1 || cv.Email_CBTD || "").toLowerCase();
    const c2 = String(cv.CBTD2 || "").toLowerCase();
    if (myEmail !== c1 && myEmail !== c2) {
      throw new Error("Bạn không phụ trách công việc này.");
    }
  }

  updateRow(SHEET_CONGVIEC, cv.__row, { DienGiai: p.dienGiai });
  return { maCV };
}

// ─────────────────────────────────────────────────────────────────────────
//  NHẬT KÝ (Append-only)
// ─────────────────────────────────────────────────────────────────────────

function getAllNhatKy() {
  return sheetToObjects(SHEET_NHATKY).map(n => ({
    MaNK: n.MaNK, MaCV: n.MaCV, TienDo: n.TienDo,
    ThoiGian: n.ThoiGian, KSV_Duyet: n.KSV_Duyet, ThoiGian_Duyet: n.ThoiGian_Duyet,
    EmailCBTD: n.EmailCBTD || n.NguoiCapNhat || "",
    EmailKSV: n.EmailKSV || ""
  }));
}

function getNhatKy(params, activeEmail) {
  if (typeof params === "string") params = { maCV: params };
  if (!params) params = {};

  const list = getAllNhatKy();
  let filtered = list;

  const activeUser = findUserByEmail(activeEmail || params.email);
  const userRole = activeUser ? activeUser.Role : (params.role || "");
  const userEmail = (activeEmail || params.email || "").toLowerCase();

  const allCV = sheetToObjects(SHEET_CONGVIEC);
  const cvMap = {};
  allCV.forEach(c => {
    cvMap[String(c.MaCV)] = {
      CBTD1: String(c.CBTD1 || c.Email_CBTD || "").toLowerCase(),
      CBTD2: String(c.CBTD2 || "").toLowerCase(),
      MaKH: String(c.MaKH || "").toLowerCase()
    };
  });

  // Phân quyền CBTD: chỉ trả nhật ký thuộc CV của chính mình
  if (userRole === "CBTD" && userEmail) {
    filtered = filtered.filter(n => {
      const cvInfo = cvMap[String(n.MaCV)];
      if (!cvInfo) return false;
      return cvInfo.CBTD1 === userEmail || cvInfo.CBTD2 === userEmail;
    });
  }

  // Filter theo MaCV cụ thể
  if (params.maCV) {
    filtered = filtered.filter(n => String(n.MaCV) === String(params.maCV));
  }

  // Filter theo CBTD (dành cho KSV/BGĐ/Admin)
  if (params.cbtd && userRole !== "CBTD") {
    const targetCBTD = String(params.cbtd).toLowerCase();
    filtered = filtered.filter(n => {
      const cvInfo = cvMap[String(n.MaCV)];
      return cvInfo && (cvInfo.CBTD1 === targetCBTD || cvInfo.CBTD2 === targetCBTD);
    });
  }

  // Filter theo Khách hàng
  if (params.maKH) {
    const targetKH = String(params.maKH).toLowerCase();
    filtered = filtered.filter(n => {
      const cvInfo = cvMap[String(n.MaCV)];
      return cvInfo && cvInfo.MaKH === targetKH;
    });
  }

  // Sắp xếp mới nhất trước
  filtered.sort((a, b) => {
    const ta = new Date(a.ThoiGian || 0).getTime();
    const tb = new Date(b.ThoiGian || 0).getTime();
    return tb - ta;
  });

  const limit = Number(params.limit);
  if (limit > 0) filtered = filtered.slice(0, limit);

  return filtered;
}

function addNhatKy(p, activeEmail) {
  const maNK = String(p.maNK || "").trim();
  const maCV = String(p.maCV || "").trim();
  const tienDo = String(p.tienDo || "").trim();
  if (!maNK || !maCV || !tienDo) throw new Error("Thiếu thông tin nhật ký");

  const cvList = sheetToObjects(SHEET_CONGVIEC);
  const targetCV = cvList.find(c => String(c.MaCV) === maCV);
  if (!targetCV) throw new Error("Không tìm thấy công việc: " + maCV);

  // Phân quyền CBTD: chỉ được ghi NK cho CV mình phụ trách (CBTD1 hoặc CBTD2).
  const activeUser = findUserByEmail(activeEmail);
  if (activeUser && activeUser.Role === "CBTD") {
    const myEmail = String(activeEmail || "").toLowerCase();
    const cbtd1 = String(targetCV.CBTD1 || targetCV.Email_CBTD || "").toLowerCase();
    const cbtd2 = String(targetCV.CBTD2 || "").toLowerCase();
    if (myEmail !== cbtd1 && myEmail !== cbtd2) {
      throw new Error("Bạn không phụ trách công việc này — không thể ghi nhật ký.");
    }
  }

  const list = sheetToObjects(SHEET_NHATKY);
  if (list.find(n => String(n.MaNK).toLowerCase() === maNK.toLowerCase())) {
    throw new Error("Mã nhật ký đã tồn tại: " + maNK);
  }

  appendRow(SHEET_NHATKY, {
    MaNK: maNK,
    MaCV: maCV,
    TienDo: tienDo,
    ThoiGian: new Date().toISOString(),
    KSV_Duyet: false,
    ThoiGian_Duyet: "",
    EmailCBTD: String(p.emailCBTD || activeEmail || "")
  });
  return { maNK };
}

function duyetTienDo(p) {
  const maNK = String(p.maNK || "").trim();
  const list = sheetToObjects(SHEET_NHATKY);
  const nk = list.find(n => String(n.MaNK) === maNK);
  if (!nk) throw new Error("Không tìm thấy nhật ký: " + maNK);

  const patch = {
    KSV_Duyet: true,
    ThoiGian_Duyet: new Date().toISOString()
  };
  if (p.emailKSV) patch.EmailKSV = String(p.emailKSV);

  updateRow(SHEET_NHATKY, nk.__row, patch);
  return { maNK };
}

// ─────────────────────────────────────────────────────────────────────────
//  DASHBOARD (Số liệu & Bộ lọc đa tiêu chí cho BGĐ)
// ─────────────────────────────────────────────────────────────────────────

function getDashboard(params, activeEmail) {
  const viewerEmail = (activeEmail || (params && params.email) || "").toLowerCase();
  const activeUser = findUserByEmail(viewerEmail);
  const viewerRole = activeUser ? activeUser.Role : ((params && params.role) || "");

  const cv = getCongViec(params, activeEmail);
  const kh = getKhachHang();
  const nk = getNhatKy(params, activeEmail);
  const now = new Date();

  const trangThaiStats = {};
  cv.forEach(c => { trangThaiStats[c.TrangThai] = (trangThaiStats[c.TrangThai] || 0) + 1; });

  const cbtdStats = {};
  cv.forEach(c => {
    const cbtd1 = c.CBTD1 || c.Email_CBTD;
    if (cbtd1) cbtdStats[cbtd1] = (cbtdStats[cbtd1] || 0) + 1;
    if (c.CBTD2 && c.CBTD2 !== cbtd1) {
      cbtdStats[c.CBTD2] = (cbtdStats[c.CBTD2] || 0) + 1;
    }
  });

  const treHan = cv.filter(c =>
    c.TrangThai !== "Hoàn thành" && c.TrangThai !== "Từ chối" &&
    c.HanChot && new Date(c.HanChot) < now
  );

  const chuaDuyet = nk.filter(n => {
    const v = n.KSV_Duyet;
    return !(v === true || v === "TRUE" || v === "true");
  });

  const hoanThanh = cv.filter(c => c.TrangThai === "Hoàn thành").length;
  const tyLeDungHan = cv.length > 0 ? Math.round(((cv.length - treHan.length) / cv.length) * 100) : 100;

  // Thống kê Khách hàng theo Nhóm nợ & Loại KH cho BGĐ
  const nhomNoStats = {};
  const loaiKHStats = {};
  kh.forEach(k => {
    const nn = k.NhomNo || "Chưa dư nợ";
    nhomNoStats[nn] = (nhomNoStats[nn] || 0) + 1;
    const lk = k.LoaiKH || "Đang phát triển";
    loaiKHStats[lk] = (loaiKHStats[lk] || 0) + 1;
  });

  return {
    tongCongViec: cv.length,
    tongKhachHang: kh.length,
    tongNhatKy: nk.length,
    hoanThanh: hoanThanh,
    treHan: treHan.length,
    chuaDuyet: chuaDuyet.length,
    tyLeDungHan: tyLeDungHan,
    trangThaiStats,
    cbtdStats,
    nhomNoStats,
    loaiKHStats,
    dsCongViecTreHan: treHan,
    dsNhatKyChuaDuyet: chuaDuyet
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  ĐỒNG BỘ DỮ LIỆU APP/WEB → DB_QLCV_CBTD
// ─────────────────────────────────────────────────────────────────────────

function syncToDb(params) {
  return withScriptLock(() => ({
    congviec: upsertSheetData(
      SHEET_CONGVIEC, "MaCV", params.congviec,
      c => ({
        MaCV: c.MaCV,
        MaKH: c.MaKH,
        NoiDung: c.NoiDung,
        CBTD1: c.CBTD1 || c.Email_CBTD || "",
        CBTD2: c.CBTD2 || "",
        Email_CBTD: c.CBTD1 || c.Email_CBTD || "",
        HanChot: c.HanChot,
        TrangThai: c.TrangThai,
        Mucdo: c.Mucdo,
        DienGiai: c.DienGiai
      })
    ),
    khachhang: upsertSheetData(
      SHEET_KHACHHANG, "MaKH", params.khachhang,
      k => ({ MaKH: k.MaKH, TenKH: k.TenKH, NhomKH: k.NhomKH, LoaiKH: k.LoaiKH, NhomNo: k.NhomNo })
    ),
    nguoidung: upsertSheetData(
      SHEET_USERS, "Email", params.nguoidung,
      u => ({ Email: u.Email, TenCanbo: u.TenCanbo, Role: u.Role })
    ),
    nhatky: upsertSheetData(
      SHEET_NHATKY, "MaNK", params.nhatky,
      n => ({
        MaNK: n.MaNK, MaCV: n.MaCV, TienDo: n.TienDo,
        ThoiGian: n.ThoiGian, KSV_Duyet: n.KSV_Duyet, ThoiGian_Duyet: n.ThoiGian_Duyet,
        EmailCBTD: n.EmailCBTD || ""
      })
    )
  }));
}

function upsertSheetData(sheetName, keyField, incomingList, mapFn) {
  let inserted = 0;
  let updated = 0;
  if (!incomingList || !incomingList.length) return { inserted, updated };

  const existing = sheetToObjects(sheetName);
  const existingByKey = {};
  existing.forEach(row => {
    const k = String(row[keyField] || "").toLowerCase();
    if (k) existingByKey[k] = row;
  });

  incomingList.forEach(item => {
    const key = String(item[keyField] || "").trim();
    if (!key) return;
    const mapped = mapFn(item);
    const found = existingByKey[key.toLowerCase()];
    if (found) {
      updateRow(sheetName, found.__row, mapped);
      updated++;
    } else {
      appendRow(sheetName, mapped);
      inserted++;
      existingByKey[key.toLowerCase()] = { __row: -1 };
    }
  });

  return { inserted, updated };
}

// ─────────────────────────────────────────────────────────────────────────
//  KIỂM TRA KẾT NỐI & TÍNH TOÀN VẸN DB_QLCV_CBTD
// ─────────────────────────────────────────────────────────────────────────

const EXPECTED_HEADERS = {
  [SHEET_USERS]: ["Email", "TenCanbo", "Role"],
  [SHEET_CONGVIEC]: ["MaCV", "MaKH", "NoiDung", "HanChot", "TrangThai", "Mucdo", "DienGiai"],
  [SHEET_NHATKY]: ["MaNK", "MaCV", "TienDo", "ThoiGian", "KSV_Duyet", "ThoiGian_Duyet"],
  [SHEET_KHACHHANG]: ["MaKH", "TenKH", "NhomKH", "LoaiKH", "NhomNo"]
};

function checkIntegrity() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbName = ss.getName();
  const issues = [];
  const sheetReports = [];

  const sheetNames = [SHEET_USERS, SHEET_CONGVIEC, SHEET_NHATKY, SHEET_KHACHHANG];
  const dataBySheet = {};

  sheetNames.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheetReports.push({ name, exists: false, headersOk: false, missingHeaders: EXPECTED_HEADERS[name], rowCount: 0 });
      issues.push({ level: "error", message: "Thiếu sheet bắt buộc: " + name });
      dataBySheet[name] = [];
      return;
    }

    const values = sheet.getDataRange().getValues();
    const actualHeaders = values.length ? values[0].map(h => String(h).trim()) : [];
    const expectedHeaders = EXPECTED_HEADERS[name];
    const missingHeaders = expectedHeaders.filter(h => actualHeaders.indexOf(h) === -1);
    
    // Đối với sheet CongViec: phải có ít nhất cột CBTD1 hoặc Email_CBTD
    if (name === SHEET_CONGVIEC && actualHeaders.indexOf("CBTD1") === -1 && actualHeaders.indexOf("Email_CBTD") === -1) {
      missingHeaders.push("CBTD1 (hoặc Email_CBTD)");
    }

    const headersOk = missingHeaders.length === 0;

    if (!headersOk) {
      issues.push({ level: "error", message: `Sheet ${name} thiếu cột: ${missingHeaders.join(", ")}` });
    }

    const rows = sheetToObjects(name);
    sheetReports.push({ name, exists: true, headersOk, missingHeaders, rowCount: rows.length });
    dataBySheet[name] = rows;
  });

  const users = dataBySheet[SHEET_USERS];
  const congviec = dataBySheet[SHEET_CONGVIEC];
  const nhatky = dataBySheet[SHEET_NHATKY];
  const khachhang = dataBySheet[SHEET_KHACHHANG];

  checkDuplicates(users, "Email", "Users", issues);
  checkDuplicates(congviec, "MaCV", "CongViec", issues);
  checkDuplicates(nhatky, "MaNK", "NhatKy", issues);
  checkDuplicates(khachhang, "MaKH", "KhachHang", issues);

  users.forEach(u => {
    if (!u.Email) issues.push({ level: "error", message: `Users dòng ${u.__row}: thiếu Email` });
    if (!u.Role) issues.push({ level: "warning", message: `Users dòng ${u.__row} (${u.Email}): thiếu Role` });
  });
  congviec.forEach(c => {
    if (!c.MaCV) issues.push({ level: "error", message: `CongViec dòng ${c.__row}: thiếu MaCV` });
    if (!c.NoiDung) issues.push({ level: "warning", message: `CongViec ${c.MaCV || c.__row}: thiếu NoiDung` });
  });
  khachhang.forEach(k => {
    if (!k.MaKH) issues.push({ level: "error", message: `KhachHang dòng ${k.__row}: thiếu MaKH` });
    if (!k.TenKH) issues.push({ level: "warning", message: `KhachHang ${k.MaKH || k.__row}: thiếu TenKH` });
  });
  nhatky.forEach(n => {
    if (!n.MaNK) issues.push({ level: "error", message: `NhatKy dòng ${n.__row}: thiếu MaNK` });
    if (!n.MaCV) issues.push({ level: "error", message: `NhatKy ${n.MaNK || n.__row}: thiếu MaCV` });
    if (!n.TienDo) issues.push({ level: "warning", message: `NhatKy ${n.MaNK || n.__row}: thiếu TienDo` });
  });

  const khCodes = new Set(khachhang.map(k => String(k.MaKH).toLowerCase()));
  const userEmails = new Set(users.map(u => String(u.Email).toLowerCase()));
  const cvCodes = new Set(congviec.map(c => String(c.MaCV)));

  congviec.forEach(c => {
    if (c.MaKH && !khCodes.has(String(c.MaKH).toLowerCase())) {
      issues.push({ level: "error", message: `CongViec ${c.MaCV}: MaKH "${c.MaKH}" không tồn tại trong KhachHang` });
    }
    const cbtd1 = c.CBTD1 || c.Email_CBTD;
    if (cbtd1 && !userEmails.has(String(cbtd1).toLowerCase())) {
      issues.push({ level: "error", message: `CongViec ${c.MaCV}: CBTD1 "${cbtd1}" không tồn tại trong Users` });
    }
    if (c.CBTD2 && !userEmails.has(String(c.CBTD2).toLowerCase())) {
      issues.push({ level: "error", message: `CongViec ${c.MaCV}: CBTD2 "${c.CBTD2}" không tồn tại trong Users` });
    }
  });
  nhatky.forEach(n => {
    if (n.MaCV && !cvCodes.has(String(n.MaCV))) {
      issues.push({ level: "error", message: `NhatKy ${n.MaNK}: MaCV "${n.MaCV}" không tồn tại trong CongViec` });
    }
  });

  const errors = issues.filter(i => i.level === "error").length;
  const warnings = issues.filter(i => i.level === "warning").length;

  return {
    connected: true,
    dbName: dbName,
    sheets: sheetReports,
    issues: issues,
    summary: { errors, warnings }
  };
}

function checkDuplicates(rows, keyField, sheetLabel, issues) {
  const seen = {};
  rows.forEach(r => {
    const key = String(r[keyField] || "").trim().toLowerCase();
    if (!key) return;
    if (seen[key]) {
      issues.push({ level: "error", message: `${sheetLabel}: ${keyField} "${r[keyField]}" bị trùng lặp (dòng ${seen[key]} và ${r.__row})` });
    } else {
      seen[key] = r.__row;
    }
  });
}
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action;
  // Nếu có ?action=... thì trả về API JSON
  if (action) {
    return handleRequest(action, params);
  }
  // Nếu truy cập bình thường thì hiển thị giao diện Web App
  return serveIndexHtml();
}