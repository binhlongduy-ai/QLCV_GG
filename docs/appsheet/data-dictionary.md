# Từ điển dữ liệu sổ AppSheet (U1)

Tài liệu này mô tả các tab của sổ Google Sheets cho pilot, theo [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md) và [migration-spec.md](../../migration-spec.md). Dữ liệu mẫu nằm tại [data/appsheet-synthetic](../../data/appsheet-synthetic/README.md); tiêu đề cột trong các file CSV khớp với bảng dưới đây và được kiểm tra bởi [tools/appsheet/check-integrity.js](../../tools/appsheet/check-integrity.js).

## Quy ước chung

- Khóa `*_id` là khóa ổn định, không dùng số dòng. Mã hiển thị (`task_code`, `customer_code`) là khóa thay thế duy nhất.
- Thời gian lưu dạng ISO 8601 UTC (`2026-10-13T08:10:00Z`). `due_at` là ngày (`YYYY-MM-DD`) cho đến khi nghiệp vụ xác nhận có cần giờ.
- Cột `*_email_snapshot` giữ email tại thời điểm ghi, để truy xuất lịch sử sau khi xóa dòng người dùng.
- Không lưu mật khẩu, `password_hash`, token, `loan_amount` hay thông tin tín dụng chi tiết.
- Giá trị enum dùng mã tiếng Anh snake_case. Nhãn tiếng Việt chỉ hiển thị ở giao diện.
- Không xóa cứng công việc, khách hàng hay lịch sử duyệt; dùng `active` hoặc `status`.

## Các tab

### Users: người dùng

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `user_id` | Có, khóa | Mã nội bộ, ví dụ `USR-001`. |
| `email` | Có, duy nhất | Email Workspace; dùng để đăng nhập và phân quyền dòng. |
| `employee_code` | Có, duy nhất | Mã cán bộ. |
| `full_name` | Có | |
| `role_id` | Có, FK → `Roles` | |
| `org_unit` | Có | Đơn vị; chưa xác nhận có cần ngoài pilot không. |
| `status` | Có | `active` / `inactive`. Người `inactive` không được truy cập. |
| `created_at`, `updated_at` | Có | |

Không có `password_hash`: đăng nhập dùng danh tính Workspace.

### Roles: vai trò

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `role_id` | Có, khóa | `ROL-ADMIN`, `ROL-BGD`, `ROL-KSV`, `ROL-CBTD`. |
| `code` | Có, duy nhất | `Admin`, `BGD`, `KSV`, `CBTD`. |
| `name`, `description` | Có | |

### Permissions: quyền thao tác

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `permission_id` | Có, khóa | `PER-01`… `PER-15`. |
| `code` | Có, duy nhất | Ví dụ `task.view`, `progress.review`. |
| `name`, `description` | Có | |

Danh sách 15 quyền nằm trong [data/appsheet-synthetic/Permissions.csv](../../data/appsheet-synthetic/Permissions.csv).

### RolePermissions: ánh xạ vai trò – quyền

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `role_id` | Có, FK → `Roles` | Cặp `(role_id, permission_id)` phải duy nhất. |
| `permission_id` | Có, FK → `Permissions` | |
| `created_at` | Có | |

Quyền suy ra từ ma trận vai trò trong plan:

- **Admin:** toàn bộ 15 quyền.
- **BGD:** `task.view`, `task.create`, `task.update`, `task.start`, `customer.view`, `progress.submit`, `dashboard.view`, `notification.view`.
- **KSV:** `task.view`, `task.create`, `task.update`, `task.transfer`, `task.start`, `customer.view`, `customer.maintain`, `progress.submit`, `progress.review`, `dashboard.view`, `notification.view`.
- **CBTD:** `task.view`, `task.create`, `task.start`, `customer.view`, `progress.submit`, `dashboard.view`, `notification.view`. Phạm vi theo phân công và ràng buộc "chỉ tự là người chính" được kiểm tra trong ứng dụng, không nằm trong bảng này.

**Mục có điều kiện, chưa đưa vào bảng:** BGD chuyển giao người thực hiện chính và xem bảng điều khiển Giám đốc (`task.transfer`, `dashboard.view_director`) chỉ áp dụng khi BGD là Giám đốc. Cần cơ chế xác định "là Giám đốc" trước khi cấp quyền.

### Customers: khách hàng

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `customer_id` | Có, khóa | |
| `customer_code` | Có, duy nhất | Mã chuẩn chưa chốt (xem [migration-mapping.md](./migration-mapping.md)). |
| `name` | Có | |
| `type` | Có | `personal` (Cá nhân) / `business` (Doanh nghiệp). |
| `phone` | Có | |
| `status` | Có | `new` (Mới) / `managed` (Đang quản lý). |
| `created_at`, `updated_at` | Có | |

Không có `loan_amount` và không có nhóm nợ (`NhomNo`). Nhóm xử lý nợ là thông tin tín dụng, nên chờ chủ dữ liệu phê duyệt trước khi đưa vào.

### Tasks: công việc

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `task_id` | Có, khóa | |
| `task_code` | Có, duy nhất | Mã hiển thị. |
| `customer_id` | Có, FK → `Customers` | Mỗi công việc gắn với một khách hàng. |
| `title` | Có | |
| `description` | Không | |
| `status` | Có | `not_started` (Chưa làm) / `in_progress` (Đang thực hiện) / `completed` (Đã hoàn thành). Xem mục "Chưa chốt". |
| `priority` | Có | `high` (Cao) / `normal` (Bình thường) / `low` (Thấp). |
| `due_at` | Có | Ngày. |
| `created_by_user_id` | Có, FK → `Users` | Người tạo; CBTD chỉ tạo khi tự là người chính (R6). |
| `completed_at` | Không | Chỉ có khi `status = completed`. Đặt tự động khi tiến độ 100% được duyệt (R8). |
| `created_at`, `updated_at` | Có | |

### TaskAssignees: phân công

Tab bổ sung so với `migration-spec.md`, theo quyết định KTD3 của plan: thay cho `Tasks.assignee_user_id` đơn lẻ.

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `assignment_id` | Có, khóa | |
| `task_id` | Có, FK → `Tasks` | |
| `user_id` | Có, FK → `Users` | |
| `assignee_email_snapshot` | Có | Email tại thời điểm phân công. |
| `assignment_role` | Có | `primary` (chính) / `collaborator` (phối hợp). |
| `assigned_at` | Có | |
| `active` | Có | `TRUE` / `FALSE`. Gỡ phân công đặt `FALSE`, không xóa dòng. |

Quy tắc: mỗi công việc có **đúng một** `primary` đang hoạt động và **tối đa một** `collaborator` đang hoạt động; hai người không được trùng nhau.

### TaskUpdates: cập nhật tiến độ

Tab bổ sung so với `migration-spec.md`, theo KTD3 của plan. Dòng chỉ được thêm mới, không sửa nội dung đã gửi.

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `update_id` | Có, khóa | |
| `task_id` | Có, FK → `Tasks` | |
| `progress_pct` | Có | Số nguyên 0–100, lũy kế. |
| `narrative` | Có | Nội dung diễn giải. |
| `submitted_by_user_id` | Có, FK → `Users` | |
| `submitted_by_email_snapshot` | Có | |
| `submitted_at` | Có | |
| `review_status` | Có | `pending` / `approved` / `rejected`. Báo cáo bị từ chối vẫn được giữ. |
| `reviewed_by_user_id` | Không, FK → `Users` | Bắt buộc khi đã duyệt hoặc từ chối; để trống khi `pending`. |
| `reviewed_by_email_snapshot` | Không | Như trên. |
| `reviewed_at` | Không | Như trên. |
| `review_comment` | Không | Lý do từ chối là nội dung cần hiển thị cho người có thẩm quyền. |

Gửi lại sau khi bị từ chối là một dòng mới, không sửa dòng cũ.

### Notifications: thông báo trong ứng dụng

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `notification_id` | Có, khóa | |
| `recipient_user_id` | Có, FK → `Users` | Quyền dòng: chỉ người nhận thấy. |
| `event_type` | Có | `task_assigned`, `progress_submitted`, `progress_approved`, `progress_rejected`. |
| `source_record_id` | Có | ID bản ghi gốc (`ASG-…`, `UPD-…`); không kiểm tra FK vì đa hình. |
| `request_or_event_key` | Có, duy nhất | Khóa sự kiện ổn định, ngăn tạo trùng khi chạy lại. |
| `message` | Có | Không chứa dữ liệu khách hàng nhạy cảm (R12). |
| `created_at` | Có | |
| `read_at` | Không | Để trống khi chưa đọc. |

### AuditLogs: nhật ký kiểm toán nghiệp vụ

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `audit_id` | Có, khóa | |
| `actor_user_id` | Có, FK → `Users` | Với hành động tự động (hoàn thành), ghi người phê duyệt đã kích hoạt. |
| `actor_email_snapshot` | Có | |
| `action` | Có | `user.create`, `customer.create`, `task.create`, `task.assign`, `progress.submit`, `progress.approve`, `progress.reject`, `task.auto_complete`… |
| `entity_type`, `entity_id` | Có | |
| `request_or_event_key` | Có, duy nhất | |
| `created_at` | Có | |

Chỉ ghi thêm từ ứng dụng. Không ghi credential, token hay chi tiết khách hàng. Đây là nhật ký nghiệp vụ, khác với AppSheet Audit History (chỉ dùng cho chẩn đoán vận hành).

## Chưa chốt (cần nghiệp vụ xác nhận)

| Mục | Hiện tại trong dữ liệu mẫu | Cần quyết định |
|---|---|---|
| Bộ mã trạng thái | `not_started` / `in_progress` / `completed` | Plan dùng "Đang thực hiện", bản DeXuat dùng "Đang làm" và "Chưa làm". Xác nhận nhãn và có thêm trạng thái không. |
| Mức ưu tiên | `high` / `normal` / `low` | Legacy có "Cao" và "Bình thường"; "Thấp" chưa có nguồn. |
| Mã khách hàng chuẩn | `KH-TEST-…` | Nguồn chuẩn giữa `C001` (backend cũ) và `KH001` (mock) và legacy `MaKH`. |
| Kiểu `due_at` | Ngày | Ngày hay ngày-giờ, múi giờ hiển thị. |
| Nhóm `status` khách hàng | `new` / `managed` | Legacy có nhóm "Xử lý nợ"; có đưa vào không là câu hỏi về dữ liệu tín dụng. |
| Mở lại công việc đã hoàn thành | Mặc định: không | Plan ghi "pilot default là completion terminal". |
| Quyền BGD có điều kiện | Chưa mô hình hóa | Cơ chế xác định "là Giám đốc". |
