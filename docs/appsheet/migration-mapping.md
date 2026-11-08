# Ánh xạ dữ liệu từ hệ thống cũ sang sổ AppSheet (U1)

Tài liệu này đối chiếu các cột của GAS cũ ([legacy/Code.gs](../../legacy/Code.gs)) với các tab trong [từ điển dữ liệu](./data-dictionary.md). Nó chỉ là bản thiết kế. Không có dữ liệu thật nào được nạp theo ánh xạ này trước khi có phê duyệt bảo mật và chủ dữ liệu (R13).

## Bảng ánh xạ

| Nguồn (GAS) | Cột nguồn | Đích (AppSheet) | Quy tắc chuyển đổi | Trạng thái |
|---|---|---|---|---|
| `Users` | `Email` | `Users.email` | Chuyển nguyên; kiểm tra trùng và chuẩn hóa chữ thường trước khi nạp. | Sẵn sàng |
| `Users` | `TenCanbo` | `Users.full_name` | Chuyển nguyên. | Sẵn sàng |
| `Users` | `Role` | `Users.role_id` | Ánh xạ sang `ROL-ADMIN`/`ROL-BGD`/`ROL-KSV`/`ROL-CBTD`. Giá trị ngoài bốn vai trò báo lỗi. | Sẵn sàng |
| `Users` | `PhongBan` (theo tài liệu nghiệp vụ) | `Users.org_unit` | Chuyển nguyên nếu có. | Cần xác nhận cột có tồn tại trong sổ thật |
| (không có) | — | `Users.employee_code`, `user_id` | Sinh mới, `employee_code` lấy từ danh mục nhân sự. | Chưa có nguồn |
| `KhachHang` | `MaKH` | `Customers.customer_code` | Giữ làm khóa thay thế; xem mục "Mã khách hàng". | Chờ quyết định |
| `KhachHang` | `TenKH` | `Customers.name` | Chuyển nguyên. | Sẵn sàng |
| `KhachHang` | `LoaiKH` | `Customers.type` | `Cá nhân` → `personal`; `Doanh nghiệp` → `business`. Giá trị khác báo lỗi. | Sẵn sàng |
| `KhachHang` | `NhomKH` | `Customers.status` | `1-Mới` → `new`; `2-Đang quản lý` → `managed`. Nhóm `3-Xử lý nợ` không ánh xạ. | Chờ quyết định |
| `KhachHang` | `NhomNo` | — | **Không nạp** trong pilot: thông tin tín dụng. | Loại trừ |
| `KhachHang` | (SĐT, địa chỉ nếu có) | `Customers.phone` | Chỉ lấy SĐT; kiểm tra định dạng. | Cần xác nhận cột nguồn |
| `CongViec` | `MaCV` | `Tasks.task_code` | Giữ nguyên làm khóa thay thế. | Sẵn sàng |
| `CongViec` | `MaKH` | `Tasks.customer_id` | Tra `Customers` theo `customer_code`; không khớp thì báo ngoại lệ. | Sẵn sàng |
| `CongViec` | `NoiDung` | `Tasks.title` | Chuyển nguyên; nội dung dài có thể đưa vào `description`. | Sẵn sàng |
| `CongViec` | `CBTD1` | `TaskAssignees` (`primary`) | Tra `Users` theo email, tạo dòng `assignment_role = primary`. | Sẵn sàng |
| `CongViec` | `CBTD2` | `TaskAssignees` (`collaborator`) | Tương tự, `assignment_role = collaborator`; bỏ qua nếu trống. | Sẵn sàng |
| `CongViec` | `Email_CBTD` | — | Trùng với `CBTD1` trong dữ liệu legacy (`updateCongViec` ghi cùng giá trị). Không nạp riêng. | Loại trừ |
| `CongViec` | `HanChot` | `Tasks.due_at` | Chuyển sang ngày; xem mục "Ngày". | Chờ quyết định |
| `CongViec` | `TrangThai` | `Tasks.status` | Cần bảng ánh xạ; **giá trị thật trong sổ legacy chưa được xác nhận** (xem mục dưới). | Chờ dữ liệu nguồn |
| `CongViec` | `Mucdo` | `Tasks.priority` | `Cao` → `high`; `Bình thường` → `normal`. Giá trị khác báo ngoại lệ. | Sẵn sàng với hai giá trị |
| `CongViec` | `DienGiai` | `Tasks.description` | Chuyển nguyên. | Sẵn sàng |
| `NhatKy` | `MaNK` | `TaskUpdates.update_id` | Giữ làm khóa; kiểm tra trùng. | Sẵn sàng |
| `NhatKy` | `MaCV` | `TaskUpdates.task_id` | Tra `Tasks` theo `task_code`. | Sẵn sàng |
| `NhatKy` | `TienDo` | `TaskUpdates.progress_pct` | **Định dạng nguồn chưa xác nhận** (lưu dạng chuỗi tự do trong code). Chỉ nạp khi đọc được số 0–100; còn lại báo ngoại lệ. | Chờ dữ liệu nguồn |
| `NhatKy` | `ThoiGian` | `TaskUpdates.submitted_at` | Chuyển sang UTC. | Sẵn sàng |
| `NhatKy` | `EmailCBTD` / `NguoiCapNhat` | `TaskUpdates.submitted_by_user_id` + snapshot | Tra `Users` theo email; không khớp báo ngoại lệ. | Sẵn sàng |
| `NhatKy` | `KSV_Duyet` (TRUE/FALSE) | `TaskUpdates.review_status` | `TRUE` → `approved`; `FALSE` → `pending`. **Legacy không có trạng thái từ chối**, nên không có ánh xạ sang `rejected`. | Có khoảng trống |
| `NhatKy` | `ThoiGian_Duyet` | `TaskUpdates.reviewed_at` | Chuyển sang UTC; chỉ có khi đã duyệt. | Sẵn sàng |
| `NhatKy` | `EmailKSV` | `TaskUpdates.reviewed_by_user_id` + snapshot | Tra `Users`; không khớp báo ngoại lệ. | Sẵn sàng |
| (không có) | — | `TaskUpdates.review_comment` | Legacy không có lý do từ chối. Để trống khi nạp. | Có khoảng trống |
| (không có) | — | `TaskAssignees.assigned_at`, `AuditLogs`, `Notifications` | Không có trong legacy; để trống hoặc sinh từ thời điểm nạp (đánh dấu nguồn là "migration"). | Quyết định nghiệp vụ |

## Các điểm chưa chốt

1. **Giá trị `TrangThai` thật trong sổ legacy.** Mã trong `Code.gs` không liệt kê giá trị này; bộ giá trị có thể thấy trong tài liệu nghiệp vụ không khớp với nhau. Cần xuất một bản sổ thật (chỉ xem cấu trúc và tập giá trị khác nhau, không lấy dòng khách hàng) để lập bảng ánh xạ.
2. **Định dạng `NhatKy.TienDo`.** Nếu là chữ như "50%" hoặc mô tả, cần quy tắc phân tích. Nếu không có số, dòng đó thành ngoại lệ.
3. **Mã khách hàng.** Hiện có ba nguồn: `C001` (backend cũ), `KH001` (mock) và `MaKH` (legacy). Theo [migration-spec.md](../../migration-spec.md) mục 5, không ghép hồ sơ theo tên hoặc số điện thoại; chỉ ghép theo mã đã được chủ dữ liệu xác nhận.
4. **Ngoại lệ không tự sửa.** Mọi dòng không khớp (email không có trong `Users`, mã công việc không có khách hàng, giá trị enum lạ) được đưa vào danh sách ngoại lệ và loại khỏi tập nạp, theo U7.
5. **Quy tắc `NhomNo` và thông tin tín dụng.** Không nạp. Nếu cần sau này, phải có phê duyệt riêng.

## Quy trình đối soát (U7, khi có dữ liệu thật)

- Đếm dòng nguồn và đích cho từng tab; số liệu phải khớp, sai lệch ghi rõ lý do.
- Mỗi dòng nguồn có đúng một đích hoặc nằm trong danh sách ngoại lệ.
- Chạy [check-integrity.js](../../tools/appsheet/check-integrity.js) trên bản xuất của sổ thật trước khi bật ứng dụng cho người dùng.
- Lấy mẫu ngẫu nhiên và đối chiếu với nguồn bằng tay.
