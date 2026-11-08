# Đặc tả hệ thống thông báo trong ứng dụng và nhật ký kiểm toán (U6)

Tài liệu này đặc tả chi tiết kiến trúc và luồng xử lý của bảng **Thông báo nội bộ (`Notifications`)** và **Nhật ký kiểm toán nghiệp vụ (`AuditLogs`)** theo các yêu cầu R11, R12, R16 trong [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md).

---

## 1. Nguyên tắc cốt lõi (R11, R12)

1. **Chỉ thông báo trong ứng dụng (In-app only):** Không tích hợp gửi Email, SMS hoặc Webhook đẩy ra bên ngoài trong giai đoạn thí điểm để đảm bảo tính an toàn dữ liệu và kiểm soát phạm vi phát hành.
2. **Bảo vệ quyền riêng tư & dữ liệu mật:** Nội dung thông báo và mô tả nhật ký kiểm toán **tuyệt đối không chứa:**
   - Dữ liệu nhận dạng cá nhân nhạy cảm của khách hàng (CMND/CCCD, địa chỉ chi tiết, số dư nợ, khoản vay).
   - Token xác thực, mật khẩu, hoặc thông tin bảo mật hệ thống.
3. **Phân tách kiểm toán nghiệp vụ và chẩn đoán nền tảng:**
   - Sử dụng bảng lưu trữ chuyên biệt `AuditLogs` làm hồ sơ truy vết nghiệp vụ lâu dài.
   - Không phụ thuộc vào AppSheet Audit History (vốn chỉ lưu 7 ngày đến 53 ngày tùy gói bản quyền).
4. **Bảo toàn dữ liệu kiểm toán:** Bảng `AuditLogs` chỉ cho phép **Ghi thêm (Append only)**, không hiển thị bất kỳ Action sửa hoặc xóa nào trên giao diện ứng dụng.

---

## 2. Hệ thống thông báo trong ứng dụng (`Notifications`) — R11

### 2.1 Các sự kiện phát sinh thông báo

| Mã sự kiện (`event_type`) | Sự kiện kích hoạt | Người nhận (`recipient_user_id`) | Mẫu thông báo (`message`) |
|---|---|---|---|
| `task_assigned` | Phân công công việc mới hoặc đổi cán bộ | CBTD được phân công (`primary` / `collaborator`) | `"Bạn được giao công việc [Mã CV]: [Tiêu đề CV]"` |
| `progress_submitted` | CBTD nộp báo cáo tiến độ mới | KSV phụ trách / Admin | `"Có cập nhật tiến độ mới cần duyệt cho [Mã CV] ([Tiến độ]%)"` |
| `progress_approved` | KSV phê duyệt báo cáo tiến độ | CBTD nộp báo cáo | `"Cập nhật tiến độ của bạn cho [Mã CV] đã được duyệt."` |
| `progress_rejected` | KSV từ chối báo cáo tiến độ | CBTD nộp báo cáo | `"Cập nhật tiến độ cho [Mã CV] bị từ chối. Vui lòng kiểm tra lý do và gửi lại."` |
| `task_completed` | Công việc chuyển sang hoàn thành | CBTD và KSV liên quan | `"Công việc [Mã CV] đã hoàn thành 100%."` |

### 2.2 Cơ chế tạo và quản lý thông báo
- **Tạo thông báo:** Sử dụng Action `Data: add a new row to another table using values from this row` kết hợp trong các Group Action khi các sự kiện nghiệp vụ xảy ra.
- **Khóa khử trùng lặp (`request_or_event_key`):**
  - Định dạng: `evt-[event_type]-[source_record_id]`
  - Giúp ngăn chặn việc mạng chập chờn hoặc người dùng nhấn nhiều lần tạo ra các thông báo trùng lặp.
- **Thao tác đánh dấu đã đọc:**
  - Action: `Notification_Mark_As_Read`
  - Hành vi: Cập nhật `read_at = NOW()` khi người dùng nhấn vào thông báo.
- **Phân quyền dòng (Security Filter):**
  - Chỉ người nhận mới nhận được dòng thông báo của mình:
    ```text
    LOOKUP(USEREMAIL(), "Users", "email", "user_id") = [recipient_user_id]
    ```

---

## 3. Nhật ký kiểm toán nghiệp vụ (`AuditLogs`) — R12

### 3.1 Danh mục hành động ghi vết (`action`)

| Mã hành động | Diễn giải | Bản ghi đối tượng (`entity_type`) | Thời điểm ghi |
|---|---|---|---|
| `user.create` | Thêm người dùng mới | `User` | Sau khi Admin lưu User |
| `customer.create` | Tạo mới hồ sơ khách hàng | `Customer` | Sau khi KSV/Admin tạo khách hàng |
| `task.create` | Tạo mới công việc | `Task` | Sau khi tạo Task |
| `task.assign` | Phân công hoặc chuyển giao CBTD | `TaskAssignee` | Khi gán CBTD chính/phối hợp |
| `task.transfer` | Chuyển giao CBTD chính | `Task` | Khi quản lý chạy Action chuyển giao |
| `progress.submit` | CBTD nộp tiến độ | `TaskUpdate` | Khi CBTD lưu Form cập nhật |
| `progress.approve` | KSV duyệt tiến độ | `TaskUpdate` | Khi KSV nhấn Duyệt |
| `progress.reject` | KSV từ chối tiến độ | `TaskUpdate` | Khi KSV nhấn Từ chối |
| `task.auto_complete` | Tự động hoàn thành công việc | `Task` | Khi hệ thống tự động đổi `status = completed` |

### 3.2 Quy chuẩn bản ghi AuditLog
Mỗi dòng kiểm toán bắt buộc có đầy đủ các thông tin:
1. `audit_id`: Khóa duy nhất dạng `AUD-XXX` hoặc `UNIQUEID()`.
2. `actor_user_id`: Khóa ngoại trỏ đến người thực hiện.
3. `actor_email_snapshot`: Email của người thực hiện tại thời điểm hành động.
   > **Ý nghĩa:** Nếu sau này dòng User bị vô hiệu hóa hoặc xóa, email snapshot vẫn đảm bảo tính toàn vẹn và khả năng truy vết pháp lý.
4. `action`: Mã thao tác tiêu chuẩn snake_case.
5. `entity_type` & `entity_id`: Xác định chính xác đối tượng chịu tác động.
6. `request_or_event_key`: Khóa sự kiện duy nhất.
7. `created_at`: Dấu thời gian chuẩn UTC.

### 3.3 Phân quyền xem nhật ký kiểm toán
- **Security Filter:** Chỉ cho phép Quản trị viên (`ROL-ADMIN`) xem được bảng này:
  ```text
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN"
  ```
- **Form chỉnh sửa:** Bảng `AuditLogs` bị vô hiệu hóa quyền Edit và Delete ở cấp Table Permissions trong AppSheet (chỉ Read-only trên UI).

