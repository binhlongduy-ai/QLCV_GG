# Hướng dẫn Triển khai & Cấu hình Hệ thống QLCV CBTD (v2.0)

Tài liệu hướng dẫn toàn diện từ chuẩn bị Cơ sở dữ liệu Google Sheets, nạp mã nguồn Google Apps Script (GAS), cấu hình quyền hạn, thiết lập tự động hóa (Trigger email), cấu hình Service Worker cho PWA, đến kiểm thử & đồng bộ cục bộ.

> **Phiên bản áp dụng**: QLCV CBTD v2.0 — Hỗ trợ 2 Cán bộ Tín dụng (CBTD1 chủ trì + CBTD2 hợp công), lọc đa tiêu chí, Dashboard BGĐ, email notification, PWA.

---

## Mục lục

1. [Chuẩn bị Cơ sở Dữ liệu Google Sheets](#1-chuẩn-bị-cơ-sở-dữ-liệu-google-sheets-db_qlcv_cbtd)
2. [Triển khai Google Apps Script (Backend)](#2-triển-khai-google-apps-script-backend)
3. [Cấu hình Deploy Web App](#3-cấu-hình-deploy-web-app)
4. [Cập nhật Code KHÔNG ĐỔI URL](#4-quy-trình-cập-nhật-code-mà-không-đổi-url-web-app)
5. [Thiết lập Triggers Email](#5-thiết-lập-triggers-tự-động-gửi-email)
6. [Cấu hình Email người nhận (`NOTIFY_EMAILS`)](#6-cấu-hình-email-người-nhận-notify_emails)
7. [Cấu hình PWA (Cài đặt như ứng dụng)](#7-cấu-hình-pwa-progressive-web-app)
8. [Phân quyền & Vai trò](#8-phân-quyền-và-vai-trò-người-dùng)
9. [Tính năng & Bộ lọc](#9-tính-năng--bộ-lọc-chính)
10. [Demo Mode (chạy thử không cần Deploy)](#10-demo-mode-chạy-thử-không-cần-deploy)
11. [Lệnh kiểm tra & Đồng bộ cục bộ](#11-các-lệnh-kiểm-tra--đồng-bộ-cục-bộ)
12. [Xử lý sự cố](#12-xử-lý-sự-cố-thường-gặp-troubleshooting-faq)

---

## 1. Chuẩn bị Cơ sở Dữ liệu Google Sheets (`DB_QLCV_CBTD`)

Mở (hoặc tạo mới) file Google Sheets và thiết lập đúng **4 Sheet (Tab)** với cấu trúc tiêu đề cột ở dòng 1 như sau.

> **Quan trọng**: Tên sheet phân biệt HOA/thường. Đặt tên chính xác: `Users`, `CongViec`, `NhatKy`, `KhachHang` (theo đúng biến `SHEET_USERS`, `SHEET_CONGVIEC`, `SHEET_NHATKY`, `SHEET_KHACHHANG` trong `Code.gs`).

### 1.1. Tab `Users` (Danh sách Cán bộ & Phân quyền)

| Email | TenCanbo | Role |
|---|---|---|
| `admin@congty.com` | Nguyễn Văn Quản Trị | Admin |
| `cbtd01@congty.com` | Trần Thị Cán Bộ 1 | CBTD |
| `cbtd02@congty.com` | Lê Văn Cán Bộ 2 | CBTD |
| `ksv01@congty.com` | Phạm Văn Kiểm Soát 1 | KSV |
| `bgd01@congty.com` | Hoàng Văn Giám Đốc | BGD |

**Quy định**:
- `Email`: Phải là Gmail hoặc Google Workspace cán bộ đang dùng để đăng nhập trình duyệt (dùng để xác thực qua `Session.getActiveUser().getEmail()`).
- `Role`: Một trong 4 giá trị — `Admin`, `CBTD`, `KSV`, `BGD`. **Admin** có toàn quyền; **CBTD** chỉ thấy công việc mình phụ trách; **KSV** duyệt nhật ký; **BGD** xem dashboard.
- Bảng này ánh xạ 1-1 với danh sách cán bộ tín dụng hiển thị trên các dropdown CBTD1/CBTD2 khi tạo công việc.

### 1.2. Tab `KhachHang` (Danh mục Khách hàng Tín dụng)

| MaKH | TenKH | NhomKH | LoaiKH | NhomNo |
|---|---|---|---|---|
| `KH001` | Công ty TNHH ABC | Doanh nghiệp | Quản lý | Nhóm 1 |
| `KH002` | Nguyễn Văn A | Cá nhân | Đang phát triển | Chưa dư nợ |
| `KH003` | Trần Thị B | Cá nhân | Đang phát triển | Nhóm 2 |
| `KH004` | Công ty CP XYZ | Doanh nghiệp | Xử lý nợ | Nhóm 5 |
| `KH005` | Hộ KD Minh Tâm | Hộ kinh doanh | Quản lý | Nhóm 1 |

**Quy chuẩn**:
- `NhomKH`: `Doanh nghiệp`, `Cá nhân`, `Hộ kinh doanh`.
- `LoaiKH`: `Đang phát triển`, `Quản lý`, `Xử lý nợ` — Hiển thị trên Dashboard BGĐ.
- `NhomNo`: `Chưa dư nợ`, `Nhóm 1`, `Nhóm 2`, `Nhóm 3`, `Nhóm 5`, `XLRR` — Phân bổ rủi ro trên Dashboard.

### 1.3. Tab `CongViec` (Hồ sơ & Công việc Tín dụng)

| MaCV | MaKH | NoiDung | CBTD1 | CBTD2 | HanChot | TrangThai | Mucdo | DienGiai |
|---|---|---|---|---|---|---|---|---|
| `CV001` | `KH001` | Thẩm định hồ sơ vay vốn kinh doanh | `cbtd01@congty.com` | `cbtd02@congty.com` | `2026-08-20T17:00:00` | Đang xử lý | Ưu tiên | Khách hàng cần giải ngân trước ngày 25 |

**Quy định**:
- `MaCV`: Định danh duy nhất, bắt buộc.
- `MaKH`: **Bắt buộc**, phải tồn tại trong tab `KhachHang`.
- `CBTD1`: Cán bộ tín dụng **chủ trì** / chịu trách nhiệm chính (**Bắt buộc**). Email phải có trong tab `Users` với `Role = CBTD`.
- `CBTD2`: Cán bộ tín dụng **phối hợp / hợp công** (Tùy chọn). Nếu có, cũng phải có trong `Users` với `Role = CBTD`.
- `HanChot`: Định dạng ISO 8601 — `YYYY-MM-DDTHH:MM:SS` (ví dụ: `2026-08-20T17:00:00`). Hệ thống dùng để tính trễ hạn.
- `TrangThai`: `Mới giao`, `Đang xử lý`, `Chờ duyệt`, `Hoàn thành`, `Từ chối`.
- `Mucdo`: `Ưu tiên`, `Bình thường`, `Khác`.
- `DienGiai`: Tùy chọn, có thể cập nhật sau.

**Tương thích ngược với schema cũ**:
- Nếu sheet của bạn đang dùng cột `Email_CBTD` (không có `CBTD1`), hệ thống **tự động đọc** từ `Email_CBTD` và ánh xạ thành `CBTD1`.
- Khi ghi dữ liệu mới, hệ thống đồng thời ghi vào cả `CBTD1` và `Email_CBTD` (nếu cột tồn tại) để không phá vỡ dữ liệu cũ.
- **Khuyến nghị**: Sau khi deploy thành công, thêm cột `CBTD1`, `CBTD2` vào sheet và copy giá trị từ `Email_CBTD` sang `CBTD1` (nếu cần).

### 1.4. Tab `NhatKy` (Nhật ký Tiến độ)

| MaNK | MaCV | TienDo | ThoiGian | KSV_Duyet | ThoiGian_Duyet | EmailCBTD | EmailKSV |
|---|---|---|---|---|---|---|---|
| `NK001` | `CV001` | Đã thu thập hồ sơ pháp lý doanh nghiệp | `2026-08-10T09:00:00` | `TRUE` | `2026-08-10T14:00:00` | `cbtd01@congty.com` | `ksv01@congty.com` |

**Quy định**:
- `MaNK`: Mã nhật ký duy nhất (Append Only — không sửa, không xóa).
- `MaCV`: Phải tồn tại trong `CongViec`.
- `TienDo`: Nội dung tiến độ (Append Only).
- `ThoiGian`: ISO 8601, tự động điền.
- `KSV_Duyet`: `TRUE` / `FALSE` (boolean).
- `ThoiGian_Duyet`: ISO 8601, tự động khi KSV duyệt.
- `EmailCBTD` *(tùy chọn)*: Email người tạo nhật ký — dùng cho modal xem nhật ký hiển thị "Người cập nhật". Có thể dùng fallback `NguoiCapNhat` nếu đã có sẵn.
- `EmailKSV` *(tùy chọn)*: Email KSV duyệt — chỉ lưu nếu cần audit.

---

## 2. Triển khai Google Apps Script (Backend)

### Bước 1 — Mở Apps Script
1. Mở Google Sheet `DB_QLCV_CBTD` → menu **Tiện ích mở rộng (Extensions) → Apps Script**.

### Bước 2 — Tạo file trong dự án
Trong trình soạn thảo Apps Script, tạo đúng **5 file** với tên chính xác:

| File Apps Script | Nguồn từ workspace | Mô tả |
|---|---|---|
| `Code` | `Code.gs` | Backend API (auth, CRUD, dashboard, lock) |
| `Triggers` | `Triggers.gs` | Email notification trigger `onEditNhatKy` |
| `index` | `index.html` | HTML shell — load CSS/JS qua `include()` |
| `app_js` | `app_js.html` | Frontend logic (đã đóng gói base64 từ `app.js`) |
| `index_css` | `index_css.html` | Frontend styles (đã đóng gói base64 từ `index.css`) |

**Quy trình copy**:
1. Mở file nguồn trong workspace (`C:\coding\web\`).
2. Copy toàn bộ nội dung (Ctrl+A → Ctrl+C).
3. Trong Apps Script editor: bấm **+** → **Script** hoặc **HTML**, đặt tên đúng, paste nội dung.

> **Lưu ý**: Tên file trong Apps Script **không có** phần mở rộng (`.gs`, `.html`) — Apps Script tự nhận diện loại file theo syntax highlighting.

### Bước 3 — Lưu dự án
Bấm **Save project (Ctrl + S)**. Nếu có lỗi cú pháp, sửa trước khi tiếp tục.

---

## 3. Cấu hình Deploy Web App

### Bước 1 — Mở Deploy dialog
Bấm nút **Deploy (Triển khai)** góc trên bên phải → **New deployment**.

### Bước 2 — Chọn loại
- Bấm biểu tượng bánh răng ⚙️ → chọn **Web app**.

### Bước 3 — Thiết lập thông số

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Description | `QLCV CBTD v2.0` | Mô tả phiên bản |
| Execute as | **`User accessing the web app`** | **BẮT BUỘC** — để backend lấy được email Google của người truy cập qua `Session.getActiveUser().getEmail()` |
| Who has access | `Anyone within [Organization]` (Google Workspace) **HOẶC** `Anyone with Google account` (Gmail) | Tùy môi trường |

### Bước 4 — Authorize
Lần đầu deploy, Google sẽ yêu cầu cấp quyền:
1. Chọn tài khoản Google.
2. Bấm **Advanced (Nâng cao)** → **Go to [Tên dự án] (unsafe)** → **Allow (Cho phép)**.

Hệ thống cần các scope: `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/script.send_mail`, `https://www.googleapis.com/auth/userinfo.email`.

### Bước 5 — Lưu URL
Copy **Web App URL** (dạng `https://script.google.com/macros/s/AKfycb.../exec`). URL này sẽ dùng cho Google Sites (xem `HUONG_DAN_GOOGLE_SITES.md`) hoặc truy cập trực tiếp.

---

## 4. Quy trình Cập nhật Code mà KHÔNG ĐỔI URL Web App

Mỗi khi chỉnh sửa code, **không tạo deployment mới** (sẽ đổi URL). Thay vào đó:

1. Bấm **Deploy → Manage deployments**.
2. Chọn deployment hiện tại trong danh sách bên trái.
3. Bấm biểu tượng **Cây bút ✏️ (Edit)** ở góc trên bên phải.
4. Ở mục **Version**, chọn **New version** → nhập mô tả thay đổi.
5. Bấm **Deploy**. URL được bảo toàn 100%.

---

## 5. Thiết lập Triggers Tự động (Gửi Email)

Hệ thống có 1 trigger tự động trong `Triggers.gs`:

### 5.1. `onEditNhatKy(e)` — Email khi có nhật ký tiến độ mới

- **Loại**: Simple trigger (tự động nhận diện, không cần cài đặt thủ công).
- **Điều kiện kích hoạt**: Edit vào sheet `NhatKy` ở **dòng cuối** (chính là dòng vừa được thêm).
- **Hành động**: Gửi email tới `NOTIFY_EMAILS` và CC cho `CBTD1` + `CBTD2` của công việc liên quan (nếu `NOTIFY_OWNER = true`).

### 5.2. Các hàm tiện ích trong `Triggers.gs`

| Hàm | Mục đích |
|---|---|
| `installTriggers()` | Cài đặt installable trigger programmatically (nếu muốn dùng `onEdit` installable thay vì simple). |
| `uninstallTriggers()` | Gỡ tất cả installable triggers. |
| `onEditNhatKy(e)` | Handler chính — đã được Apps Script tự động đăng ký khi copy file. |
| `sendNotificationEmail(nk, cv)` | Gửi email HTML đẹp, mobile-friendly. |

### 5.3. Nếu cần trigger installable (chống spam bằng `PropertiesService`)
Chạy một lần duy nhất:
```
installTriggers()
```
Hàm này sẽ tạo installable trigger `On change` cho spreadsheet, lưu `PropertiesService` timestamp để tránh gửi email trùng khi cùng 1 dòng được edit nhiều lần.

---

## 6. Cấu hình Email người nhận (`NOTIFY_EMAILS`)

Mở `Triggers.gs` ở đầu file, tìm:

```javascript
const NOTIFY_EMAILS = [
  // "nguoinhan1@congty.com",
  // "ksv01@congty.com",
];

const NOTIFY_OWNER = true;  // CC cho CBTD1 + CBTD2 của công việc
```

### 6.1. Thêm người nhận
Bỏ comment (xóa `//`) và thêm email:

```javascript
const NOTIFY_EMAILS = [
  "bgd01@congty.com",
  "ksv01@congty.com"
];
```

### 6.2. Cấu hình CC chủ phụ trách
- `NOTIFY_OWNER = true`: Mỗi email sẽ CC cho `CBTD1` và `CBTD2` của công việc.
- `NOTIFY_OWNER = false`: Chỉ gửi tới `NOTIFY_EMAILS`.

### 6.3. Test gửi email thử
Trong Apps Script editor, mở function `sendNotificationEmail` → chạy thử với dữ liệu mẫu để đảm bảo GmailApp hoạt động.

---

## 7. Cấu hình PWA (Progressive Web App)

Hệ thống hỗ trợ cài đặt như ứng dụng trên điện thoại/máy tính.

### 7.1. File liên quan
- `manifest.json` — Khai báo metadata ứng dụng (tên, icon, theme color, start_url).
- `sw.template.js` — Service Worker template cho caching offline.

### 7.2. Triển khai
1. Upload `manifest.json` lên HTTPS host (Google Sites không host trực tiếp được, nên dùng GitHub Pages, Firebase Hosting, hoặc static host).
2. Sửa `sw.template.js`: thay `__GAS_BASE_URL__` bằng URL Web App.
3. Upload `sw.template.js` (đổi tên thành `sw.js`) cùng host với `manifest.json`.
4. Trong `index.html`, tìm dòng có comment `// Host manifest.json externally`:

```html
<link rel="manifest" href="https://your-host.example.com/manifest.json">
<script>
  window.__SW_URL__ = "https://your-host.example.com/sw.js";
</script>
```

### 7.3. Hỗ trợ trình duyệt
- ✅ Chrome / Edge (Desktop + Android) — Hỗ trợ đầy đủ cài đặt PWA.
- ⚠️ Safari / iOS — Manifest phải host qua HTTPS, không hỗ trợ `beforeinstallprompt`.
- Nếu không host manifest, app vẫn chạy bình thường, chỉ không có nút "Cài đặt ứng dụng".

---

## 8. Phân quyền và Vai trò Người dùng

| Vai trò | Quyền hạn chi tiết |
|---|---|
| **Admin** | Toàn quyền: CRUD Users, CRUD Khách hàng, CRUD Công việc, Đồng bộ DB, Kiểm tra toàn vẹn, xem tất cả công việc & nhật ký. Truy cập trang `csdl` (Cơ sở dữ liệu). |
| **BGD** *(Ban Giám đốc)* | Dashboard toàn diện với filter bar (CBTD/KH), xem tất cả chỉ số, xuất Excel báo cáo. **KHÔNG thể** sửa trạng thái công việc (UI ẩn dropdown trạng thái). |
| **KSV** *(Kiểm soát viên)* | CRUD Công việc (trừ xóa), CRUD Khách hàng (trừ xóa), **Duyệt nhật ký tiến độ** (hàm `duyetTienDo`), nhận email thông báo khi có nhật ký mới. |
| **CBTD** *(Cán bộ tín dụng)* | **Chỉ thấy** công việc mình là `CBTD1` (chủ trì) hoặc `CBTD2` (hợp công). Được cập nhật diễn giải + ghi nhật ký tiến độ cho công việc của mình. Có thể CRUD Khách hàng. **Không thể** tạo công việc có `CBTD1` là người khác. **Không thể** duyệt nhật ký. |

### Cơ chế bảo mật chống giả mạo
Backend **luôn** tra cứu role thực tế từ `Session.getActiveUser().getEmail()` → tìm trong `Users` sheet. Không tin tưởng `params.role` từ client.

---

## 9. Tính năng & Bộ lọc chính

### 9.1. Dashboard BGĐ
- **6 thẻ chỉ số**: Tổng CV, Hoàn thành, Tỷ lệ đúng hạn, Nhật ký chờ duyệt, Trễ hạn, Tổng KH.
- **Filter bar**: Lọc theo CBTD / Khách hàng — cập nhật tức thì toàn bộ dashboard.
- **2 biểu đồ**: Phân bổ theo Trạng thái (doughnut), Khối lượng CV theo CBTD (bar chart — drill-down được).
- **2 thẻ KPI mini**: Phân bổ KH theo Nhóm nợ, Phân bổ theo Loại KH.
- **Bảng trễ hạn**: Liệt kê CV sắp / đã quá hạn, có badge đỏ.
- **Xuất Excel**: Sheet Tổng quan + Chi tiết CV + Khách hàng.

### 9.2. Quản lý Công việc
- **Bộ lọc 5 tiêu chí**: Search (mã CV/nội dung/KH/CBTD/diễn giải), CBTD, Khách hàng, Mức độ, Trạng thái.
- **Drill-down từ Dashboard**: Click vào biểu đồ trạng thái/CBTD → mở trang Công việc với filter tương ứng.
- **Drill-down 2 cấp**: Click vào `MaCV` trong bảng → mở modal Nhật ký tiến độ (lịch sử update).
- **Modal tạo CV**: Dropdown Khách hàng + Dropdown CBTD1 + Dropdown CBTD2 + Dropdown "Danh mục công việc chuẩn" (13 danh mục mẫu tín dụng DN/CN) — tự động điền nội dung khi chọn.
- **Đổi trạng thái inline**: Dropdown trực tiếp trong bảng (CBTD/KSV/Admin — không hiển thị với BGD).

### 9.3. Nhật ký Tiến độ
- **Bộ lọc 4 tiêu chí**: Search, CBTD, Khách hàng, Trạng thái duyệt.
- **Modal Thêm NK**: Dropdown chọn công việc, tự sinh mã NK tiếp theo.
- **Modal Xem NK**: Hiển thị lịch sử tiến độ (mới nhất trước) với tên người cập nhật.
- **Duyệt nhật ký** (KSV/Admin): Nút ✅ Duyệt trên từng dòng chưa duyệt.

### 9.4. Khách hàng & Người dùng
- **CRUD đầy đủ**.
- **Import XLSX**: Hỗ trợ upload file Excel để thêm nhiều Khách hàng / Người dùng cùng lúc. Có validation trước khi import (báo lỗi trùng mã, thiếu trường bắt buộc).

### 9.5. Cơ sở dữ liệu (Admin only)
- **Đồng bộ App → DB**: Đẩy toàn bộ dữ liệu đang có trong bộ nhớ trình duyệt lên Google Sheet (upsert theo MaCV/MaKH/Email/MaNK).
- **Tải lại toàn bộ**: Xóa cache trình duyệt và reload từ DB.
- **Kiểm tra toàn vẹn**: Phát hiện thiếu sheet, thiếu cột, mã trùng, tham chiếu mồ côi (MaKH không tồn tại, CBTD1/CBTD2 không có trong Users, MaCV không tồn tại trong NhatKy).

---

## 10. Demo Mode (chạy thử không cần Deploy)

Khi mở `app.js` mà chưa cấu hình `API_URL` (mặc định là `YOUR_DEPLOYED_WEB_APP_URL_HERE`), hệ thống tự động vào **Demo Mode**:

- Sử dụng dữ liệu mẫu `DEMO_DATA` (5 users, 5 KH, 7 CV, 5 NK).
- Đăng nhập bằng 1 trong các email: `admin@example.com`, `cbtd01@example.com`, `cbtd02@example.com`, `ksv01@example.com`, `bgd01@example.com`.
- Tất cả thao tác CRUD hoạt động bình thường (trên bộ nhớ, không persist).
- Hiển thị banner cảnh báo "DEMO MODE" ở console.

**Cách thoát Demo Mode**:
1. Deploy Web App thành công → copy URL.
2. Sửa `app.js`:
   ```javascript
   const _DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ```
3. Chạy `sync_wrappers.ps1` để đồng bộ `app_js.html`.
4. Re-deploy Apps Script **New version**.

---

## 11. Các lệnh Kiểm tra & Đồng bộ cục bộ

Trước khi deploy, luôn chạy 2 lệnh sau tại thư mục workspace (`C:\coding\web\`):

```powershell
# 1. Đồng bộ app.js + index.css vào wrapper HTML (BẮT BUỘC mỗi lần sửa frontend):
powershell -ExecutionPolicy Bypass -File .\sync_wrappers.ps1

# 2. Kiểm tra cú pháp toàn diện (Code.gs, Triggers.gs, app.js):
node verify_syntax.js
```

Output mong đợi:
```
[OK] app_js.html synced
[OK] index_css.html synced

[ALL WRAPPERS SYNCED]

[OK] Code.gs
[OK] Triggers.gs
[OK] app.js

[ALL PASSED]
```

> **Lưu ý quan trọng**: Sau khi sửa `app.js` hoặc `index.css`, PHẢI chạy `sync_wrappers.ps1` trước khi copy `app_js.html` / `index_css.html` lên Apps Script. Nếu không, frontend sẽ dùng phiên bản cũ.

---

## 12. Xử lý Sự cố Thường gặp (Troubleshooting FAQ)

### Lỗi triển khai & quyền
- **"Tài khoản chưa được cấp quyền"**: Email chưa có trong tab `Users`. Hãy thêm dòng mới.
- **"Không xác định được tài khoản Google đang đăng nhập"**: Sai `Execute as`. Phải đặt `User accessing the web app`.
- **"Bạn không có quyền thực hiện thao tác này"**: Role trong `Users` không khớp với yêu cầu của API. Admin dùng được mọi thứ.
- **Giao diện không nhận CSS/JS mới**: Chạy `sync_wrappers.ps1` → copy lại `app_js.html` và `index_css.html` → deploy **New version**.

### Lỗi Schema & Tương thích
- **Thiếu cột trong sheet**: Chạy `checkIntegrity` (trang Cơ sở dữ liệu, Admin) để xem chi tiết cột thiếu.
- **Hệ thống không nhận diện CBTD1/CBTD2**: Sheet có thể đang dùng `Email_CBTD` cũ. Hệ thống vẫn đọc được nhưng nên thêm cột `CBTD1` vào sheet và copy dữ liệu.
- **CBTD không thấy công việc nào**: Email của họ không khớp với `CBTD1`/`CBTD2` trong sheet `CongViec`. Kiểm tra viết thường/viết hoa và khoảng trắng.

### Lỗi Trigger Email
- **Không nhận email khi có nhật ký mới**: 
  1. Kiểm tra `NOTIFY_EMAILS` đã được uncomment.
  2. Vào Apps Script → **Executions** xem log `onEditNhatKy`.
  3. Chắc chắn đang edit ở **dòng cuối** của sheet `NhatKy` (sửa dòng cũ sẽ KHÔNG gửi).
  4. Tên sheet phải đúng `NhatKy` (case-sensitive). Nếu đổi tên, sửa `NHATKY_SHEET_NAME` trong `Triggers.gs`.
- **Bị spam email**: Trigger `onEdit` đôi khi fire nhiều lần cho cùng 1 dòng. Chạy `installTriggers()` để dùng installable trigger có `PropertiesService` deduplicate.

### Lỗi Concurrency
- **"Hệ thống đang bận xử lý dữ liệu đồng thời"**: 2 user đang ghi cùng lúc. Đợi vài giây rồi thử lại — `LockService` chỉ cho phép 1 writer tại 1 thời điểm.

### Lỗi UI & Browser
- **Modal không đóng khi click overlay**: Đã có inline `onclick` trên modal. Nếu không hoạt động, kiểm tra browser console.
- **PWA không cài được trên iPhone**: Safari cần `manifest.json` host qua HTTPS, không hỗ trợ `beforeinstallprompt` event.
- **Chart không hiển thị**: Kiểm tra CDN `chart.js@4.4.4` có load được không (một số mạng công vụ chặn CDN).

### Cách lấy log debug
Trong Apps Script editor:
- **Executions**: Xem log mỗi lần API được gọi (rất quan trọng để debug).
- **Logger.log()** / **console.log()**: Thêm vào code để trace.
- **Trình duyệt DevTools** (F12 → Console): Xem log frontend, network request.

---

## Phụ lục A — Schema nâng cấp từ phiên bản cũ

Nếu bạn đang dùng phiên bản cũ (schema `Email_CBTD` đơn):

1. Mở tab `CongViec`, thêm cột `CBTD1` ngay sau cột `MaKH` hoặc cuối sheet.
2. Copy công thức cho cột `CBTD1`:
   ```
   =IF(ISBLANK(Email_CBTD), "", Email_CBTD)
   ```
3. Kéo xuống tất cả các dòng.
4. (Tùy chọn) Thêm cột `CBTD2` để hỗ trợ 2 cán bộ.
5. Deploy **New version** trên Apps Script.
6. Hệ thống sẽ **tự động** ưu tiên đọc `CBTD1`; nếu trống sẽ fallback về `Email_CBTD`.

## Phụ lục B — Danh mục Công việc Chuẩn CBTD

Hệ thống cung cấp sẵn 13 danh mục công việc tín dụng mẫu (dropdown trong modal Thêm CV):

1. Tiếp cận & Thu thập hồ sơ pháp lý, hồ sơ tài chính KHDN
2. Kiểm tra thực địa & Thẩm định phương án SXKD
3. Định giá & Thẩm định TSBĐ (BĐS / Phương tiện / Máy móc)
4. Lập Tờ trình Thẩm định Tín dụng & Đề xuất hạn mức
5. Trình Phê duyệt Tín dụng (KSV / BGĐ / HĐTD)
6. Soạn thảo Hợp đồng Tín dụng, HĐ Thế chấp & Khế ước nhận nợ
7. Công chứng hợp đồng & Đăng ký Giao dịch bảo đảm
8. Kiểm tra điều kiện tiên quyết & Hoàn tất thủ tục giải ngân
9. Kiểm tra sử dụng vốn vay sau giải ngân (định kỳ 30/60/90 ngày)
10. Tái thẩm định & Đánh giá xếp hạng tín nhiệm KH định kỳ
11. Gia hạn nợ / Cơ cấu lại thời hạn trả nợ
12. Nhắc nợ, đôn đốc & Xử lý thu hồi nợ đến hạn / quá hạn
13. Xử lý TSBĐ & Hoàn thiện hồ sơ XLRR

Có thể tùy chỉnh danh sách trong biến `DANH_MUC_CONG_VIEC_MAU` ở đầu `app.js`.

## Phụ lục C — Cấu trúc file dự án

```
C:\coding\web\
├── Code.gs              # Backend chính (auth, CRUD, dashboard)
├── app.js                # Frontend logic (raw — dùng để phát triển)
├── index.html           # HTML shell — load CSS/JS qua include()
├── index.css            # Frontend styles (raw)
├── Triggers.gs          # Email notification trigger
├── manifest.json        # PWA manifest (cần host HTTPS)
├── sw.template.js       # Service Worker template
├── verify_syntax.js     # Node script — kiểm tra cú pháp
├── sync_wrappers.ps1    # PowerShell script — sync app.js/index.css → wrapper HTML
├── HUONG_DAN_DEPLOY.md  # File này
├── HUONG_DAN_GOOGLE_SITES.md  # Hướng dẫn tạo Portal Google Sites
├── app_js.html          # Wrapper HTML cho app.js (auto-generated)
└── index_css.html       # Wrapper HTML cho index.css (auto-generated)
```