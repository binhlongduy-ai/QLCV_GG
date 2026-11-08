/**
 * Triggers.gs — Cài đặt trigger tự động gửi email khi CBTD thêm nhật ký.
 *
 * Cách sử dụng:
 *   1. Mở Apps Script editor → chọn function `installTriggers` → Run.
 *   2. Cấp quyền khi Google hỏi (gửi email + truy cập spreadsheet).
 *   3. Sau này mỗi lần sheet "NhatKy" có dòng mới → tự động gửi email
 *      cho KSV/BGD phụ trách (xem cấu hình bên dưới).
 *
 * QUAN TRỌNG — khớp tên sheet:
 *   Code.gs đặt SHEET_NHATKY = "NhatKy". Nếu bạn đổi tên sheet thành
 *   "NHATKY_TIENDO" thì phải sửa NHATKY_SHEET_NAME trong onEditNhatKy()
 *   cho khớp — nếu không trigger sẽ không bao giờ chạy.
 *
 * Lưu ý:
 *   - Apps Script installable trigger chỉ chạy khi tài khoản deploy web app
 *     (owner) thực hiện thay đổi. Nếu CBTD chỉnh sửa qua API → vẫn kích hoạt
 *     vì Apps Script lưu người sửa thực sự trên sheet.
 *   - Email sẽ gửi với định dạng HTML đẹp, có liên kết trở lại web app.
 *
 * Cấu hình: chỉnh NOTIFY_EMAILS và WEBAPP_URL bên dưới cho phù hợp.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  CẤU HÌNH — SỬA THEO ĐƠN VỊ CỦA BẠN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Danh sách email nhận thông báo. Có thể là KSV, BGD, hoặc nhóm Google Groups.
 * Để trống [] nếu muốn tắt email.
 */
const NOTIFY_EMAILS = [
  // "ksv@example.com",
  // "bgd@example.com",
];

/**
 * URL web app — dùng để chèn link "Mở công việc" trong email.
 * Nếu để trống sẽ tự lấy URL của script hiện tại (qua ScriptApp.getService().getUrl()).
 */
const WEBAPP_URL = "";

/**
 * Có gửi email cho CBTD phụ trách không? (true = CBTD nhận bản copy).
 */
const NOTIFY_OWNER = true;

// ═══════════════════════════════════════════════════════════════════════════
//  CÀI TRIGGER (chạy 1 lần)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hàm public để cài trigger — chạy thủ công 1 lần từ Apps Script editor.
 */
function installTriggers() {
  // Xóa các trigger cũ cùng loại để tránh duplicate.
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === "onEditNhatKy") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Cài onEdit trigger cho spreadsheet hiện tại.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger("onEditNhatKy")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log("✅ Đã cài trigger onEditNhatKy thành công.");
  Logger.log("Trigger sẽ chạy mỗi khi sheet NHATKY_TIENDO có dòng mới.");
}

/**
 * Hàm public để gỡ trigger (nếu cần).
 */
function uninstallTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === "onEditNhatKy") {
      ScriptApp.deleteTrigger(t);
    }
  });
  Logger.log("✅ Đã gỡ tất cả trigger onEditNhatKy.");
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLER TRIGGER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * onEditNhatKy(e) — handler được Apps Script gọi khi sheet NhatKy có edit.
 *
 * Lý do dùng trigger onEdit (không poll):
 *   - Phản ứng ngay lập tức (vài giây sau khi CBTD ghi nhật ký qua app).
 *   - Không tốn quota Apps Script vì chỉ chạy khi có edit thực sự.
 *
 * Cơ chế chống trùng / chống spam:
 *   - Chỉ gửi email khi edit vào DÒNG CUỐI CÙNG của sheet (chính là dòng vừa được thêm).
 *     Nếu user sửa ô ở dòng cũ (vd: cập nhật trạng thái duyệt) → KHÔNG gửi email.
 *   - Apps Script onEdit event KHÔNG có rowNumBefore/rowNumAfter, nên ta dùng
 *     cách này thay thế (getRow() === getLastRow()).
 *
 * Lưu ý: Nếu user edit 2 ô khác nhau trong cùng dòng cuối, trigger có thể fire
 * nhiều lần. Mỗi lần đều sẽ gửi email — đây là giới hạn của Apps Script simple trigger.
 * Nếu cần deduplicate, dùng installable trigger + PropertiesService để track timestamp.
 *
 * @param {Object} e - Event object từ Apps Script onEdit trigger.
 */
function onEditNhatKy(e) {
  try {
    if (!e || !e.source) return;

    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();

    // Chỉ xử lý sheet NhatKy (tên sheet phải khớp SHEET_NHATKY trong Code.gs).
    const NHATKY_SHEET_NAME = "NhatKy";
    if (sheetName !== NHATKY_SHEET_NAME) return;

    // Bỏ qua nếu edit vào hàng header.
    if (e.range.getRow() === 1) return;

    // Chỉ xử lý khi edit vào DÒNG CUỐI CÙNG = dòng mới nhất vừa được thêm.
    // Sửa ô ở dòng cũ (vd: KSV duyệt) sẽ KHÔNG trigger email.
    if (e.range.getRow() !== sheet.getLastRow()) return;

    // Lấy dữ liệu dòng cuối cùng (dòng vừa được thêm).
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const row = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    const record = {};
    headers.forEach((h, i) => record[String(h).trim()] = row[i]);

    // Validate tối thiểu: phải có MaNK, MaCV, TienDo.
    // Lưu ý: record["MaNK"] có thể là "" nếu cell rỗng (header đã merge với data).
    if (!record.MaNK || !record.MaCV || !record.TienDo) {
      Logger.log("Dòng cuối thiếu MaNK/MaCV/TienDo — bỏ qua. Record: " + JSON.stringify(record));
      return;
    }

    // Đọc thông tin công việc để lấy hạn chót + nội dung.
    const ss = e.source;
    const cvSheet = ss.getSheetByName("CongViec") || ss.getSheetByName("CONGVIEC");
    let congViec = null;
    if (cvSheet) {
      const cvData = cvSheet.getDataRange().getValues();
      const cvHeaders = cvData[0];
      for (let i = 1; i < cvData.length; i++) {
        const r = {};
        cvHeaders.forEach((h, j) => r[String(h).trim()] = cvData[i][j]);
        if (String(r.MaCV) === String(record.MaCV)) {
          congViec = r;
          break;
        }
      }
    }

    sendNotificationEmail(record, congViec);
  } catch (err) {
    console.error("onEditNhatKy error:", err);
    // Không throw — tránh block các trigger khác.
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  GỬI EMAIL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * sendNotificationEmail(nhatKy, congViec) — gửi email thông báo.
 *
 * @param {Object} nhatKy - Dòng nhật ký vừa thêm (đã map theo header).
 * @param {Object|null} congViec - Dòng công việc tương ứng (để lấy nội dung, hạn chót).
 */
function sendNotificationEmail(nhatKy, congViec) {
  if (!NOTIFY_EMAILS || NOTIFY_EMAILS.length === 0) {
    Logger.log("NOTIFY_EMAILS rỗng → bỏ qua gửi email.");
    return;
  }

  const link = getWebAppUrl();
  const subject = `[QLCV CBTD] Nhật ký mới: ${nhatKy.MaNK} — CV ${nhatKy.MaCV}`;
  const body = buildEmailHtml(nhatKy, congViec, link);

  // Thêm CBTD phụ trách vào CC nếu NOTIFY_OWNER=true và email tồn tại (hỗ trợ cả CBTD1 và CBTD2).
  const ccList = [];
  if (NOTIFY_OWNER && congViec) {
    const cbtd1 = congViec.CBTD1 || congViec.Email_CBTD;
    const cbtd2 = congViec.CBTD2;
    if (cbtd1 && !ccList.includes(cbtd1)) ccList.push(cbtd1);
    if (cbtd2 && !ccList.includes(cbtd2)) ccList.push(cbtd2);
  }

  NOTIFY_EMAILS.forEach(email => {
    // Defensive: bỏ qua nếu email không hợp lệ (null, undefined, empty).
    if (!email || typeof email !== "string" || !email.includes("@")) return;
    try {
      GmailApp.sendEmail(email, subject, "", {
        htmlBody: body,
        cc: ccList.join(","),
        name: "QLCV CBTD System"
      });
      Logger.log("✅ Đã gửi email đến: " + email);
    } catch (err) {
      console.error("Lỗi gửi email tới " + email + ":", err);
    }
  });
}

/**
 * buildEmailHtml(nk, cv, link) — tạo nội dung email HTML đẹp, mobile-friendly.
 */
function buildEmailHtml(nk, cv, link) {
  const cvNoiDung = cv ? escHtml(cv.NoiDung || "") : "(không tìm thấy công việc)";
  const cvHanChot = cv && cv.HanChot ? formatDateHtml(cv.HanChot) : "–";
  const cbtd1 = cv ? (cv.CBTD1 || cv.Email_CBTD || "") : "";
  const cbtd2 = cv ? (cv.CBTD2 || "") : "";
  const cvCBTD = cbtd2 ? `${escHtml(cbtd1)} (Chính) · ${escHtml(cbtd2)} (Hợp công)` : (escHtml(cbtd1) || "–");
  const cvTrangThai = cv ? escHtml(cv.TrangThai || "") : "–";

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0">
    <div style="background:linear-gradient(135deg,#1e88e5,#42a5f5);color:#fff;padding:20px 24px">
      <h2 style="margin:0;font-size:20px">📋 Có nhật ký mới</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.9">Hệ thống QLCV CBTD tự động thông báo</p>
    </div>

    <div style="padding:24px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:8px 0;color:#666;width:140px">Mã nhật ký</td>
          <td style="padding:8px 0;font-weight:600">${escHtml(nk.MaNK)}</td>
        </tr>
        <tr style="background:#f8f9fa">
          <td style="padding:8px;color:#666">Mã công việc</td>
          <td style="padding:8px;font-weight:600">${escHtml(nk.MaCV)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">Nội dung CV</td>
          <td style="padding:8px 0">${cvNoiDung}</td>
        </tr>
        <tr style="background:#f8f9fa">
          <td style="padding:8px;color:#666">CBTD phụ trách</td>
          <td style="padding:8px">${cvCBTD}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">Trạng thái CV</td>
          <td style="padding:8px 0">${cvTrangThai}</td>
        </tr>
        <tr style="background:#f8f9fa">
          <td style="padding:8px;color:#666">Hạn chót</td>
          <td style="padding:8px">${cvHanChot}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">Thời gian cập nhật</td>
          <td style="padding:8px 0">${escHtml(formatDateTimeHtml(nk.ThoiGian))}</td>
        </tr>
        <tr style="background:#fff8e1">
          <td style="padding:12px;color:#666;vertical-align:top">📝 Nội dung tiến độ</td>
          <td style="padding:12px">${escHtml(nk.TienDo)}</td>
        </tr>
      </table>

      ${link ? `
      <div style="margin-top:24px;text-align:center">
        <a href="${link}" style="display:inline-block;background:#1e88e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">🔗 Mở công việc trong hệ thống</a>
      </div>
      ` : ""}
    </div>

    <div style="background:#f5f5f5;padding:12px 24px;font-size:12px;color:#888;border-top:1px solid #e0e0e0">
      Email tự động từ QLCV CBTD — Vui lòng không reply trực tiếp email này.
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPER
// ═══════════════════════════════════════════════════════════════════════════

function getWebAppUrl() {
  if (WEBAPP_URL) return WEBAPP_URL;
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return "";
  }
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateHtml(v) {
  if (!v) return "–";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatDateTimeHtml(v) {
  if (!v) return "–";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}