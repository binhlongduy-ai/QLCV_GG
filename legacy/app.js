/**
 * ============================================================================
 *  QLCV CBTD – Frontend Application
 * ============================================================================
 *  SPA với hash-based routing, gọi API Google Apps Script,
 *  Chart.js dashboard, phân quyền UI theo role, lọc đa tiêu chí CBTD & Khách hàng.
 * ============================================================================
 */

// ═══════════════════════════════════════════════════════════════════════════
//  CẤU HÌNH API & DANH MỤC CHUẨN
// ═══════════════════════════════════════════════════════════════════════════

const _DEFAULT_API_URL = "YOUR_DEPLOYED_WEB_APP_URL_HERE";

const API_URL = (() => {
  if (typeof window === "undefined") return _DEFAULT_API_URL;

  const path = window.location.pathname || "";
  const looksLikeGasExec = /\/exec$/.test(path);
  const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(window.location.origin);

  if (looksLikeGasExec && !isLocalDev) {
    return window.location.origin + path;
  }
  return _DEFAULT_API_URL;
})();

/**
 * Danh mục công việc chuẩn của Cán bộ Tín dụng (List cơ bản NV theo Note 14/08)
 */
const DANH_MUC_CONG_VIEC_MAU = [
  "Tiếp cận & Thu thập hồ sơ pháp lý, hồ sơ tài chính KHDN",
  "Kiểm tra thực địa & Thẩm định phương án sản xuất kinh doanh",
  "Định giá & Thẩm định tài sản bảo đảm (BĐS / Phương tiện / Máy móc)",
  "Lập Tờ trình Thẩm định Tín dụng & Đề xuất hạn mức cho vay",
  "Trình Phê duyệt Tín dụng (KSV / BGĐ / Hội đồng Tín dụng)",
  "Soạn thảo Hợp đồng Tín dụng, Hợp đồng Thế chấp & Khế ước nhận nợ",
  "Thực hiện Công chứng hợp đồng & Đăng ký Giao dịch bảo đảm",
  "Kiểm tra điều kiện tiên quyết & Hoàn tất thủ tục giải ngân vốn",
  "Kiểm tra sử dụng vốn vay sau giải ngân (Định kỳ 30 / 60 / 90 ngày)",
  "Tái thẩm định & Đánh giá xếp hạng tín nhiệm khách hàng định kỳ",
  "Gia hạn nợ / Cơ cấu lại thời hạn trả nợ theo quy định",
  "Nhắc nợ, đôn đốc & Xử lý thu hồi nợ đến hạn / nợ quá hạn",
  "Xử lý tài sản bảo đảm & Hoàn thiện hồ sơ xử lý rủi ro (XLRR)"
];

// ═══════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════
let currentUser = null;    // { email, role, tenCanbo }
let currentPage = "dashboard";

// Cache data
let dataCongViec = [];
let dataCongViecAll = [];   // data gốc, không bị filter ghi đè
let dataNhatKy = [];
let dataKhachHang = [];
let dataNguoiDung = [];
let dataDashboard = null;
let currentStats = null;

// Dashboard Filter State
let dashboardFilter = {
  cbtd: "",
  maKH: ""
};

// Import staging data
let importDataND = [];
let importDataKH = [];

// Chart instances
let chartTrangThai = null;
let chartCBTD = null;

// ═══════════════════════════════════════════════════════════════════════════
//  API SERVICE
// ═══════════════════════════════════════════════════════════════════════════

async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  try {
    const resp = await fetch(url.toString());
    const data = await resp.json();
    if (data.status === "error") throw new Error(data.message);
    return data.data;
  } catch (err) {
    showToast(err.message, "error");
    throw err;
  }
}

async function apiPost(action, body = {}) {
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action, ...body })
    });
    const data = await resp.json();
    if (data.status === "error") throw new Error(data.message);
    return data;
  } catch (err) {
    showToast(err.message, "error");
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DEMO MODE (offline khi chưa deploy API)
// ═══════════════════════════════════════════════════════════════════════════

const DEMO_MODE = API_URL.includes("YOUR_DEPLOYED");

const DEMO_DATA = {
  users: [
    { Email: "admin@example.com", TenCanbo: "Nguyễn Văn Quản Trị", Role: "Admin" },
    { Email: "cbtd01@example.com", TenCanbo: "Trần Thị Cán Bộ 1", Role: "CBTD" },
    { Email: "cbtd02@example.com", TenCanbo: "Lê Văn Cán Bộ 2", Role: "CBTD" },
    { Email: "ksv01@example.com", TenCanbo: "Phạm Văn Kiểm Soát 1", Role: "KSV" },
    { Email: "bgd01@example.com", TenCanbo: "Hoàng Văn Giám Đốc", Role: "BGD" }
  ],
  khachhang: [
    { MaKH: "KH001", TenKH: "Công ty TNHH ABC", NhomKH: "Doanh nghiệp", LoaiKH: "Quản lý", NhomNo: "Nhóm 1" },
    { MaKH: "KH002", TenKH: "Nguyễn Văn A", NhomKH: "Cá nhân", LoaiKH: "Đang phát triển", NhomNo: "Chưa dư nợ" },
    { MaKH: "KH003", TenKH: "Trần Thị B", NhomKH: "Cá nhân", LoaiKH: "Đang phát triển", NhomNo: "Nhóm 2" },
    { MaKH: "KH004", TenKH: "Công ty CP XYZ", NhomKH: "Doanh nghiệp", LoaiKH: "Xử lý nợ", NhomNo: "Nhóm 5" },
    { MaKH: "KH005", TenKH: "Hộ KD Minh Tâm", NhomKH: "Hộ kinh doanh", LoaiKH: "Quản lý", NhomNo: "Nhóm 1" }
  ],
  congviec: [
    { MaCV: "CV001", MaKH: "KH001", NoiDung: "Thẩm định hồ sơ vay vốn kinh doanh", CBTD1: "cbtd01@example.com", CBTD2: "cbtd02@example.com", Email_CBTD: "cbtd01@example.com", HanChot: "2026-08-20T17:00:00", TrangThai: "Đang xử lý", Mucdo: "Ưu tiên", DienGiai: "Khách hàng cần giải ngân gấp trước ngày 25 để nhập lô hàng mới" },
    { MaCV: "CV002", MaKH: "KH002", NoiDung: "Xét duyệt khoản vay tiêu dùng", CBTD1: "cbtd01@example.com", CBTD2: "", Email_CBTD: "cbtd01@example.com", HanChot: "2026-08-10T17:00:00", TrangThai: "Mới giao", Mucdo: "Bình thường", DienGiai: "Đã thu thập đầy đủ CCCD và sao kê lương 6 tháng gần nhất" },
    { MaCV: "CV003", MaKH: "KH003", NoiDung: "Thu thập hồ sơ tài sản đảm bảo", CBTD1: "cbtd02@example.com", CBTD2: "cbtd01@example.com", Email_CBTD: "cbtd02@example.com", HanChot: "2026-08-25T17:00:00", TrangThai: "Chờ duyệt", Mucdo: "Ưu tiên", DienGiai: "Đang đợi văn phòng công chứng trả kết quả trích lục sổ đỏ" },
    { MaCV: "CV004", MaKH: "KH004", NoiDung: "Giải ngân khoản vay dự án", CBTD1: "cbtd02@example.com", CBTD2: "", Email_CBTD: "cbtd02@example.com", HanChot: "2026-08-18T17:00:00", TrangThai: "Hoàn thành", Mucdo: "Ưu tiên", DienGiai: "Đã ký kết hợp đồng tín dụng và giải ngân vốn đợt 1 thành công" },
    { MaCV: "CV005", MaKH: "KH001", NoiDung: "Tái thẩm định hồ sơ gia hạn", CBTD1: "cbtd01@example.com", CBTD2: "", Email_CBTD: "cbtd01@example.com", HanChot: "2026-08-12T17:00:00", TrangThai: "Từ chối", Mucdo: "Khác", DienGiai: "Báo cáo tài chính quý gần nhất suy giảm, không đạt điều kiện gia hạn" },
    { MaCV: "CV006", MaKH: "KH005", NoiDung: "Đánh giá năng lực tài chính", CBTD1: "cbtd01@example.com", CBTD2: "cbtd02@example.com", Email_CBTD: "cbtd01@example.com", HanChot: "2026-08-30T17:00:00", TrangThai: "Mới giao", Mucdo: "Bình thường", DienGiai: "Hẹn gặp chủ hộ kinh doanh tại cơ sở buôn bán vào thứ Hai tới" },
    { MaCV: "CV007", MaKH: "KH002", NoiDung: "Kiểm tra mục đích sử dụng vốn", CBTD1: "cbtd02@example.com", CBTD2: "", Email_CBTD: "cbtd02@example.com", HanChot: "2026-08-05T17:00:00", TrangThai: "Đang xử lý", Mucdo: "Bình thường", DienGiai: "Đã kiểm tra thực địa, hoá đơn chứng từ mua sắm máy móc đầy đủ" }
  ],
  nhatky: [
    { MaNK: "NK001", MaCV: "CV001", TienDo: "Đã thu thập hồ sơ pháp lý doanh nghiệp", ThoiGian: "2026-08-10T09:00:00", KSV_Duyet: true, ThoiGian_Duyet: "2026-08-10T14:00:00", EmailCBTD: "cbtd01@example.com" },
    { MaNK: "NK002", MaCV: "CV001", TienDo: "Hoàn thành định giá tài sản đảm bảo", ThoiGian: "2026-08-12T10:30:00", KSV_Duyet: false, ThoiGian_Duyet: "", EmailCBTD: "cbtd02@example.com" },
    { MaNK: "NK003", MaCV: "CV003", TienDo: "Đã liên hệ khách hàng thu thập giấy tờ", ThoiGian: "2026-08-11T08:00:00", KSV_Duyet: false, ThoiGian_Duyet: "", EmailCBTD: "cbtd02@example.com" },
    { MaNK: "NK004", MaCV: "CV002", TienDo: "Đã xác minh thu nhập và lịch sử tín dụng", ThoiGian: "2026-08-13T15:00:00", KSV_Duyet: true, ThoiGian_Duyet: "2026-08-13T16:30:00", EmailCBTD: "cbtd01@example.com" },
    { MaNK: "NK005", MaCV: "CV007", TienDo: "Kiểm tra thực tế tại cơ sở kinh doanh", ThoiGian: "2026-08-14T09:30:00", KSV_Duyet: false, ThoiGian_Duyet: "", EmailCBTD: "cbtd02@example.com" }
  ]
};

function demoGet(action, params = {}) {
  switch (action) {
    case "login": {
      const email = (params.email || "").toLowerCase().trim();
      const user = DEMO_DATA.users.find(u => u.Email.toLowerCase() === email);
      if (!user) throw new Error("Email không tồn tại trong hệ thống");
      return {
        email: user.Email,
        tenCanbo: user.TenCanbo || user.Email.split("@")[0],
        role: user.Role
      };
    }
    case "getUsers":
      return DEMO_DATA.users;
    case "getKhachHang":
      return DEMO_DATA.khachhang;
    case "getCongViec": {
      let list = DEMO_DATA.congviec;
      if (params.role === "CBTD" && params.email) {
        const myEmail = params.email.toLowerCase();
        list = list.filter(cv =>
          (cv.CBTD1 && cv.CBTD1.toLowerCase() === myEmail) ||
          (cv.CBTD2 && cv.CBTD2.toLowerCase() === myEmail) ||
          (cv.Email_CBTD && cv.Email_CBTD.toLowerCase() === myEmail)
        );
      }
      if (params.cbtd) {
        const target = params.cbtd.toLowerCase();
        list = list.filter(cv =>
          (cv.CBTD1 && cv.CBTD1.toLowerCase() === target) ||
          (cv.CBTD2 && cv.CBTD2.toLowerCase() === target) ||
          (cv.Email_CBTD && cv.Email_CBTD.toLowerCase() === target)
        );
      }
      if (params.maKH) {
        list = list.filter(cv => String(cv.MaKH).toLowerCase() === String(params.maKH).toLowerCase());
      }
      return list;
    }
    case "getNhatKy": {
      let list = DEMO_DATA.nhatky;
      if (params.maCV) {
        list = list.filter(nk => nk.MaCV === params.maCV);
      }
      if (params.cbtd || params.maKH) {
        const cvMap = {};
        DEMO_DATA.congviec.forEach(c => {
          cvMap[c.MaCV] = {
            CBTD1: (c.CBTD1 || c.Email_CBTD || "").toLowerCase(),
            CBTD2: (c.CBTD2 || "").toLowerCase(),
            MaKH: (c.MaKH || "").toLowerCase()
          };
        });
        if (params.cbtd) {
          const t = params.cbtd.toLowerCase();
          list = list.filter(n => cvMap[n.MaCV] && (cvMap[n.MaCV].CBTD1 === t || cvMap[n.MaCV].CBTD2 === t));
        }
        if (params.maKH) {
          const t = params.maKH.toLowerCase();
          list = list.filter(n => cvMap[n.MaCV] && cvMap[n.MaCV].MaKH === t);
        }
      }
      return list;
    }
    case "getAllNhatKy":
      return DEMO_DATA.nhatky;
    case "checkIntegrity": {
      const cv = DEMO_DATA.congviec;
      const kh = DEMO_DATA.khachhang;
      const users = DEMO_DATA.users;
      const nk = DEMO_DATA.nhatky;
      const issues = [];

      const khCodes = new Set(kh.map(k => k.MaKH.toLowerCase()));
      const userEmails = new Set(users.map(u => u.Email.toLowerCase()));
      const cvCodes = new Set(cv.map(c => c.MaCV));

      cv.forEach(c => {
        if (c.MaKH && !khCodes.has(c.MaKH.toLowerCase())) {
          issues.push({ level: "error", message: `CongViec ${c.MaCV}: MaKH "${c.MaKH}" không tồn tại trong KhachHang` });
        }
        const cbtd1 = c.CBTD1 || c.Email_CBTD;
        if (cbtd1 && !userEmails.has(cbtd1.toLowerCase())) {
          issues.push({ level: "error", message: `CongViec ${c.MaCV}: CBTD1 "${cbtd1}" không tồn tại trong Users` });
        }
        if (c.CBTD2 && !userEmails.has(c.CBTD2.toLowerCase())) {
          issues.push({ level: "error", message: `CongViec ${c.MaCV}: CBTD2 "${c.CBTD2}" không tồn tại trong Users` });
        }
      });
      nk.forEach(n => {
        if (n.MaCV && !cvCodes.has(n.MaCV)) {
          issues.push({ level: "error", message: `NhatKy ${n.MaNK}: MaCV "${n.MaCV}" không tồn tại trong CongViec` });
        }
      });

      const errors = issues.filter(i => i.level === "error").length;
      const warnings = issues.filter(i => i.level === "warning").length;

      return {
        connected: true,
        dbName: "DEMO_DATA (chưa kết nối DB_QLCV_CBTD thật)",
        sheets: [
          { name: "Users", exists: true, headersOk: true, missingHeaders: [], rowCount: users.length },
          { name: "CongViec", exists: true, headersOk: true, missingHeaders: [], rowCount: cv.length },
          { name: "NhatKy", exists: true, headersOk: true, missingHeaders: [], rowCount: nk.length },
          { name: "KhachHang", exists: true, headersOk: true, missingHeaders: [], rowCount: kh.length }
        ],
        issues,
        summary: { errors, warnings }
      };
    }
    case "getDashboard": {
      let cv = DEMO_DATA.congviec;
      const kh = DEMO_DATA.khachhang;
      let nk = DEMO_DATA.nhatky;
      const now = new Date();

      if (params.cbtd) {
        const t = params.cbtd.toLowerCase();
        cv = cv.filter(c => (c.CBTD1 && c.CBTD1.toLowerCase() === t) || (c.CBTD2 && c.CBTD2.toLowerCase() === t) || (c.Email_CBTD && c.Email_CBTD.toLowerCase() === t));
      }
      if (params.maKH) {
        cv = cv.filter(c => String(c.MaKH).toLowerCase() === String(params.maKH).toLowerCase());
      }

      const trangThaiStats = {};
      cv.forEach(c => { trangThaiStats[c.TrangThai] = (trangThaiStats[c.TrangThai] || 0) + 1; });

      const cbtdStats = {};
      cv.forEach(c => {
        const c1 = c.CBTD1 || c.Email_CBTD;
        if (c1) cbtdStats[c1] = (cbtdStats[c1] || 0) + 1;
        if (c.CBTD2 && c.CBTD2 !== c1) {
          cbtdStats[c.CBTD2] = (cbtdStats[c.CBTD2] || 0) + 1;
        }
      });

      const treHan = cv.filter(c =>
        c.TrangThai !== "Hoàn thành" && c.TrangThai !== "Từ chối" &&
        c.HanChot && new Date(c.HanChot) < now
      );

      const chuaDuyet = nk.filter(n => !n.KSV_Duyet);
      const hoanThanh = cv.filter(c => c.TrangThai === "Hoàn thành").length;
      const tyLeDungHan = cv.length > 0 ? Math.round(((cv.length - treHan.length) / cv.length) * 100) : 100;

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
    default:
      return {};
  }
}

async function fetchData(action, params = {}) {
  if (DEMO_MODE) {
    return demoGet(action, params);
  }
  return await apiGet(action, params);
}

function demoSyncToDb(body) {
  function upsert(list, keyField, incoming, mapFn) {
    let inserted = 0, updated = 0;
    (incoming || []).forEach(item => {
      const key = item[keyField];
      if (!key) return;
      const existing = list.find(x => String(x[keyField]).toLowerCase() === String(key).toLowerCase());
      if (existing) {
        Object.assign(existing, mapFn(item));
        updated++;
      } else {
        list.push(mapFn(item));
        inserted++;
      }
    });
    return { inserted, updated };
  }

  return {
    congviec: upsert(DEMO_DATA.congviec, "MaCV", body.congviec, c => ({
      MaCV: c.MaCV, MaKH: c.MaKH, NoiDung: c.NoiDung, CBTD1: c.CBTD1 || c.Email_CBTD || "",
      CBTD2: c.CBTD2 || "", Email_CBTD: c.CBTD1 || c.Email_CBTD || "",
      HanChot: c.HanChot, TrangThai: c.TrangThai, Mucdo: c.Mucdo, DienGiai: c.DienGiai
    })),
    khachhang: upsert(DEMO_DATA.khachhang, "MaKH", body.khachhang, k => ({
      MaKH: k.MaKH, TenKH: k.TenKH, NhomKH: k.NhomKH, LoaiKH: k.LoaiKH, NhomNo: k.NhomNo
    })),
    nguoidung: upsert(DEMO_DATA.users, "Email", body.nguoidung, u => ({
      Email: u.Email, TenCanbo: u.TenCanbo, Role: u.Role
    })),
    nhatky: upsert(DEMO_DATA.nhatky, "MaNK", body.nhatky, n => ({
      MaNK: n.MaNK, MaCV: n.MaCV, TienDo: n.TienDo,
      ThoiGian: n.ThoiGian, KSV_Duyet: n.KSV_Duyet, ThoiGian_Duyet: n.ThoiGian_Duyet,
      EmailCBTD: n.EmailCBTD || ""
    }))
  };
}

async function postData(action, body = {}) {
  if (DEMO_MODE) {
    switch (action) {
      case "addCongViec": {
        const existing = DEMO_DATA.congviec.find(c => c.MaCV.toLowerCase() === body.maCV.toLowerCase());
        if (existing) throw new Error("Mã CV đã tồn tại");
        DEMO_DATA.congviec.push({
          MaCV: body.maCV,
          MaKH: body.maKH || "",
          NoiDung: body.noiDung,
          CBTD1: body.cbtd1 || body.emailCBTD || "",
          CBTD2: body.cbtd2 || "",
          Email_CBTD: body.cbtd1 || body.emailCBTD || "",
          HanChot: body.hanChot || "",
          TrangThai: body.trangThai || "Mới giao",
          Mucdo: body.mucDo || body.mucdo || "Bình thường",
          DienGiai: body.dienGiai || ""
        });
        return { status: "success" };
      }
      case "updateCongViec": {
        const cv = DEMO_DATA.congviec.find(c => c.MaCV === body.maCV);
        if (!cv) throw new Error("Không tìm thấy CV");
        if (body.noiDung !== undefined) cv.NoiDung = body.noiDung;
        if (body.maKH !== undefined) cv.MaKH = body.maKH;
        if (body.cbtd1 !== undefined) cv.CBTD1 = body.cbtd1;
        if (body.cbtd2 !== undefined) cv.CBTD2 = body.cbtd2;
        if (body.cbtd1 !== undefined || body.emailCBTD !== undefined) cv.Email_CBTD = body.cbtd1 || body.emailCBTD;
        if (body.hanChot !== undefined) cv.HanChot = body.hanChot;
        if (body.trangThai !== undefined) cv.TrangThai = body.trangThai;
        if (body.mucDo !== undefined || body.mucdo !== undefined) cv.Mucdo = body.mucDo || body.mucdo;
        if (body.dienGiai !== undefined) cv.DienGiai = body.dienGiai;
        return { status: "success" };
      }
      case "updateTrangThai": {
        const cv = DEMO_DATA.congviec.find(c => c.MaCV === body.maCV);
        if (cv) cv.TrangThai = body.trangThai;
        return { status: "success" };
      }
      case "updateDienGiai": {
        const cv = DEMO_DATA.congviec.find(c => c.MaCV === body.maCV);
        if (cv) cv.DienGiai = body.dienGiai;
        return { status: "success" };
      }
      case "addNhatKy": {
        DEMO_DATA.nhatky.unshift({
          MaNK: body.maNK,
          MaCV: body.maCV,
          TienDo: body.tienDo,
          ThoiGian: new Date().toISOString(),
          KSV_Duyet: false,
          ThoiGian_Duyet: "",
          EmailCBTD: currentUser ? currentUser.email : (body.emailCBTD || "")
        });
        return { status: "success" };
      }
      case "duyetTienDo": {
        const nk = DEMO_DATA.nhatky.find(n => n.MaNK === body.maNK);
        if (nk) {
          nk.KSV_Duyet = true;
          nk.ThoiGian_Duyet = new Date().toISOString();
        }
        return { status: "success" };
      }
      case "addKhachHang": {
        DEMO_DATA.khachhang.push({
          MaKH: body.maKH,
          TenKH: body.tenKH,
          NhomKH: body.nhomKH || "Doanh nghiệp",
          LoaiKH: body.loaiKH || "Đang phát triển",
          NhomNo: body.nhomNo || "Chưa dư nợ"
        });
        return { status: "success" };
      }
      case "updateKhachHang": {
        const kh = DEMO_DATA.khachhang.find(k => k.MaKH === body.maKH);
        if (kh) {
          if (body.tenKH !== undefined) kh.TenKH = body.tenKH;
          if (body.nhomKH !== undefined) kh.NhomKH = body.nhomKH;
          if (body.loaiKH !== undefined) kh.LoaiKH = body.loaiKH;
          if (body.nhomNo !== undefined) kh.NhomNo = body.nhomNo;
        }
        return { status: "success" };
      }
      case "deleteKhachHang": {
        DEMO_DATA.khachhang = DEMO_DATA.khachhang.filter(k => k.MaKH !== body.maKH);
        return { status: "success" };
      }
      case "addUser": {
        DEMO_DATA.users.push({
          Email: body.email,
          TenCanbo: body.tenCanbo || "",
          Role: body.role
        });
        return { status: "success" };
      }
      case "updateUser": {
        const u = DEMO_DATA.users.find(x => x.Email.toLowerCase() === body.email.toLowerCase());
        if (u) {
          if (body.tenCanbo !== undefined) u.TenCanbo = body.tenCanbo;
          if (body.role !== undefined) u.Role = body.role;
        }
        return { status: "success" };
      }
      case "deleteUser": {
        DEMO_DATA.users = DEMO_DATA.users.filter(x => x.Email.toLowerCase() !== body.email.toLowerCase());
        return { status: "success" };
      }
      case "syncToDb": {
        return { status: "success", data: demoSyncToDb(body) };
      }
      default:
        return { status: "success" };
    }
  }
  return await apiPost(action, body);
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTHENTICATION & SESSION
// ═══════════════════════════════════════════════════════════════════════════

async function handleLogin(e) {
  if (e) e.preventDefault();
  const errorEl = document.getElementById("loginError");
  errorEl.style.display = "none";

  let emailToAuth = "";
  if (!DEMO_MODE && window.AUTH_USER_EMAIL) {
    emailToAuth = window.AUTH_USER_EMAIL;
  } else {
    emailToAuth = document.getElementById("loginEmail").value.trim();
  }

  if (!emailToAuth) {
    errorEl.textContent = "Vui lòng nhập email hoặc đăng nhập Google";
    errorEl.style.display = "block";
    return false;
  }

  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  btn.textContent = "Đang xác thực...";

  try {
    const user = await fetchData("login", { email: emailToAuth });
    currentUser = user;
    localStorage.setItem("qlcv_user", JSON.stringify(user));
    showApp();
    showToast(`Xin chào ${user.tenCanbo || user.email}! (${user.role})`, "success");
  } catch (err) {
    errorEl.textContent = err.message || "Đăng nhập thất bại";
    errorEl.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Đăng nhập";
  }
  return false;
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem("qlcv_user");

  dataCongViec = [];
  dataCongViecAll = [];
  dataNhatKy = [];
  dataKhachHang = [];
  dataNguoiDung = [];
  dataDashboard = null;
  currentStats = null;
  if (window._nhatKyCache) window._nhatKyCache = {};

  document.getElementById("loginPage").style.display = "";
  document.getElementById("appLayout").classList.remove("active");
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginError").style.display = "none";
}

function checkSession() {
  const saved = localStorage.getItem("qlcv_user");
  if (saved) {
    try {
      const cached = JSON.parse(saved);
      currentUser = cached;
      showApp();
      verifySessionWithBackend(cached);
    } catch { handleLogout(); }
  }
}

async function verifySessionWithBackend(cached) {
  try {
    const fresh = await fetchData("login", { email: cached.email });
    if (fresh && fresh.role !== cached.role) {
      currentUser = fresh;
      localStorage.setItem("qlcv_user", JSON.stringify(fresh));
      const roleEl = document.getElementById("userRole");
      if (roleEl) roleEl.textContent = fresh.role;
    }
  } catch (err) {
    console.warn("Session verification failed:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  APP INITIALIZATION & ROUTING
// ═══════════════════════════════════════════════════════════════════════════

function showApp() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("appLayout").classList.add("active");

  const displayName = currentUser.tenCanbo || currentUser.email;
  const dispEl = document.getElementById("userDisplayName");
  if (dispEl) dispEl.textContent = displayName;
  document.getElementById("userEmail").textContent = currentUser.email;
  document.getElementById("userRole").textContent = currentUser.role;
  document.getElementById("userAvatar").textContent = displayName.charAt(0).toUpperCase();

  setupRolePermissions();
  preloadCommonData();

  const initialHash = window.location.hash.replace(/^#/, "");
  const initialPage = (initialHash.split("?")[0] || "dashboard");
  navigateTo(initialPage);
}

function setupRolePermissions() {
  const role = currentUser.role;
  const showAdmin = role === "Admin";
  const adminLabel = document.getElementById("navAdminLabel");
  const adminNav = document.getElementById("navNguoiDung");
  const csdlNav = document.getElementById("navCSDL");
  if (adminLabel) adminLabel.style.display = showAdmin ? "" : "none";
  if (adminNav) adminNav.style.display = showAdmin ? "" : "none";
  if (csdlNav) csdlNav.style.display = showAdmin ? "" : "none";
}

async function preloadCommonData() {
  try {
    const [kh, users] = await Promise.all([
      fetchData("getKhachHang"),
      currentUser.role === "Admin" ? fetchData("getUsers") : fetchData("getUsers").catch(() => DEMO_DATA.users)
    ]);
    dataKhachHang = kh || [];
    dataNguoiDung = users || [];
    populateDropdowns();
  } catch (e) {
    console.warn("Preload common data warning:", e.message);
  }
}

function navigateTo(page) {
  currentPage = page;

  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  document.querySelectorAll(".page-section").forEach(el => {
    el.classList.toggle("active", el.id === "page-" + page);
  });

  switch (page) {
    case "dashboard": loadDashboard(); break;
    case "congviec": loadCongViec(); break;
    case "nhatky": loadNhatKy(); break;
    case "khachhang": loadKhachHang(); break;
    case "nguoidung": loadNguoiDung(); break;
    case "csdl": break;
  }

  const currentHash = window.location.hash.replace(/^#/, "");
  const [hashPage] = currentHash.split("?");
  if (hashPage !== page) {
    window.location.hash = page;
  }
}

function getHashParams() {
  const hash = window.location.hash.replace(/^#/, "");
  const idx = hash.indexOf("?");
  if (idx === -1) return {};
  const qs = hash.slice(idx + 1);
  const out = {};
  qs.split("&").forEach(pair => {
    if (!pair) return;
    const [k, v = ""] = pair.split("=");
    try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " ")); }
    catch { out[k] = v; }
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DROPDOWN POPULATION & ID GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

function genNextId(prefix, existingIds = []) {
  let maxNum = 0;
  existingIds.forEach(id => {
    if (!id || typeof id !== "string") return;
    const match = id.match(new RegExp(`^${prefix}(\\d+)`, "i"));
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  return prefix + String(maxNum + 1).padStart(3, "0");
}

function populateDropdowns() {
  // 1. Khách hàng dropdowns
  const khOptions = (dataKhachHang || []).map(k =>
    `<option value="${esc(k.MaKH)}">[${esc(k.MaKH)}] ${esc(k.TenKH)}</option>`
  ).join("");

  const elFrmCV_KH = document.getElementById("frmCV_MaKH");
  if (elFrmCV_KH) {
    elFrmCV_KH.innerHTML = '<option value="">-- Chọn khách hàng (Bắt buộc) --</option>' + khOptions;
  }

  const elFilterCV_KH = document.getElementById("filterCongViecKH");
  if (elFilterCV_KH) {
    elFilterCV_KH.innerHTML = '<option value="">Tất cả Khách hàng</option>' + khOptions;
  }

  const elFilterNK_KH = document.getElementById("filterNhatKyKH");
  if (elFilterNK_KH) {
    elFilterNK_KH.innerHTML = '<option value="">Tất cả Khách hàng</option>' + khOptions;
  }

  const elFilterDash_KH = document.getElementById("selectFilterDashboardKH");
  if (elFilterDash_KH) {
    elFilterDash_KH.innerHTML = '<option value="">Tất cả Khách hàng</option>' + khOptions;
  }

  // 2. Danh mục công việc chuẩn mẫu
  const elFrmCV_Mau = document.getElementById("frmCV_NoiDungMau");
  if (elFrmCV_Mau) {
    elFrmCV_Mau.innerHTML = '<option value="">-- Chọn danh mục công việc chuẩn CBTD --</option>' +
      DANH_MUC_CONG_VIEC_MAU.map((m, i) => `<option value="${esc(m)}">${i + 1}. ${esc(m)}</option>`).join("");
  }

  // 3. CBTD dropdowns (Lọc role CBTD)
  const cbtdUsers = (dataNguoiDung || []).filter(u => u.Role === "CBTD" || !u.Role);
  const cbtdOptions = cbtdUsers.map(u =>
    `<option value="${esc(u.Email)}">${esc(u.TenCanbo || u.Email.split("@")[0])} (${esc(u.Email)})</option>`
  ).join("");

  const elFrmCV_CBTD1 = document.getElementById("frmCV_CBTD1");
  if (elFrmCV_CBTD1) {
    elFrmCV_CBTD1.innerHTML = '<option value="">-- Chọn CBTD 1 (Chủ trì) --</option>' + cbtdOptions;
  }

  const elFrmCV_CBTD2 = document.getElementById("frmCV_CBTD2");
  if (elFrmCV_CBTD2) {
    elFrmCV_CBTD2.innerHTML = '<option value="">-- Không có cán bộ hợp công --</option>' + cbtdOptions;
  }

  const elFilterCV_CBTD = document.getElementById("filterCongViecCBTD");
  if (elFilterCV_CBTD) {
    elFilterCV_CBTD.innerHTML = '<option value="">Tất cả CBTD</option>' + cbtdOptions;
  }

  const elFilterNK_CBTD = document.getElementById("filterNhatKyCBTD");
  if (elFilterNK_CBTD) {
    elFilterNK_CBTD.innerHTML = '<option value="">Tất cả CBTD</option>' + cbtdOptions;
  }

  const elFilterDash_CBTD = document.getElementById("selectFilterDashboardCBTD");
  if (elFilterDash_CBTD) {
    elFilterDash_CBTD.innerHTML = '<option value="">Tất cả CBTD</option>' + cbtdOptions;
  }
}

function onSelectNoiDungMau() {
  const select = document.getElementById("frmCV_NoiDungMau");
  const textarea = document.getElementById("frmCV_NoiDung");
  if (select && textarea && select.value) {
    textarea.value = select.value;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DASHBOARD (BGĐ Insights & Interactive Filter)
// ═══════════════════════════════════════════════════════════════════════════

async function loadDashboard() {
  try {
    const params = {
      email: currentUser.email,
      role: currentUser.role,
      cbtd: dashboardFilter.cbtd,
      maKH: dashboardFilter.maKH
    };
    dataDashboard = await fetchData("getDashboard", params);
    renderDashboard(dataDashboard);
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function renderDashboard(d) {
  currentStats = {
    tong: d.tongCongViec || 0,
    hoanThanh: d.hoanThanh || (d.trangThaiStats && d.trangThaiStats["Hoàn thành"]) || 0,
    dangXuLy: (d.trangThaiStats && d.trangThaiStats["Đang xử lý"]) || 0,
    chuaBatDau: (d.trangThaiStats && d.trangThaiStats["Mới giao"]) || 0,
    tuChoi: (d.trangThaiStats && d.trangThaiStats["Từ chối"]) || 0,
    quaHan: d.treHan || 0,
    tyLeDungHan: d.tyLeDungHan || 100,
    byTrangThai: d.trangThaiStats || {},
    byCBTD: d.cbtdStats || {}
  };

  // Stats Card
  document.getElementById("statTongCV").textContent = d.tongCongViec || 0;
  document.getElementById("statHoanThanh").textContent = currentStats.hoanThanh;
  document.getElementById("statTyLeDungHan").textContent = (d.tyLeDungHan !== undefined ? d.tyLeDungHan : 100) + "%";
  document.getElementById("statChuaDuyet").textContent = d.chuaDuyet || 0;
  document.getElementById("statTreHan").textContent = d.treHan || 0;
  document.getElementById("statTongKH").textContent = d.tongKhachHang || 0;

  // Badges
  updateBadge("badgeNhatKy", d.chuaDuyet);
  updateBadge("badgeCongViec", d.treHan);

  // Charts
  renderChartTrangThai(d.trangThaiStats || {});
  renderChartCBTD(d.cbtdStats || {});

  // BGĐ KPI Breakdowns
  renderBGDKPIBreakdowns(d.loaiKHStats || {}, d.nhomNoStats || {});

  // Table: Trễ hạn
  const tbody = document.getElementById("tableTreHan");
  if (d.dsCongViecTreHan && d.dsCongViecTreHan.length > 0) {
    tbody.innerHTML = d.dsCongViecTreHan.map(cv => {
      const kh = dataKhachHang.find(k => k.MaKH === cv.MaKH);
      const khName = kh ? kh.TenKH : cv.MaKH;
      const cbtdText = cv.CBTD2 ? `${esc(cv.CBTD1 || cv.Email_CBTD)} & ${esc(cv.CBTD2)}` : esc(cv.CBTD1 || cv.Email_CBTD);
      return `
        <tr>
          <td><strong>${esc(cv.MaCV)}</strong></td>
          <td><div class="khachhang-cell"><span class="khachhang-code">${esc(cv.MaKH)}</span><span class="khachhang-name">${esc(khName)}</span></div></td>
          <td>${esc(cv.NoiDung)}</td>
          <td><span class="cbtd-primary">${cbtdText}</span></td>
          <td><span style="color:var(--danger);font-weight:600">${formatDate(cv.HanChot)}</span></td>
          <td>${mucDoBadge(cv.Mucdo)}</td>
          <td>${statusBadge(cv.TrangThai)}</td>
        </tr>
      `;
    }).join("");
  } else {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>✅ Tuyệt vời! Không có công việc nào bị trễ hạn</p></td></tr>';
  }

  // Notice
  const noticeEl = document.getElementById("dashboardFilterNotice");
  if (noticeEl) {
    if (dashboardFilter.cbtd || dashboardFilter.maKH) {
      const parts = [];
      if (dashboardFilter.cbtd) parts.push(`CBTD: ${dashboardFilter.cbtd}`);
      if (dashboardFilter.maKH) parts.push(`KH: ${dashboardFilter.maKH}`);
      noticeEl.textContent = `🔍 Đang lọc: ${parts.join(" · ")}`;
      noticeEl.style.display = "";
    } else {
      noticeEl.style.display = "none";
    }
  }
}

function renderBGDKPIBreakdowns(loaiKHStats, nhomNoStats) {
  const containerLoai = document.getElementById("containerLoaiKHStats");
  if (containerLoai) {
    const entries = Object.entries(loaiKHStats);
    if (!entries.length) {
      containerLoai.innerHTML = '<p class="empty-state" style="padding:10px">Chưa có dữ liệu loại KH</p>';
    } else {
      containerLoai.innerHTML = entries.map(([k, v]) => `
        <div class="kpi-mini-card">
          <span class="kpi-val">${v}</span>
          <span class="kpi-lbl">${esc(k)}</span>
        </div>
      `).join("");
    }
  }

  const containerNo = document.getElementById("containerNhomNoStats");
  if (containerNo) {
    const entries = Object.entries(nhomNoStats);
    if (!entries.length) {
      containerNo.innerHTML = '<p class="empty-state" style="padding:10px">Chưa có dữ liệu nhóm nợ</p>';
    } else {
      containerNo.innerHTML = entries.map(([k, v]) => `
        <div class="kpi-mini-card" style="border-left-color:${k === 'XLRR' || k.includes('5') ? 'var(--danger)' : (k.includes('1') ? 'var(--success)' : 'var(--warning)')}">
          <span class="kpi-val">${v}</span>
          <span class="kpi-lbl">${esc(k)}</span>
        </div>
      `).join("");
    }
  }
}

function onDashboardFilterChange() {
  const selCBTD = document.getElementById("selectFilterDashboardCBTD");
  const selKH = document.getElementById("selectFilterDashboardKH");
  dashboardFilter.cbtd = selCBTD ? selCBTD.value : "";
  dashboardFilter.maKH = selKH ? selKH.value : "";
  loadDashboard();
}

function resetDashboardFilter() {
  const selCBTD = document.getElementById("selectFilterDashboardCBTD");
  const selKH = document.getElementById("selectFilterDashboardKH");
  if (selCBTD) selCBTD.value = "";
  if (selKH) selKH.value = "";
  dashboardFilter.cbtd = "";
  dashboardFilter.maKH = "";
  loadDashboard();
}

function refreshDashboard() {
  loadDashboard();
  showToast("Đã làm mới dữ liệu Dashboard", "info");
}

function renderChartTrangThai(stats) {
  const ctx = document.getElementById("chartTrangThai");
  const emptyEl = document.getElementById("emptyChartTrangThai");
  if (chartTrangThai) chartTrangThai.destroy();

  const labels = Object.keys(stats);
  const values = Object.values(stats);
  const colors = labels.map(l => getStatusColor(l));

  if (!labels.length || values.every(v => v === 0)) {
    if (ctx) ctx.style.display = "none";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  if (ctx) ctx.style.display = "";
  if (emptyEl) emptyEl.style.display = "none";

  chartTrangThai = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#fff",
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const trangThai = labels[elements[0].index];
        if (!trangThai) return;
        window.location.hash = `congviec?trangThai=${encodeURIComponent(trangThai)}`;
        showToast(`Đang lọc công việc: ${trangThai}`, "info");
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 16, usePointStyle: true, font: { family: "Inter", size: 12 } }
        },
        tooltip: {
          callbacks: {
            afterLabel: () => "👉 Click để xem chi tiết"
          }
        }
      }
    }
  });
}

function renderChartCBTD(stats) {
  const ctx = document.getElementById("chartCBTD");
  const emptyEl = document.getElementById("emptyChartCBTD");
  if (chartCBTD) chartCBTD.destroy();

  const emails = Object.keys(stats);
  const labels = emails.map(e => {
    const u = dataNguoiDung.find(x => x.Email.toLowerCase() === e.toLowerCase());
    return u ? u.TenCanbo : e.split("@")[0];
  });
  const values = Object.values(stats);

  if (!emails.length || values.every(v => v === 0)) {
    if (ctx) ctx.style.display = "none";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  if (ctx) ctx.style.display = "";
  if (emptyEl) emptyEl.style.display = "none";

  chartCBTD = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Số công việc phụ trách",
        data: values,
        backgroundColor: "rgba(26, 115, 232, 0.8)",
        borderColor: "#1A73E8",
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const email = emails[elements[0].index];
        if (!email) return;
        window.location.hash = `congviec?cbtd=${encodeURIComponent(email)}`;
        showToast(`Đang lọc công việc của: ${email}`, "info");
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: () => "👉 Click để xem chi tiết"
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { family: "Inter" } },
          grid: { color: "rgba(0,0,0,0.05)" }
        },
        x: {
          ticks: { font: { family: "Inter", size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CÔNG VIỆC (Hỗ trợ 2 CBTD & Bộ lọc đa tiêu chí)
// ═══════════════════════════════════════════════════════════════════════════

async function loadCongViec() {
  const tbody = document.getElementById("tableCongViec");
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-overlay"><div class="spinner dark"></div><span>Đang tải danh sách công việc…</span></td></tr>';
  }

  try {
    const hashFilter = getHashParams();
    const serverParams = {
      email: currentUser.email,
      role: currentUser.role,
      ...hashFilter
    };

    const list = await fetchData("getCongViec", serverParams);
    dataCongViec = list || [];
    dataCongViecAll = list || [];

    populateDropdowns();
    syncFilterControls();
    renderDrillBanner(hashFilter);
    renderCongViec(dataCongViec);
  } catch (err) {
    console.error("CongViec error:", err);
    showToast("Không tải được danh sách công việc: " + err.message, "error");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><div class="empty-icon">⚠️</div><p>Lỗi tải dữ liệu: ${esc(err.message)}</p></td></tr>`;
    }
  }
}

function syncFilterControls() {
  const params = getHashParams();
  const filterTrangThai = document.getElementById("filterTrangThai");
  const filterCBTD = document.getElementById("filterCongViecCBTD");
  const filterKH = document.getElementById("filterCongViecKH");
  const searchBox = document.getElementById("searchCongViec");
  if (filterTrangThai) filterTrangThai.value = params.trangThai || "";
  if (filterCBTD) filterCBTD.value = params.cbtd || "";
  if (filterKH) filterKH.value = params.maKH || "";
  if (searchBox) searchBox.value = "";
}

function renderDrillBanner(params) {
  const banner = document.getElementById("drillDownBanner");
  if (!banner) return;

  const trangThai = params.trangThai || "";
  const cbtd = params.cbtd || "";
  const maKH = params.maKH || "";

  if (trangThai || cbtd || maKH) {
    const parts = [];
    if (trangThai) parts.push(`<span class="status-badge dang-xu-ly">📊 Trạng thái: ${esc(trangThai)}</span>`);
    if (cbtd) parts.push(`<span class="status-badge moi-giao">👤 CBTD: ${esc(cbtd)}</span>`);
    if (maKH) parts.push(`<span class="status-badge cho-duyet">🏢 Mã KH: ${esc(maKH)}</span>`);
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;background:var(--info-light);border-radius:8px;margin-bottom:16px">
        <strong>🔎 Đang lọc từ Dashboard:</strong>
        ${parts.join(" ")}
        <button class="btn btn-sm btn-outline" onclick="clearDrillFilters()" style="margin-left:auto">✕ Bỏ lọc</button>
      </div>
    `;
    banner.style.display = "";
  } else {
    banner.style.display = "none";
    banner.innerHTML = "";
  }
}

function clearDrillFilters() {
  window.location.hash = "congviec";
}

function renderCongViec(data) {
  const tbody = document.getElementById("tableCongViec");
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">📋</div><p>Không có công việc nào phù hợp</p></td></tr>';
    return;
  }

  tbody.innerHTML = data.map(cv => {
    const kh = dataKhachHang.find(k => k.MaKH === cv.MaKH);
    const khName = kh ? kh.TenKH : (cv.MaKH || "–");

    const cbtd1 = cv.CBTD1 || cv.Email_CBTD || "";
    const cbtd2 = cv.CBTD2 || "";
    const u1 = dataNguoiDung.find(u => u.Email.toLowerCase() === cbtd1.toLowerCase());
    const u2 = dataNguoiDung.find(u => u.Email.toLowerCase() === cbtd2.toLowerCase());

    const name1 = u1 ? `${u1.TenCanbo}` : cbtd1.split("@")[0];
    const name2 = u2 ? `${u2.TenCanbo}` : (cbtd2 ? cbtd2.split("@")[0] : "");

    return `
      <tr>
        <td>
          <strong style="color:var(--primary);cursor:pointer" onclick="openModalNhatKy('${escJs(cv.MaCV)}', '${escJs(cv.NoiDung || "")}')" title="Click để xem nhật ký">
            ${esc(cv.MaCV)} 📜
          </strong>
        </td>
        <td>
          <div class="khachhang-cell">
            <span class="khachhang-code">${esc(cv.MaKH || "–")}</span>
            <span class="khachhang-name" title="${esc(khName)}">${esc(khName)}</span>
          </div>
        </td>
        <td style="max-width:240px">
          <strong>${esc(cv.NoiDung)}</strong>
        </td>
        <td>
          <div class="cbtd-cell">
            <span class="cbtd-primary" title="${esc(cbtd1)}">👤 ${esc(name1 || "–")}</span>
            ${cbtd2 ? `<span class="cbtd-secondary" title="${esc(cbtd2)}">🤝 Hợp công: ${esc(name2)}</span>` : ""}
          </div>
        </td>
        <td>${formatDate(cv.HanChot)}</td>
        <td>${mucDoBadge(cv.Mucdo)}</td>
        <td>${statusBadge(cv.TrangThai)}</td>
        <td>
          <div class="dien-giai-cell">
            <span class="dien-giai-text" title="${esc(cv.DienGiai || '')}">${esc(cv.DienGiai || "–")}</span>
            <button class="btn-edit-inline" title="Cập nhật diễn giải" onclick="openModalDienGiai('${escJs(cv.MaCV)}')">✏️</button>
          </div>
        </td>
        <td>
          <div style="display:flex;gap:4px;align-items:center">
            ${currentUser.role !== "BGD" ? `
              <select class="form-control" style="width:auto;padding:4px 8px;font-size:0.78rem"
                      onchange="changeTrangThai('${escJs(cv.MaCV)}', this.value)">
                ${["Mới giao","Đang xử lý","Chờ duyệt","Hoàn thành","Từ chối"].map(tt =>
                  `<option value="${tt}" ${cv.TrangThai === tt ? "selected" : ""}>${tt}</option>`
                ).join("")}
              </select>
            ` : "–"}
            <button class="btn btn-sm btn-outline" title="Ghi nhật ký" onclick="openModalCreateNhatKy('${escJs(cv.MaCV)}')">➕ NK</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterCongViec() {
  const search = (document.getElementById("searchCongViec")?.value || "").toLowerCase().trim();
  const cbtd = (document.getElementById("filterCongViecCBTD")?.value || "").toLowerCase().trim();
  const maKH = (document.getElementById("filterCongViecKH")?.value || "").toLowerCase().trim();
  const status = document.getElementById("filterTrangThai")?.value || "";
  const mucDo = document.getElementById("filterMucDo")?.value || "";

  let filtered = (dataCongViecAll || []).slice();

  if (search) {
    filtered = filtered.filter(cv =>
      String(cv.MaCV || "").toLowerCase().includes(search) ||
      String(cv.NoiDung || "").toLowerCase().includes(search) ||
      String(cv.CBTD1 || cv.Email_CBTD || "").toLowerCase().includes(search) ||
      String(cv.CBTD2 || "").toLowerCase().includes(search) ||
      String(cv.MaKH || "").toLowerCase().includes(search) ||
      String(cv.DienGiai || "").toLowerCase().includes(search)
    );
  }

  if (cbtd) {
    filtered = filtered.filter(cv =>
      String(cv.CBTD1 || cv.Email_CBTD || "").toLowerCase() === cbtd ||
      String(cv.CBTD2 || "").toLowerCase() === cbtd
    );
  }

  if (maKH) {
    filtered = filtered.filter(cv => String(cv.MaKH || "").toLowerCase() === maKH);
  }

  if (status) {
    filtered = filtered.filter(cv => cv.TrangThai === status);
  }

  if (mucDo) {
    filtered = filtered.filter(cv => (cv.Mucdo || "Bình thường") === mucDo);
  }

  dataCongViec = filtered;
  renderCongViec(filtered);
}

function openModalCreateCongViec() {
  populateDropdowns();
  const nextId = genNextId("CV", (dataCongViecAll || []).map(c => c.MaCV));
  const idEl = document.getElementById("frmCV_MaCV");
  if (idEl) idEl.value = nextId;

  // Pre-select CBTD1 là user hiện tại nếu là CBTD
  const cbtd1El = document.getElementById("frmCV_CBTD1");
  if (cbtd1El && currentUser && currentUser.role === "CBTD") {
    cbtd1El.value = currentUser.email;
  }

  openModal("modalCongViec");
}

async function submitCongViec() {
  const data = {
    maCV: document.getElementById("frmCV_MaCV").value.trim(),
    maKH: document.getElementById("frmCV_MaKH").value.trim(),
    noiDung: document.getElementById("frmCV_NoiDung").value.trim(),
    cbtd1: document.getElementById("frmCV_CBTD1").value.trim(),
    cbtd2: document.getElementById("frmCV_CBTD2").value.trim(),
    emailCBTD: document.getElementById("frmCV_CBTD1").value.trim(),
    hanChot: document.getElementById("frmCV_HanChot").value,
    mucdo: document.getElementById("frmCV_MucDo") ? document.getElementById("frmCV_MucDo").value : "Bình thường",
    trangThai: document.getElementById("frmCV_TrangThai").value,
    dienGiai: document.getElementById("frmCV_DienGiai") ? document.getElementById("frmCV_DienGiai").value.trim() : ""
  };

  if (!data.maCV) {
    showToast("Thiếu mã công việc", "warning");
    return;
  }
  if (!data.maKH) {
    showToast("Vui lòng chọn khách hàng liên kết với công việc", "warning");
    return;
  }
  if (!data.noiDung) {
    showToast("Vui lòng nhập nội dung công việc", "warning");
    return;
  }
  if (!data.cbtd1) {
    showToast("Vui lòng chọn CBTD 1 (chủ trì)", "warning");
    return;
  }

  try {
    await postData("addCongViec", data);
    showToast("Đã giao/thêm công việc thành công: " + data.maCV, "success");
    closeModal("modalCongViec");
    clearForm("frmCV_");
    loadCongViec();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  }
}

async function changeTrangThai(maCV, trangThai) {
  try {
    await postData("updateTrangThai", { maCV, trangThai });
    showToast(`${maCV} → ${trangThai}`, "success");
    const cvView = dataCongViec.find(c => c.MaCV === maCV);
    if (cvView) cvView.TrangThai = trangThai;
    const cvAll = dataCongViecAll.find(c => c.MaCV === maCV);
    if (cvAll) cvAll.TrangThai = trangThai;
  } catch (err) {
    showToast("Lỗi cập nhật: " + err.message, "error");
    loadCongViec();
  }
}

function openModalDienGiai(maCV) {
  const cv = dataCongViec.find(c => c.MaCV === maCV);
  if (!cv) return;

  document.getElementById("frmDG_MaCV").value = cv.MaCV;
  document.getElementById("frmDG_Info").innerHTML = `<strong>${esc(cv.MaCV)}</strong>: ${esc(cv.NoiDung)}`;
  document.getElementById("frmDG_DienGiai").value = cv.DienGiai || "";
  openModal("modalDienGiai");
}

async function submitUpdateDienGiai() {
  const maCV = document.getElementById("frmDG_MaCV").value;
  const dienGiai = document.getElementById("frmDG_DienGiai").value.trim();

  if (!maCV) return;

  try {
    await postData("updateDienGiai", { maCV, dienGiai });
    showToast(`✅ Đã cập nhật diễn giải cho ${maCV}`, "success");

    const cvView = dataCongViec.find(c => c.MaCV === maCV);
    if (cvView) cvView.DienGiai = dienGiai;
    const cvAll = dataCongViecAll.find(c => c.MaCV === maCV);
    if (cvAll) cvAll.DienGiai = dienGiai;

    closeModal("modalDienGiai");
    renderCongViec(dataCongViec);
  } catch (err) {
    showToast("Lỗi cập nhật diễn giải: " + err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  NHẬT KÝ TIẾN ĐỘ (Append-only & Multi-filter)
// ═══════════════════════════════════════════════════════════════════════════

async function loadNhatKy() {
  try {
    dataNhatKy = await fetchData("getNhatKy", {
      email: currentUser.email,
      role: currentUser.role
    });

    populateDropdowns();
    renderNhatKy(dataNhatKy);
  } catch (err) {
    console.error("NhatKy error:", err);
  }
}

function renderNhatKy(data) {
  const tbody = document.getElementById("tableNhatKy");
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><div class="empty-icon">📓</div><p>Chưa có nhật ký nào phù hợp</p></td></tr>';
    return;
  }

  const isKSV = currentUser.role === "KSV" || currentUser.role === "Admin";

  tbody.innerHTML = data.map(nk => {
    const isDuyet = nk.KSV_Duyet === true || nk.KSV_Duyet === "TRUE" || nk.KSV_Duyet === "true";
    const cv = (dataCongViecAll || []).find(c => c.MaCV === nk.MaCV);
    const kh = cv ? dataKhachHang.find(k => k.MaKH === cv.MaKH) : null;
    const khName = kh ? kh.TenKH : (cv ? cv.MaKH : "–");

    return `
      <tr>
        <td><strong>${esc(nk.MaNK)}</strong></td>
        <td style="color:var(--primary);font-weight:600;cursor:pointer" onclick="openModalNhatKy('${escJs(nk.MaCV)}', '')">${esc(nk.MaCV)}</td>
        <td><div class="khachhang-cell"><span class="khachhang-code">${esc(cv ? cv.MaKH : "–")}</span><span class="khachhang-name">${esc(khName)}</span></div></td>
        <td style="max-width:260px">${esc(nk.TienDo)}</td>
        <td>${formatDate(nk.ThoiGian)}</td>
        <td>${isDuyet
          ? '<span class="status-badge da-duyet">✅ Đã duyệt</span>'
          : '<span class="status-badge chua-duyet">⏳ Chờ duyệt</span>'}</td>
        <td>${isDuyet ? formatDate(nk.ThoiGian_Duyet) : "–"}</td>
        <td>
          ${isKSV && !isDuyet
            ? `<button class="btn btn-success btn-sm" onclick="duyetTienDo('${escJs(nk.MaNK)}')">✅ Duyệt</button>`
            : isDuyet ? "✓" : "–"
          }
        </td>
      </tr>
    `;
  }).join("");
}

function filterNhatKy() {
  const search = (document.getElementById("searchNhatKy")?.value || "").toLowerCase().trim();
  const filterCBTD = (document.getElementById("filterNhatKyCBTD")?.value || "").toLowerCase().trim();
  const filterKH = (document.getElementById("filterNhatKyKH")?.value || "").toLowerCase().trim();
  const filterDuyet = document.getElementById("filterDuyet")?.value || "";

  let filtered = (dataNhatKy || []).slice();

  if (search) {
    filtered = filtered.filter(nk =>
      (nk.MaNK || "").toLowerCase().includes(search) ||
      (nk.MaCV || "").toLowerCase().includes(search) ||
      (nk.TienDo || "").toLowerCase().includes(search) ||
      (nk.EmailCBTD || "").toLowerCase().includes(search)
    );
  }

  if (filterCBTD || filterKH) {
    const cvMap = {};
    (dataCongViecAll || []).forEach(c => {
      cvMap[c.MaCV] = {
        CBTD1: (c.CBTD1 || c.Email_CBTD || "").toLowerCase(),
        CBTD2: (c.CBTD2 || "").toLowerCase(),
        MaKH: (c.MaKH || "").toLowerCase()
      };
    });

    if (filterCBTD) {
      filtered = filtered.filter(nk => {
        const info = cvMap[nk.MaCV];
        return info && (info.CBTD1 === filterCBTD || info.CBTD2 === filterCBTD);
      });
    }

    if (filterKH) {
      filtered = filtered.filter(nk => {
        const info = cvMap[nk.MaCV];
        return info && info.MaKH === filterKH;
      });
    }
  }

  if (filterDuyet === "chua") {
    filtered = filtered.filter(nk => !nk.KSV_Duyet || nk.KSV_Duyet === false || nk.KSV_Duyet === "FALSE");
  } else if (filterDuyet === "da") {
    filtered = filtered.filter(nk => nk.KSV_Duyet === true || nk.KSV_Duyet === "TRUE" || nk.KSV_Duyet === "true");
  }

  renderNhatKy(filtered);
}

function openModalCreateNhatKy(preselectedMaCV = "") {
  const nextId = genNextId("NK", (dataNhatKy || []).map(n => n.MaNK));
  const idEl = document.getElementById("frmNK_MaNK");
  if (idEl) idEl.value = nextId;

  const cvSelect = document.getElementById("frmNK_MaCV");
  if (cvSelect) {
    const cvOptions = (dataCongViecAll || []).map(c =>
      `<option value="${esc(c.MaCV)}" ${c.MaCV === preselectedMaCV ? "selected" : ""}>[${esc(c.MaCV)}] ${esc(c.NoiDung.substring(0, 45))}...</option>`
    ).join("");
    cvSelect.innerHTML = '<option value="">-- Chọn công việc thực hiện --</option>' + cvOptions;
    if (preselectedMaCV) cvSelect.value = preselectedMaCV;
  }

  openModal("modalNhatKyForm");
}

async function submitNhatKy() {
  const data = {
    maNK: document.getElementById("frmNK_MaNK").value.trim(),
    maCV: document.getElementById("frmNK_MaCV").value.trim(),
    tienDo: document.getElementById("frmNK_TienDo").value.trim(),
    emailCBTD: (currentUser && currentUser.email) || ""
  };

  if (!data.maNK || !data.maCV || !data.tienDo) {
    showToast("Vui lòng điền đầy đủ mã công việc và nội dung tiến độ", "warning");
    return;
  }

  try {
    await postData("addNhatKy", data);
    showToast("Đã lưu nhật ký tiến độ: " + data.maNK, "success");
    closeModal("modalNhatKyForm");
    clearForm("frmNK_");

    if (window._nhatKyCache) delete window._nhatKyCache[data.maCV];

    const modalNhatKy = document.getElementById("modalNhatKy");
    if (modalNhatKy && modalNhatKy.classList.contains("active")) {
      openModalNhatKy(data.maCV, "");
    }

    loadNhatKy();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  }
}

async function openModalNhatKy(maCV, noiDung) {
  const modal = document.getElementById("modalNhatKy");
  const title = document.getElementById("modalNhatKyTitle");
  const tbody = document.getElementById("modalNhatKyBody");
  if (!modal) return;

  title.textContent = `📜 Nhật ký công việc: ${maCV}${noiDung ? " — " + noiDung.substring(0, 50) : ""}`;
  tbody.innerHTML = '<tr><td colspan="3" class="loading-overlay"><div class="spinner dark"></div><span>Đang tải nhật ký…</span></td></tr>';
  modal.classList.add("active");

  try {
    const list = await fetchData("getNhatKy", {
      maCV: maCV,
      email: currentUser.email,
      role: currentUser.role,
      limit: 50
    });

    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state"><div class="empty-icon">📭</div><p>Chưa có nhật ký cho công việc này</p></td></tr>';
      return;
    }

    tbody.innerHTML = list.map(n => `
      <tr>
        <td style="white-space:nowrap;font-size:0.8rem;color:#666">${formatDateTime(n.ThoiGian)}</td>
        <td>${esc(n.TienDo || "")}</td>
        <td style="font-size:0.85rem;color:#555">${esc(n.EmailCBTD || n.NguoiCapNhat || "")}</td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state"><div class="empty-icon">⚠️</div><p>Lỗi: ${esc(err.message)}</p></td></tr>`;
  }
}

function closeModalNhatKy() {
  const modal = document.getElementById("modalNhatKy");
  if (modal) modal.classList.remove("active");
}

async function duyetTienDo(maNK) {
  if (!confirm(`Xác nhận duyệt nhật ký ${maNK}?`)) return;

  try {
    await postData("duyetTienDo", { maNK, emailKSV: currentUser.email });
    showToast("✅ Đã duyệt nhật ký " + maNK, "success");

    if (window._nhatKyCache) {
      Object.keys(window._nhatKyCache).forEach(k => delete window._nhatKyCache[k]);
    }

    const nk = dataNhatKy.find(n => n.MaNK === maNK);
    if (nk) {
      const modalNhatKy = document.getElementById("modalNhatKy");
      if (modalNhatKy && modalNhatKy.classList.contains("active")) {
        openModalNhatKy(nk.MaCV, "");
      }
    }

    loadNhatKy();
    if (dataDashboard) loadDashboard();
  } catch (err) {
    showToast("Lỗi duyệt: " + err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  KHÁCH HÀNG & NGƯỜI DÙNG
// ═══════════════════════════════════════════════════════════════════════════

async function loadKhachHang() {
  try {
    dataKhachHang = await fetchData("getKhachHang");
    populateDropdowns();
    renderKhachHang(dataKhachHang);
  } catch (err) {
    console.error("KhachHang error:", err);
  }
}

function renderKhachHang(data) {
  const tbody = document.getElementById("tableKhachHang");
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">👥</div><p>Chưa có khách hàng</p></td></tr>';
    return;
  }

  tbody.innerHTML = data.map(kh => `
    <tr>
      <td><strong style="color:var(--primary)">${esc(kh.MaKH)}</strong></td>
      <td><strong>${esc(kh.TenKH)}</strong></td>
      <td><span class="status-badge moi-giao">${esc(kh.NhomKH || "–")}</span></td>
      <td>${loaiKHBadge(kh.LoaiKH)}</td>
      <td>${nhomNoBadge(kh.NhomNo)}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editKhachHang('${escJs(kh.MaKH)}')">✏️ Sửa</button>
        <button class="btn btn-sm btn-danger" onclick="deleteKhachHang('${escJs(kh.MaKH)}')">🗑️ Xóa</button>
      </td>
    </tr>
  `).join("");
}

function filterKhachHang() {
  const search = (document.getElementById("searchKhachHang")?.value || "").toLowerCase().trim();
  const loaiKH = document.getElementById("filterLoaiKH")?.value || "";
  const nhomNo = document.getElementById("filterNhomNo")?.value || "";

  let filtered = dataKhachHang;

  if (search) {
    filtered = filtered.filter(kh =>
      (kh.MaKH || "").toLowerCase().includes(search) ||
      (kh.TenKH || "").toLowerCase().includes(search) ||
      (kh.NhomKH || "").toLowerCase().includes(search) ||
      (kh.LoaiKH || "").toLowerCase().includes(search) ||
      (kh.NhomNo || "").toLowerCase().includes(search)
    );
  }

  if (loaiKH) {
    filtered = filtered.filter(kh => (kh.LoaiKH || "Đang phát triển") === loaiKH);
  }

  if (nhomNo) {
    filtered = filtered.filter(kh => (kh.NhomNo || "Chưa dư nợ") === nhomNo);
  }

  renderKhachHang(filtered);
}

async function submitKhachHang() {
  const data = {
    maKH: document.getElementById("frmKH_MaKH").value.trim(),
    tenKH: document.getElementById("frmKH_TenKH").value.trim(),
    nhomKH: document.getElementById("frmKH_NhomKH").value,
    loaiKH: document.getElementById("frmKH_LoaiKH") ? document.getElementById("frmKH_LoaiKH").value : "Đang phát triển",
    nhomNo: document.getElementById("frmKH_NhomNo") ? document.getElementById("frmKH_NhomNo").value : "Chưa dư nợ"
  };

  if (!data.maKH || !data.tenKH) {
    showToast("Vui lòng nhập mã KH và tên KH", "warning");
    return;
  }

  try {
    await postData("addKhachHang", data);
    showToast("Đã thêm khách hàng: " + data.tenKH, "success");
    closeModal("modalKhachHang");
    clearForm("frmKH_");
    loadKhachHang();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  }
}

function editKhachHang(maKH) {
  const kh = dataKhachHang.find(k => k.MaKH === maKH);
  if (!kh) return;

  document.getElementById("frmEditKH_MaKH").value = kh.MaKH;
  document.getElementById("frmEditKH_MaKH_Display").value = kh.MaKH;
  document.getElementById("frmEditKH_TenKH").value = kh.TenKH || "";
  document.getElementById("frmEditKH_NhomKH").value = kh.NhomKH || "Doanh nghiệp";
  document.getElementById("frmEditKH_LoaiKH").value = kh.LoaiKH || "Đang phát triển";
  document.getElementById("frmEditKH_NhomNo").value = kh.NhomNo || "Chưa dư nợ";

  openModal("modalEditKhachHang");
}

async function submitEditKhachHang() {
  const maKH = document.getElementById("frmEditKH_MaKH").value.trim();
  const tenKH = document.getElementById("frmEditKH_TenKH").value.trim();
  const nhomKH = document.getElementById("frmEditKH_NhomKH").value;
  const loaiKH = document.getElementById("frmEditKH_LoaiKH").value;
  const nhomNo = document.getElementById("frmEditKH_NhomNo").value;

  if (!maKH || !tenKH) return;

  try {
    await postData("updateKhachHang", { maKH, tenKH, nhomKH, loaiKH, nhomNo });
    showToast("Đã cập nhật khách hàng: " + tenKH, "success");
    closeModal("modalEditKhachHang");
    loadKhachHang();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  }
}

function deleteKhachHang(maKH) {
  if (!confirm("Bạn có chắc muốn xóa khách hàng này?")) return;
  postData("deleteKhachHang", { maKH })
    .then(() => {
      showToast("Đã xóa khách hàng", "success");
      loadKhachHang();
    })
    .catch(err => showToast("Lỗi: " + err.message, "error"));
}

async function loadNguoiDung() {
  try {
    if (currentUser.role !== "Admin") {
      // Non-admin: trang bị ẩn bằng setupRolePermissions, nhưng vẫn phòng case
      // user truy cập trực tiếp qua hash. Dùng dữ liệu đã preload (DEMO/users fallback).
      dataNguoiDung = dataNguoiDung || [];
    } else {
      dataNguoiDung = await fetchData("getUsers");
    }
    populateDropdowns();
    renderNguoiDung(dataNguoiDung || []);
  } catch (err) {
    console.error("Users error:", err);
    showToast("Không tải được danh sách người dùng: " + err.message, "error");
    dataNguoiDung = [];
    renderNguoiDung([]);
  }
}

function renderNguoiDung(data) {
  const tbody = document.getElementById("tableNguoiDung");
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><div class="empty-icon">⚙️</div><p>Chưa có người dùng</p></td></tr>';
    return;
  }

  const roleColors = { Admin: "hoan-thanh", CBTD: "moi-giao", KSV: "cho-duyet", BGD: "dang-xu-ly" };

  tbody.innerHTML = data.map(u => {
    const cls = roleColors[u.Role] || "moi-giao";
    return `
      <tr>
        <td>${esc(u.Email)}</td>
        <td><strong>${esc(u.TenCanbo || "–")}</strong></td>
        <td><span class="status-badge ${cls}">${esc(u.Role)}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editNguoiDung('${escJs(u.Email)}')">✏️ Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteNguoiDung('${escJs(u.Email)}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join("");
}

function filterNguoiDung() {
  const search = (document.getElementById("searchNguoiDung")?.value || "").toLowerCase().trim();
  const filtered = dataNguoiDung.filter(u =>
    (u.Email || "").toLowerCase().includes(search) ||
    (u.TenCanbo || "").toLowerCase().includes(search) ||
    (u.Role || "").toLowerCase().includes(search)
  );
  renderNguoiDung(filtered);
}

async function submitNguoiDung() {
  const email = document.getElementById("frmND_Email").value.trim();
  const tenCanbo = document.getElementById("frmND_TenCanbo") ? document.getElementById("frmND_TenCanbo").value.trim() : "";
  const role = document.getElementById("frmND_Role").value;

  if (!email) {
    showToast("Vui lòng nhập email", "warning");
    return;
  }

  try {
    await postData("addUser", { email, tenCanbo, role });
    showToast(`Đã thêm người dùng: ${email} (${role})`, "success");
    closeModal("modalNguoiDung");
    clearForm("frmND_");
    loadNguoiDung();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  }
}

function editNguoiDung(email) {
  const user = dataNguoiDung.find(u => u.Email.toLowerCase() === email.toLowerCase());
  if (!user) return;

  document.getElementById("frmEditND_Email").value = user.Email;
  document.getElementById("frmEditND_Email_Display").value = user.Email;
  document.getElementById("frmEditND_TenCanbo").value = user.TenCanbo || "";
  document.getElementById("frmEditND_Role").value = user.Role || "CBTD";

  openModal("modalEditNguoiDung");
}

async function submitEditNguoiDung() {
  const email = document.getElementById("frmEditND_Email").value.trim();
  const tenCanbo = document.getElementById("frmEditND_TenCanbo").value.trim();
  const role = document.getElementById("frmEditND_Role").value;

  try {
    await postData("updateUser", { email, tenCanbo, role });
    showToast(`Đã cập nhật người dùng: ${email}`, "success");
    closeModal("modalEditNguoiDung");
    loadNguoiDung();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  }
}

function deleteNguoiDung(email) {
  if (!confirm(`Bạn có chắc muốn xóa người dùng ${email}?`)) return;
  postData("deleteUser", { email })
    .then(() => {
      showToast("Đã xóa người dùng", "success");
      loadNguoiDung();
    })
    .catch(err => showToast("Lỗi: " + err.message, "error"));
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORT EXCEL
// ═══════════════════════════════════════════════════════════════════════════

async function exportDashboardExcel() {
  if (typeof XLSX === "undefined") {
    showToast("SheetJS chưa sẵn sàng, thử lại sau giây lát", "warning");
    return;
  }

  showToast("Đang tạo báo cáo Excel…", "info");

  try {
    const wb = XLSX.utils.book_new();
    const stats = currentStats || { tong: 0, hoanThanh: 0, dangXuLy: 0, quaHan: 0, tyLeDungHan: 100 };
    const now = new Date();

    // Sheet 1: Tổng quan
    const header = [
      ["BÁO CÁO ĐIỀU HÀNH TÍN DỤNG — QLCV CBTD"],
      ["Người xuất:", currentUser ? currentUser.email : ""],
      ["Thời điểm:", formatDateTime(now.toISOString())],
      ["Quyền hạn:", currentUser ? currentUser.role : ""],
      [],
      ["CHỈ SỐ TỔNG QUAN"],
      ["Tổng công việc", stats.tong || 0],
      ["Đã hoàn thành", stats.hoanThanh || 0],
      ["Đang xử lý", stats.dangXuLy || 0],
      ["Trễ hạn / Quá hạn", stats.quaHan || 0],
      ["Tỷ lệ đúng hạn (%)", (stats.tyLeDungHan || 100) + "%"],
      [],
      ["THEO TRẠNG THÁI"],
      ["Trạng thái", "Số lượng"],
      ...Object.entries(stats.byTrangThai || {}).map(([k, v]) => [k, v]),
      [],
      ["THEO CÁN BỘ TÍN DỤNG"],
      ["Email CBTD", "Số việc phụ trách"],
      ...Object.entries(stats.byCBTD || {}).map(([email, count]) => [email, count])
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(header);
    ws1["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Tổng quan");

    // Sheet 2: Chi tiết Công việc
    const detailRows = (dataCongViecAll || []).map(cv => {
      const kh = dataKhachHang.find(k => k.MaKH === cv.MaKH);
      return {
        "Mã CV": cv.MaCV || "",
        "Mã KH": cv.MaKH || "",
        "Tên Khách Hàng": kh ? kh.TenKH : "",
        "Nội dung công việc": cv.NoiDung || "",
        "CBTD 1 (Chính)": cv.CBTD1 || cv.Email_CBTD || "",
        "CBTD 2 (Hợp công)": cv.CBTD2 || "",
        "Hạn chót": formatDate(cv.HanChot),
        "Mức độ": cv.Mucdo || "",
        "Trạng thái": cv.TrangThai || "",
        "Diễn giải": cv.DienGiai || ""
      };
    });
    const ws2 = XLSX.utils.json_to_sheet(detailRows);
    ws2["!cols"] = [
      { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 40 },
      { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 35 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết CV");

    // Sheet 3: Danh mục Khách hàng
    const khRows = (dataKhachHang || []).map(k => ({
      "Mã KH": k.MaKH || "",
      "Tên Khách Hàng": k.TenKH || "",
      "Nhóm KH": k.NhomKH || "",
      "Loại KH": k.LoaiKH || "",
      "Nhóm Nợ": k.NhomNo || ""
    }));
    const ws3 = XLSX.utils.json_to_sheet(khRows);
    ws3["!cols"] = [{ wch: 10 }, { wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Khách hàng");

    XLSX.writeFile(wb, `BaoCao_QLCV_CBTD_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast("✅ Đã xuất file Excel thành công", "success");
  } catch (err) {
    showToast("Lỗi xuất Excel: " + err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CƠ SỞ DỮ LIỆU (Admin Sync & Integrity)
// ═══════════════════════════════════════════════════════════════════════════

async function syncDataToDb() {
  const btn = document.getElementById("btnSyncToDb");
  const resultEl = document.getElementById("resultSyncToDb");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Đang đồng bộ...';
  resultEl.innerHTML = "";

  try {
    const payload = {
      congviec: dataCongViecAll.length ? dataCongViecAll : dataCongViec,
      khachhang: dataKhachHang,
      nguoidung: dataNguoiDung,
      nhatky: dataNhatKy
    };
    const res = await postData("syncToDb", payload);
    const s = (res && res.data) || {};

    resultEl.innerHTML = `
      <div class="db-report-status ok">✅ Đồng bộ thành công</div>
      <table class="db-sheet-table">
        <thead><tr><th>Bảng</th><th>Thêm mới</th><th>Cập nhật</th></tr></thead>
        <tbody>
          <tr><td>Công việc</td><td>${s.congviec?.inserted ?? 0}</td><td>${s.congviec?.updated ?? 0}</td></tr>
          <tr><td>Khách hàng</td><td>${s.khachhang?.inserted ?? 0}</td><td>${s.khachhang?.updated ?? 0}</td></tr>
          <tr><td>Người dùng</td><td>${s.nguoidung?.inserted ?? 0}</td><td>${s.nguoidung?.updated ?? 0}</td></tr>
          <tr><td>Nhật ký</td><td>${s.nhatky?.inserted ?? 0}</td><td>${s.nhatky?.updated ?? 0}</td></tr>
        </tbody>
      </table>
      <div class="db-timestamp">Hoàn tất lúc ${new Date().toLocaleString("vi-VN")}</div>
    `;
    showToast("Đã đồng bộ dữ liệu vào DB_QLCV_CBTD", "success");
  } catch (err) {
    resultEl.innerHTML = `<div class="db-report-status error">❌ Đồng bộ thất bại: ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🔄 Đồng bộ ngay";
  }
}

async function reloadAllData() {
  const btn = document.getElementById("btnReloadAll");
  const resultEl = document.getElementById("resultReloadAll");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Đang tải lại...';
  resultEl.innerHTML = "";

  try {
    const viewerParams = { email: currentUser.email, role: currentUser.role };
    const [dashboard, congviec, nhatky, khachhang, nguoidung] = await Promise.all([
      fetchData("getDashboard", viewerParams),
      fetchData("getCongViec", viewerParams),
      fetchData("getNhatKy", viewerParams),
      fetchData("getKhachHang"),
      fetchData("getUsers").catch(() => [])
    ]);

    dataDashboard = dashboard;
    dataCongViec = congviec || [];
    dataCongViecAll = congviec || [];
    dataNhatKy = nhatky || [];
    dataKhachHang = khachhang || [];
    dataNguoiDung = nguoidung || [];

    populateDropdowns();
    renderDashboard(dataDashboard);
    if (document.getElementById("tableCongViec")) renderCongViec(dataCongViec);
    if (document.getElementById("tableNhatKy")) renderNhatKy(dataNhatKy);
    if (document.getElementById("tableKhachHang")) renderKhachHang(dataKhachHang);
    if (document.getElementById("tableNguoiDung")) renderNguoiDung(dataNguoiDung);

    resultEl.innerHTML = `
      <div class="db-report-status ok">✅ Đã tải lại toàn bộ dữ liệu</div>
      <table class="db-sheet-table">
        <thead><tr><th>Bảng</th><th>Số dòng</th></tr></thead>
        <tbody>
          <tr><td>Công việc</td><td>${dataCongViec.length}</td></tr>
          <tr><td>Nhật ký</td><td>${dataNhatKy.length}</td></tr>
          <tr><td>Khách hàng</td><td>${dataKhachHang.length}</td></tr>
          <tr><td>Người dùng</td><td>${dataNguoiDung.length}</td></tr>
        </tbody>
      </table>
      <div class="db-timestamp">Hoàn tất lúc ${new Date().toLocaleString("vi-VN")}</div>
    `;
    showToast("Đã tải lại toàn bộ dữ liệu từ DB", "success");
  } catch (err) {
    resultEl.innerHTML = `<div class="db-report-status error">❌ Tải lại thất bại: ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = "♻️ Tải lại toàn bộ";
  }
}

async function checkDbIntegrity() {
  const btn = document.getElementById("btnCheckIntegrity");
  const resultEl = document.getElementById("resultCheckIntegrity");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Đang kiểm tra...';
  resultEl.innerHTML = "";

  try {
    const report = await fetchData("checkIntegrity");
    resultEl.innerHTML = renderIntegrityReport(report);
    showToast(
      report.summary.errors === 0
        ? "Kiểm tra DB hoàn tất — Không phát hiện lỗi"
        : `Kiểm tra DB hoàn tất — Phát hiện ${report.summary.errors} lỗi`,
      report.summary.errors === 0 ? "success" : "warning"
    );
  } catch (err) {
    resultEl.innerHTML = `<div class="db-report-status error">❌ Không kết nối được DB: ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🩺 Kiểm tra ngay";
  }
}

function renderIntegrityReport(report) {
  const { connected, dbName, sheets, issues, summary } = report;
  if (!connected) return `<div class="db-report-status error">❌ Không kết nối được tới DB_QLCV_CBTD</div>`;

  const statusClass = summary.errors > 0 ? "error" : (summary.warnings > 0 ? "warn" : "ok");
  const statusText = summary.errors > 0
    ? `⚠️ Phát hiện ${summary.errors} lỗi, ${summary.warnings} cảnh báo`
    : (summary.warnings > 0 ? `⚠️ ${summary.warnings} cảnh báo` : "✅ Kết nối OK — Dữ liệu toàn vẹn chuẩn xác");

  let html = `<div class="db-report-status ${statusClass}">${statusText}</div>`;
  html += `<p style="font-size:0.82rem;color:var(--text-secondary);margin:0 0 10px">Tên file: <strong>${esc(dbName)}</strong></p>`;

  html += `<table class="db-sheet-table">
    <thead><tr><th>Sheet</th><th>Tồn tại</th><th>Đủ cột</th><th>Số dòng</th></tr></thead>
    <tbody>
      ${sheets.map(s => `
        <tr>
          <td>${esc(s.name)}</td>
          <td>${s.exists ? "✅" : "❌"}</td>
          <td>${s.exists ? (s.headersOk ? "✅" : `❌ thiếu: ${esc((s.missingHeaders || []).join(", "))}`) : "–"}</td>
          <td>${s.exists ? s.rowCount : "–"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>`;

  if (issues && issues.length) {
    html += `<ul class="db-issue-list">
      ${issues.map(i => `<li class="${i.level === "warning" ? "warn" : ""}">${i.level === "warning" ? "⚠️" : "❌"} ${esc(i.message)}</li>`).join("")}
    </ul>`;
  }

  html += `<div class="db-timestamp">Kiểm tra lúc ${new Date().toLocaleString("vi-VN")}</div>`;
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════
//  XLSX IMPORT
// ═══════════════════════════════════════════════════════════════════════════

function handleFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;

  const validExts = ['.xlsx', '.xls'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExts.includes(ext)) {
    showToast('Vui lòng chọn file .xlsx hoặc .xls', 'error');
    input.value = '';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast('File quá lớn. Tối đa 5MB', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!jsonData.length) {
        showToast('File không có dữ liệu', 'warning');
        return;
      }

      if (type === 'ND') {
        processImportND(jsonData, file.name);
      } else if (type === 'KH') {
        processImportKH(jsonData, file.name);
      }
    } catch (err) {
      showToast('Lỗi đọc file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function processImportND(data, fileName) {
  const validRoles = ['Admin', 'CBTD', 'KSV', 'BGD'];
  const existingEmails = new Set(dataNguoiDung.map(u => u.Email.toLowerCase()));

  importDataND = data.map((row, i) => {
    const email = String(row.Email || row.email || '').trim();
    const tenCanbo = String(row.TenCanbo || row.tenCanbo || row['Tên cán bộ'] || row['Ten Can Bo'] || '').trim();
    const role = String(row.Role || row.role || '').trim();

    let status = 'valid';
    let statusText = '✅ OK';

    if (!email || !email.includes('@')) {
      status = 'invalid';
      statusText = '❌ Email không hợp lệ';
    } else if (!validRoles.includes(role)) {
      status = 'invalid';
      statusText = '❌ Role không hợp lệ';
    } else if (existingEmails.has(email.toLowerCase())) {
      status = 'duplicate';
      statusText = '⚠️ Email đã tồn tại';
    }

    return { email, tenCanbo, role, status, statusText, index: i + 1 };
  });

  document.getElementById('fileNameND').textContent = '📄 ' + fileName;
  document.getElementById('previewND').style.display = 'block';
  document.getElementById('dropZoneND').style.display = 'none';

  const validCount = importDataND.filter(r => r.status === 'valid').length;
  const invalidCount = importDataND.filter(r => r.status === 'invalid').length;
  const dupCount = importDataND.filter(r => r.status === 'duplicate').length;

  document.getElementById('importCountND').innerHTML =
    `Tổng: <strong>${importDataND.length}</strong> dòng · ` +
    `<span class="row-valid">✅ ${validCount} hợp lệ</span> · ` +
    `<span class="row-invalid">❌ ${invalidCount} lỗi</span> · ` +
    `<span class="row-duplicate">⚠️ ${dupCount} trùng</span>`;

  document.getElementById('previewTableND').innerHTML = importDataND.map(r => `
    <tr>
      <td>${r.index}</td>
      <td>${esc(r.email)}</td>
      <td>${esc(r.tenCanbo)}</td>
      <td>${esc(r.role)}</td>
      <td class="row-${r.status}">${r.statusText}</td>
    </tr>
  `).join('');

  document.getElementById('btnImportND').disabled = validCount === 0;
}

function processImportKH(data, fileName) {
  const existingMaKH = new Set(dataKhachHang.map(kh => String(kh.MaKH).toLowerCase()));
  const validLoaiKH = ['Đang phát triển', 'Quản lý', 'Xử lý nợ'];
  const validNhomNo = ['Chưa dư nợ', 'Nhóm 1', 'Nhóm 2', 'Nhóm 3', 'Nhóm 5', 'XLRR'];

  importDataKH = data.map((row, i) => {
    const maKH = String(row.MaKH || row.maKH || row['Mã KH'] || '').trim();
    const tenKH = String(row.TenKH || row.tenKH || row['Tên KH'] || row['Tên khách hàng'] || '').trim();
    const nhomKH = String(row.NhomKH || row.nhomKH || row['Nhóm KH'] || row['Nhóm'] || '').trim();
    let loaiKH = String(row.LoaiKH || row.loaiKH || row['Loại KH'] || 'Đang phát triển').trim();
    let nhomNo = String(row.NhomNo || row.nhomNo || row['Nhóm nợ'] || 'Chưa dư nợ').trim();

    if (!validLoaiKH.includes(loaiKH)) loaiKH = 'Đang phát triển';
    if (!validNhomNo.includes(nhomNo)) nhomNo = 'Chưa dư nợ';

    let status = 'valid';
    let statusText = '✅ OK';

    if (!maKH) {
      status = 'invalid';
      statusText = '❌ Thiếu mã KH';
    } else if (!tenKH) {
      status = 'invalid';
      statusText = '❌ Thiếu tên KH';
    } else if (existingMaKH.has(maKH.toLowerCase())) {
      status = 'duplicate';
      statusText = '⚠️ Mã KH đã tồn tại';
    }

    return { maKH, tenKH, nhomKH, loaiKH, nhomNo, status, statusText, index: i + 1 };
  });

  document.getElementById('fileNameKH').textContent = '📄 ' + fileName;
  document.getElementById('previewKH').style.display = 'block';
  document.getElementById('dropZoneKH').style.display = 'none';

  const validCount = importDataKH.filter(r => r.status === 'valid').length;
  const invalidCount = importDataKH.filter(r => r.status === 'invalid').length;
  const dupCount = importDataKH.filter(r => r.status === 'duplicate').length;

  document.getElementById('importCountKH').innerHTML =
    `Tổng: <strong>${importDataKH.length}</strong> dòng · ` +
    `<span class="row-valid">✅ ${validCount} hợp lệ</span> · ` +
    `<span class="row-invalid">❌ ${invalidCount} lỗi</span> · ` +
    `<span class="row-duplicate">⚠️ ${dupCount} trùng</span>`;

  document.getElementById('previewTableKH').innerHTML = importDataKH.map(r => `
    <tr>
      <td>${r.index}</td>
      <td>${esc(r.maKH)}</td>
      <td>${esc(r.tenKH)}</td>
      <td>${esc(r.nhomKH)}</td>
      <td>${esc(r.loaiKH)}</td>
      <td>${esc(r.nhomNo)}</td>
      <td class="row-${r.status}">${r.statusText}</td>
    </tr>
  `).join('');

  document.getElementById('btnImportKH').disabled = validCount === 0;
}

async function executeImport(type) {
  if (type === 'ND') {
    const validRows = importDataND.filter(r => r.status === 'valid');
    if (!validRows.length) return;

    const btn = document.getElementById('btnImportND');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang import...';

    let success = 0, failed = 0;
    for (const row of validRows) {
      try {
        await postData('addUser', { email: row.email, tenCanbo: row.tenCanbo, role: row.role });
        success++;
      } catch { failed++; }
    }

    showToast(`Import Người dùng: ${success} thành công, ${failed} lỗi`, success > 0 ? 'success' : 'error');
    btn.innerHTML = '📥 Import';
    btn.disabled = false;
    closeModal('modalImportND');
    clearImport('ND');
    loadNguoiDung();
  } else if (type === 'KH') {
    const validRows = importDataKH.filter(r => r.status === 'valid');
    if (!validRows.length) return;

    const btn = document.getElementById('btnImportKH');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang import...';

    let success = 0, failed = 0;
    for (const row of validRows) {
      try {
        await postData('addKhachHang', {
          maKH: row.maKH,
          tenKH: row.tenKH,
          nhomKH: row.nhomKH,
          loaiKH: row.loaiKH,
          nhomNo: row.nhomNo
        });
        success++;
      } catch { failed++; }
    }

    showToast(`Import Khách hàng: ${success} thành công, ${failed} lỗi`, success > 0 ? 'success' : 'error');
    btn.innerHTML = '📥 Import';
    btn.disabled = false;
    closeModal('modalImportKH');
    clearImport('KH');
    loadKhachHang();
  }
}

function clearImport(type) {
  if (type === 'ND') {
    importDataND = [];
    document.getElementById('previewND').style.display = 'none';
    document.getElementById('dropZoneND').style.display = '';
    document.getElementById('fileND').value = '';
    document.getElementById('btnImportND').disabled = true;
  } else {
    importDataKH = [];
    document.getElementById('previewKH').style.display = 'none';
    document.getElementById('dropZoneKH').style.display = '';
    document.getElementById('fileKH').value = '';
    document.getElementById('btnImportKH').disabled = true;
  }
}

function setupDragDrop() {
  ['ND', 'KH'].forEach(type => {
    const zone = document.getElementById('dropZone' + type);
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const input = document.getElementById('file' + type);
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
        handleFileUpload(input, type);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  UI HELPERS & BADGE FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════

function openModal(id) {
  document.getElementById(id).classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

function clearForm(prefix) {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
    if (el.tagName === "SELECT") el.selectedIndex = 0;
    else if (!el.readOnly) el.value = "";
  });
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast " + type;

  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || ""}</span><span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count;
    el.style.display = "";
  } else {
    el.style.display = "none";
  }
}

function statusBadge(status) {
  const classMap = {
    "Mới giao": "moi-giao",
    "Đang xử lý": "dang-xu-ly",
    "Chờ duyệt": "cho-duyet",
    "Hoàn thành": "hoan-thanh",
    "Từ chối": "tu-choi"
  };
  const cls = classMap[status] || "moi-giao";
  return `<span class="status-badge ${cls}">${esc(status || "–")}</span>`;
}

function mucDoBadge(mucDo) {
  const md = mucDo || "Bình thường";
  const classMap = {
    "Ưu tiên": "mucdo-uutien",
    "Bình thường": "mucdo-binhthuong",
    "Khác": "mucdo-khac"
  };
  const cls = classMap[md] || "mucdo-binhthuong";
  return `<span class="status-badge ${cls}">${esc(md)}</span>`;
}

function loaiKHBadge(loai) {
  const l = loai || "Đang phát triển";
  const classMap = {
    "Đang phát triển": "loai-phattrien",
    "Quản lý": "loai-quanly",
    "Xử lý nợ": "loai-xulyno"
  };
  const cls = classMap[l] || "loai-phattrien";
  return `<span class="status-badge ${cls}">${esc(l)}</span>`;
}

function nhomNoBadge(nhom) {
  const n = nhom || "Chưa dư nợ";
  const classMap = {
    "Chưa dư nợ": "nhomno-chua",
    "Nhóm 1": "nhomno-1",
    "Nhóm 2": "nhomno-2",
    "Nhóm 3": "nhomno-3",
    "Nhóm 5": "nhomno-5",
    "XLRR": "nhomno-xlrr"
  };
  const cls = classMap[n] || "nhomno-chua";
  return `<span class="status-badge ${cls}">${esc(n)}</span>`;
}

function getStatusColor(status) {
  const colors = {
    "Mới giao": "#4285F4",
    "Đang xử lý": "#FBBC04",
    "Chờ duyệt": "#FF9800",
    "Hoàn thành": "#34A853",
    "Từ chối": "#EA4335"
  };
  return colors[status] || "#9E9E9E";
}

function formatDate(d) {
  if (!d) return "–";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return esc(String(d));
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return esc(String(d));
  }
}

function formatDateTime(s) {
  if (!s) return "–";
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escJs(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "\\\"")
    .replace(/[\r\n]/g, " ")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ═══════════════════════════════════════════════════════════════════════════
//  KEYBOARD & EVENTS
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.active").forEach(m => {
      m.classList.remove("active");
    });
  }
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("active");
  }
});

window.addEventListener("hashchange", () => {
  const hash = window.location.hash.replace(/^#/, "");
  const page = hash.split("?")[0] || "dashboard";
  const currentPageClean = currentPage.split("?")[0];
  if (currentUser && page !== currentPageClean) {
    navigateTo(page);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  INIT & PWA
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  if (DEMO_MODE) {
    console.log("%c🔶 DEMO MODE – Chưa kết nối API thực", "color: #FBBC04; font-size: 14px; font-weight: bold;");
  } else {
    const emailGroup = document.getElementById("loginEmailGroup");
    const googleNote = document.getElementById("loginGoogleNote");
    const demoHint = document.getElementById("loginDemoHint");
    if (emailGroup) emailGroup.style.display = "none";
    if (googleNote) googleNote.style.display = "block";
    if (demoHint) demoHint.style.display = "none";
  }
  setupDragDrop();
  checkSession();
  initPWA();
});

function initPWA() {
  window.deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    const installBtn = document.getElementById("btnInstallPWA");
    if (installBtn) installBtn.style.display = "";
  });

  const SW_URL = (typeof window.__SW_URL__ === "string") ? window.__SW_URL__ : "";
  if (!SW_URL || !("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  navigator.serviceWorker.register(SW_URL)
    .then(reg => console.log("✅ SW registered:", reg.scope))
    .catch(err => console.warn("SW registration failed:", err));
}

async function promptInstallPWA() {
  if (!window.deferredInstallPrompt) {
    showToast("Trình duyệt không hỗ trợ hoặc ứng dụng đã được cài đặt.", "info");
    return;
  }
  window.deferredInstallPrompt.prompt();
  const choice = await window.deferredInstallPrompt.userChoice;
  if (choice.outcome === "accepted") {
    showToast("✅ Đã thêm QLCV CBTD vào màn hình chính!", "success");
  }
  window.deferredInstallPrompt = null;
}
