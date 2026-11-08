# Phân Tích Bug Đã Fix & Workarounds (Cần Lưu Ý Khi Rebuild)

Dự án hiện tại hoạt động trên nền Google Apps Script (GAS) và Google Sheets, do đó đã phải implement nhiều giải pháp workaround để khắc phục các hạn chế của nền tảng này. Khi rebuild sang hệ thống mới (VD: Node.js/PostgreSQL), có thể gỡ bỏ các workaround này hoặc cần xử lý cẩn thận.

## 1. Concurrency & LockService
**Vấn đề:** Google Sheets không phải là CSDL quan hệ. Khi nhiều user cùng ghi dữ liệu (ví dụ: tạo nhật ký, thêm công việc) cùng lúc, dữ liệu có thể bị ghi đè hoặc sai lệch hàng.
**Workaround hiện tại:** 
- Rất nhiều API sử dụng `LockService.getScriptLock()` để tạo atomic transaction.
**Thiết kế cho hệ thống mới:**
- Khi chuyển sang RDBMS (như PostgreSQL) hoặc DB chuyên dụng, có thể tận dụng ACID transactions và row-level locking tự nhiên, không cần thiết kế cơ chế script lock thủ công.

## 2. Trigger Spam & onEdit Limitations
**Vấn đề:** Cần gửi email khi CBTD thêm nhật ký mới, nhưng không thể sử dụng polling (sẽ hết quota).
**Workaround hiện tại:**
- Sử dụng Simple Trigger `onEdit` thay vì Installable Trigger để giảm độ trễ và tránh tốn quota.
- Lọc `getRow() === getLastRow()` để đảm bảo chỉ gửi email khi có một dòng mới được thêm, tránh việc gửi email mỗi khi KSV duyệt (chỉnh sửa dòng cũ).
- **Lỗi đã fix:** Nếu edit 2 ô ở cùng 1 dòng, Apps Script có thể bắn 2 sự kiện email. Hệ thống hiện tại phải sống chung với việc này (hoặc dùng PropertiesService track timestamp).
**Thiết kế cho hệ thống mới:**
- Khi rebuild, logic này sẽ được chuyển thành backend Webhook hoặc Event-driven architecture (vd: emit event `NhatKyCreated` để trigger worker gửi email một cách an toàn và deduplicate).

## 3. Email Binding (CBTD1 & CBTD2)
**Vấn đề:** Trong sheet lưu danh sách người chịu trách nhiệm, thiết kế trước đây có thể gom chung `Email_CBTD` hoặc tách biệt nhưng logic truy vấn phức tạp do lưu ở dạng chuỗi text trên bảng tính.
**Workaround hiện tại:**
- Logic query phải filter thủ công: `row.CBTD1 === userEmail || row.CBTD2 === userEmail`.
**Thiết kế cho hệ thống mới:**
- Ở hệ thống mới, nên sử dụng bảng liên kết (Join Table) như `CongViec_Assignee` hoặc lưu trữ mảng JSON trong CSDL để dễ dàng query.

## 4. Cache Bypass cho App Assets
**Vấn đề:** Các file tĩnh (HTML, CSS, JS) khi phục vụ qua GAS thường bị cache rất lâu.
**Workaround hiện tại:**
- Phải dùng build script `sync_wrappers.ps1` để wrap CSS và JS vào HTML, biến ứng dụng thành SPA nằm gọn trong 1 file `index.html` duy nhất (và vài file include).
**Thiết kế cho hệ thống mới:**
- Chuyển sang Vite/React/Vue, assets sẽ được bundle và đánh mã hash (Cache busting) một cách tự động, loại bỏ hoàn toàn build script wrapper thủ công này.
