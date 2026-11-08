# Phân Tích Logic Nghiệp Vụ Cốt Lõi (Business Logic)

Tài liệu này trích xuất từ mã nguồn GAS cũ (`Code.gs`, `app.js`) để chuẩn bị cho việc rebuild hệ thống.

## 1. Hệ thống Phân Quyền (RBAC)
Hệ thống xoay quanh việc lấy định danh qua `Session.getActiveUser().getEmail()` và so khớp với bảng `Users`.
- **Admin**: Quyền cao nhất, quản lý User, xóa khách hàng, có mọi quyền của KSV.
- **BGD (Ban Giám Đốc)**: Quyền xem toàn bộ báo cáo, thống kê, có thể giao việc.
- **KSV (Kiểm Soát Viên)**: Quản lý công việc, duyệt tiến độ (`duyetTienDo`), giao việc cho CBTD, cập nhật Khách hàng.
- **CBTD (Cán Bộ Tín Dụng)**: 
  - Chỉ xem công việc được giao cho mình (qua `CBTD1` - xử lý chính, hoặc `CBTD2` - hợp công).
  - Có thể cập nhật trạng thái công việc (`updateTrangThai`), diễn giải (`updateDienGiai`), và thêm nhật ký tiến độ (`addNhatKy`).

## 2. Cấu Trúc Dữ Liệu Lõi (Google Sheets)
Hệ thống chia làm 4 bảng chính:
- **Users**: Lưu thông tin `Email`, `HoTen`, `PhongBan`, `Role`.
- **KhachHang**: Danh mục khách hàng dùng để tham chiếu khi tạo công việc.
- **CongViec**: Lưu trạng thái, mức độ ưu tiên, người giao, người nhận (`CBTD1`, `CBTD2`), thời hạn, và mã công việc (`MaCV`).
- **NhatKy**: Lưu lịch sử cập nhật tiến độ công việc. Mỗi lần cập nhật sẽ thêm một dòng. Cần có sự phê duyệt của KSV (`TrangThaiDuyet`).

## 3. Quy Trình Nghiệp Vụ Cốt Lõi
1. **Giao Việc**:
   - Admin/KSV/BGD tạo công việc mới (`addCongViec`).
   - Gán `CBTD1` (chính) và có thể `CBTD2` (hợp tác).
2. **Cập Nhật Tiến Độ**:
   - CBTD được giao việc sẽ thực hiện `addNhatKy` để báo cáo.
   - Hệ thống ghi lại tiến độ, thời gian, và người tạo.
3. **Phê Duyệt**:
   - Nhật ký mới sẽ ở trạng thái chờ duyệt.
   - KSV hoặc Admin sử dụng `duyetTienDo` để chấp nhận hoặc từ chối tiến độ.
   - Khi tiến độ đạt 100% và được duyệt, trạng thái `CongViec` có thể chuyển sang hoàn thành.
4. **Trigger Email**:
   - Khi có dòng nhật ký mới, hệ thống kích hoạt `onEditNhatKy` để gửi email thông báo cho KSV/BGD.

## 4. Đặc tả API Giao Tiếp
- Tất cả API đều giao tiếp qua cơ chế `action` (e.g. `?action=login`).
- Endpoint sẽ kiểm tra session (qua `requireLogin` hoặc `requireRole`) trước khi thực thi lệnh.
