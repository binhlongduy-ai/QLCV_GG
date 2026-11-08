# 📝 Nhật ký phiên làm việc (Session Changelog)
**Ngày thực hiện:** 2026-11-08  
**Dự án:** Quản lý Công việc Cán bộ Tín dụng (QLCV CBTD)  
**Hướng triển khai:** AppSheet + Google Sheets (Pilot)  
**Tác giả / Hỗ trợ:** Antigravity AI Assistant & Kỹ sư dự án  

---

## 📌 1. Mục tiêu phiên làm việc
1. Rà soát lại tiến độ tổng thể của dự án sau khi chuyển hướng sang AppSheet từ bản cũ React/Express.
2. Hoàn thiện các tài liệu đặc tả nghiệp vụ, ma trận quyền và kịch bản vận hành còn thiếu.
3. Bổ sung các ca thử nghiệm biên còn thiếu trong bộ công cụ kiểm tra toàn vẹn dữ liệu.
4. Triển khai tài liệu hướng dẫn và mã nguồn tự động hóa cho U2 (Tạo sổ Google Sheets & cấu hình bảo mật AppSheet).
5. Hiện thực hóa các thiết kế Views, Forms, Slices, Actions và Bots cho U3–U6.
6. Thiết lập môi trường chạy thử nghiệm giao diện và phân quyền trực tiếp trên máy cục bộ (Local Mockup Server).

---

## 🚀 2. Tóm tắt các kết quả đã hoàn thành

### A. Tài liệu đặc tả kỹ thuật & Hướng dẫn (Docs)
Được lưu trữ tập trung tại thư mục [`docs/appsheet/`](./docs/appsheet/):

1. [`docs/appsheet/role-permission-matrix.md`](./docs/appsheet/role-permission-matrix.md):
   - Bảng phân quyền chi tiết cho 15 quyền (`PER-01` đến `PER-15`) qua 4 vai trò: **Admin, BGD, KSV, CBTD**.
   - Định nghĩa biểu thức phân quyền cho các yêu cầu R15 (Dashboard Giám đốc), R16 (Quản trị User & Backup/Restore), R17 (Trường đại diện Công ty & Action Chuyển giao).
   - Quy định màn hình đầu (Starting View) theo vai trò (R14).

2. [`docs/appsheet/operations-runbook.md`](./docs/appsheet/operations-runbook.md):
   - Sổ tay vận hành hệ thống: Quản lý vòng đời tài khoản (thêm/đổi vai trò/thu hồi).
   - Quy trình sao lưu và phục hồi dữ liệu (Backup / Restore).
   - Giám sát lỗi automation, phân loại sự cố P1–P4 và quy trình phản ứng khẩn cấp.
   - Checklist định kỳ hàng tuần cho quản trị viên.

3. [`docs/appsheet/u2-appsheet-setup-guide.md`](./docs/appsheet/u2-appsheet-setup-guide.md):
   - Hướng dẫn thiết lập sổ Google Sheets và tạo app AppSheet từng bước.
   - Hướng dẫn cấu hình kiểu dữ liệu, các quan hệ tham chiếu `Ref`.
   - Cấu hình xác thực Google Workspace và các biểu thức **Security Filter** lọc dữ liệu cấp dòng (Tasks, Customers, TaskUpdates, Notifications, AuditLogs).

4. [`docs/appsheet/u3-views-actions-spec.md`](./docs/appsheet/u3-views-actions-spec.md):
   - Đặc tả giao diện nghiệp vụ Công việc và Khách hàng (U3).
   - Ràng buộc Form Task: CBTD chỉ được tạo việc khi tự là người chính (R6).
   - Action bắt đầu việc `Task_Start`, chặn CBTD tự chuyển sang `completed`.
   - Action chuyển giao người thực hiện `Task_Transfer_Primary` (R17).

5. [`docs/appsheet/u4-progress-approval-spec.md`](./docs/appsheet/u4-progress-approval-spec.md):
   - Đặc tả quy trình nộp tiến độ lũy kế 0–100% kèm diễn giải (R7).
   - Action Duyệt / Từ chối (bắt buộc nhập lý do) của KSV/Admin.
   - Cơ chế tự động chuyển công việc sang `completed` khi duyệt tiến độ 100% (R8).
   - Ràng buộc không sửa/ghi đè lịch sử (Append-only) và khóa công việc đã đóng.

6. [`docs/appsheet/u5-dashboard-kpi-spec.md`](./docs/appsheet/u5-dashboard-kpi-spec.md):
   - Đặc tả Slice ưu tiên cho Giám đốc (`Slice_Director_Priority_Tasks` - R15).
   - 6 khối chỉ số KPI động (KPI-01 đến KPI-06) tuân thủ bảo mật theo vai trò.
   - Bố cục giao diện Dashboard chuyên biệt cho từng cấp độ người dùng.

7. [`docs/appsheet/u6-notification-audit-spec.md`](./docs/appsheet/u6-notification-audit-spec.md):
   - Đặc tả hệ thống thông báo nội bộ In-app (R11), cơ chế khử trùng lặp sự kiện `request_or_event_key`.
   - Đặc tả bảng `AuditLogs` riêng biệt (R12), phân quyền chỉ Admin xem (R16).

8. [`docs/appsheet/u3-u6-implementation-summary.md`](./docs/appsheet/u3-u6-implementation-summary.md):
   - Bảng tổng hợp cấu hình đầy đủ cho AppSheet Editor: 5 Slices, 12 Views/Forms, 6 Actions và 2 Bots tự động.

9. [`docs/appsheet/acceptance-test-matrix.md`](./docs/appsheet/acceptance-test-matrix.md):
   - Cập nhật ma trận nghiệm thu: 34 ca kiểm thử; nhóm A (Toàn vẹn sổ) đạt 11/11 ca.

---

### B. Công cụ & Mã nguồn tự động hóa (Tools)

1. [`tools/appsheet/setup-sheets.gs`](./tools/appsheet/setup-sheets.gs):
   - Script Google Apps Script chạy trực tiếp trên Google Sheets.
   - Tự động khởi tạo 10 tab theo chuẩn lược đồ dữ liệu và nạp toàn bộ dữ liệu tổng hợp (`data/appsheet-synthetic/`).
   - Tích hợp menu tùy chỉnh `🗂️ QLCV Setup` để khởi tạo hoặc kiểm tra tính hợp lệ của cấu trúc cột.

2. [`tools/appsheet/check-integrity.js`](./tools/appsheet/check-integrity.js):
   - Bổ sung 3 ca kiểm thử biên cho quy tắc U1-T9:
     - `U1-T9a`: Tiến độ > 100 (`150`) → Bị chặn.
     - `U1-T9b`: Tiến độ là chuỗi tự do (`50%`) → Bị chặn.
     - `U1-T9c`: Tiến độ là số âm (`-1`) → Bị chặn.
   - Kết quả kiểm thử: **9/9 ca thử nghiệm lỗi cố ý ĐẠT 100%**.

3. [`tools/appsheet/mockup-template.html`](./tools/appsheet/mockup-template.html) & [`mockup/appsheet-role-preview.html`](./mockup/appsheet-role-preview.html):
   - Tích hợp đầy đủ các tính năng U3–U6: Dashboard Giám đốc (R15), Chuyển giao người thực hiện (R17), Form thêm khách hàng có trường Đại diện động (R17), Nút Backup/Restore (R16).

4. [`tools/preview-server.js`](./tools/preview-server.js):
   - Máy chủ Node.js siêu nhẹ phục vụ file mockup trên máy cục bộ qua cổng `3000`.
   - Đã xử lý triệt để lỗi đường dẫn `ENOENT`, cho phép mở và kiểm thử mượt mà tại `http://localhost:3000`.

---

## 📊 3. Bảng tổng hợp trạng thái các đơn vị triển khai

| Đơn vị | Tên hạng mục | Trạng thái kỹ thuật | Ghi chú vận hành |
|---|---|---|---|
| **U1** | Thiết lập lược đồ sổ dữ liệu & Kiểm soát ánh xạ | ✅ Hoàn thành 100% | 10 tab CSV tổng hợp, 9/9 test integrity PASS |
| **U2** | Cấu hình danh tính, vai trò và phân quyền dòng | ✅ Hoàn thành tài liệu & script | Script `setup-sheets.gs` sẵn sàng chạy trên Sheets thật |
| **U3** | Màn hình công việc, khách hàng & Chuyển giao (R17) | ✅ Hoàn thành đặc tả & mockup | Đã mô phỏng đầy đủ luồng nghiệp vụ trên mockup |
| **U4** | Gửi/duyệt tiến độ & Tự động hoàn thành (R7, R8) | ✅ Hoàn thành đặc tả & mockup | Luồng duyệt 100% auto-complete hoạt động chính xác |
| **U5** | Dashboard theo vai trò & Slice Giám đốc (R15) | ✅ Hoàn thành đặc tả & mockup | Đã có view lọc việc Khẩn/Quan trọng/Quá hạn |
| **U6** | Thông báo nội bộ & Nhật ký kiểm toán (R11, R12) | ✅ Hoàn thành đặc tả & mockup | Ghi vết hành động và thông báo cá nhân hóa |
| **U7** | Đối soát dữ liệu, nghiệm thu và bàn giao | ⏳ Sẵn sàng kịch bản | Chờ triển khai thực tế trên môi trường Workspace |

---

## 📌 4. Hướng dẫn tiếp tục công việc cho phiên tiếp theo
1. **Kiểm tra trực quan:** Tiếp tục sử dụng `http://localhost:3000` để rà soát trải nghiệm người dùng với các bên liên quan.
2. **Khi đưa lên Google Workspace:**
   - Mở Google Sheets mới → dán và chạy `tools/appsheet/setup-sheets.gs`.
   - Mở AppSheet Editor → cấu hình theo hướng dẫn tại `docs/appsheet/u2-appsheet-setup-guide.md`.
   - Khai báo các Slices, Views, Actions theo ma trận tại `docs/appsheet/u3-u6-implementation-summary.md`.

