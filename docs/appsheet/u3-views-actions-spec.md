# Đặc tả thiết kế màn hình, biểu mẫu và hành động AppSheet (U3)

Tài liệu này đặc tả chi tiết cấu hình Views, Forms, Slices và Actions cho module **Công việc và Khách hàng** trong AppSheet theo [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md) và các yêu cầu R3, R5, R6, R9, R14, R16, R17.

---

## 1. Màn hình đầu (Starting Views) theo vai trò (R14)

Để đảm bảo người dùng truy cập ngay vào không gian làm việc phù hợp khi mở ứng dụng:

| Vai trò | Tên View AppSheet | Loại View | Bảng/Slice nguồn | Mô tả giao diện |
|---|---|---|---|---|
| **CBTD** | `Tasks_Assigned_View` | Deck/Table | `Tasks` (đã lọc Security Filter) | Danh sách các công việc được giao cho CBTD hiện tại |
| **KSV** | `Pending_Reviews_View` | Table/Deck | Slice `Slice_Pending_Reviews` | Danh sách các báo cáo tiến độ chờ KSV duyệt |
| **BGD** | `Director_Overview_View` | Dashboard | Slice `Slice_Director_Workload` | Bảng tổng quan khối lượng công việc cấp đơn vị (chỉ đọc) |
| **Admin** | `Admin_Console_View` | Dashboard/Menu | `Users` & System Tables | Màn hình quản trị nhân sự, cấu hình và Backup/Restore |

### Xử lý điều hướng trong AppSheet:
Cấu hình tại **UX → Options → Starting View**:
```text
IFS(
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-CBTD", "Tasks_Assigned_View",
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-KSV", "Pending_Reviews_View",
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-BGD", "Director_Overview_View",
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN", "Admin_Console_View"
)
```

---

## 2. Quản lý công việc (Tasks & TaskAssignees) — R5, R6

### 2.1 Form tạo công việc (`Task_Form`)

- **Bảng nguồn:** `Tasks`
- **Quyền tạo:**
  - Admin, BGD, KSV: Tạo và giao cho bất kỳ CBTD active nào.
  - CBTD: **Chỉ được tạo khi tự là người phụ trách chính** (R6).

#### Ràng buộc hợp lệ (Valid_If / Editable_If):
1. **`created_by_user_id`**:
   - Initial value: `LOOKUP(USEREMAIL(), "Users", "email", "user_id")`
   - Editable_If: `FALSE` (khóa tự động).

2. **Ràng buộc tạo công việc cho CBTD (R6)**:
   - Khi CBTD tạo task, form gán người phân công chính (`TaskAssignees.user_id`) bắt buộc là chính CBTD.
   - Biểu thức kiểm tra tính hợp lệ trên Form hoặc Action tạo Assignee:
     ```text
     IF(
       LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-CBTD",
       [primary_assignee_user_id] = LOOKUP(USEREMAIL(), "Users", "email", "user_id"),
       TRUE
     )
     ```

3. **Thời hạn xử lý (`due_at`)**:
   - Kiểu dữ liệu: `Date`.
   - Valid_If: `[due_at] >= TODAY()` (hạn xử lý không được nằm trong quá khứ khi tạo mới).

### 2.2 Quy trình chuyển trạng thái công việc (R5, R8)

- **CBTD:**
  - Action `Task_Start`: Chuyển từ `not_started` sang `in_progress`.
    - **Display Name:** "Bắt đầu thực hiện"
    - **Only if this condition is true:**
      ```text
      AND(
        [status] = "not_started",
        ISNOTBLANK(
          FILTER("TaskAssignees",
            AND(
              [task_id] = [_THISROW].[task_id],
              [active] = TRUE,
              LOOKUP([user_id], "Users", "user_id", "email") = USEREMAIL()
            )
          )
        )
      )
      ```
    - **Do this:** `Data: set the values of some columns in this row` → `status = "in_progress"`.
  - **Chặn CBTD chuyển `completed`:** Cột `status` trong Form Task được đặt `Editable_If`:
    ```text
    LOOKUP(USEREMAIL(), "Users", "email", "role_id") <> "ROL-CBTD"
    ```
  - **Tự động chuyển `completed` (R8):** Khi KSV duyệt cập nhật tiến độ 100%, một Action/Bot tự động đổi `status` thành `completed` và ghi nhận `completed_at = NOW()`.

---

## 3. Quản lý khách hàng (Customers) — R9, R17

### 3.1 Form khách hàng (`Customer_Form`)

- **Bảng nguồn:** `Customers`
- **Quyền ghi (Add/Edit):** KSV, Admin.
- **Quyền đọc:**
  - Admin, BGD, KSV: Tất cả khách hàng trong phạm vi thí điểm.
  - CBTD: Chỉ khách hàng liên kết với công việc được giao (áp dụng qua Security Filter U2).

#### Ràng buộc trường hiển thị động (R17):
- Cột `Nguoi_Dai_Dien_Cty` (hoặc trường đại diện công ty):
  - **Show_If:**
    ```text
    [type] = "business"
    ```
    *(Nếu sử dụng bộ giá trị tiếng Việt trong AppSheet thì `[Loai_Khach_Hang] = "Cong_Ty"`).*

---

## 4. Hành động chuyển giao người thực hiện (Reassignment Action) — R17

Cán bộ quản lý có quyền chuyển đổi người thực hiện chính cho một công việc.

### Action: `Task_Transfer_Primary`
- **Bảng:** `Tasks` (hoặc `TaskAssignees`)
- **Display Name:** "Chuyển giao người thực hiện"
- **Icon:** `exchange` / `user-switch`
- **Only if this condition is true (R17):**
  ```text
  IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-ADMIN", "ROL-BGD", "ROL-KSV"))
  ```
  *(Đối với tên vai trò dạng chuỗi: `IN(LOOKUP(USEREMAIL(), "Nhan_Su", "Email", "Vai_Tro"), LIST("Giam_Doc", "KSV", "Admin"))`).*
- **Hành vi (Sequence Action):**
  1. Đặt `active = FALSE` cho dòng `TaskAssignees` hiện tại có `assignment_role = "primary"` của `task_id` này.
  2. Tạo dòng mới trong `TaskAssignees` với `user_id` mới được chọn, `assignment_role = "primary"`, `active = TRUE`, và chụp lại `assignee_email_snapshot`.
  3. Ghi `AuditLogs` với `action = "task.transfer"`.

---

## 5. Màn hình quản lý người dùng và Backup/Restore (R16)

Dành riêng cho Quản trị viên hệ thống (Admin).

### 5.1 Quản trị người dùng (`Users_Admin_View`)
- **Bảng nguồn:** `Users`
- **View Show_If (R16):**
  ```text
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN"
  ```
- **Quy tắc bảo vệ dữ liệu:**
  - Admin có quyền thêm, sửa thông tin người dùng.
  - Khi vô hiệu hóa tài khoản: Khuyến nghị chuyển `status = "inactive"`, không xóa cứng bản ghi nhằm bảo toàn dữ liệu lịch sử trong `TaskAssignees` và `AuditLogs`.

### 5.2 Nút hành động Backup / Restore
- **Vị trí hiển thị:** Menu Quản trị Admin.
- **Show_If (R16):**
  ```text
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN"
  ```
- **Lưu ý kiểm soát:**
  - Nút chỉ kích hoạt webhook/script sao lưu Google Drive đã được kiểm chứng.
  - Thao tác Restore bị vô hiệu hóa trên dữ liệu sản xuất cho đến khi hoàn tất kiểm thử U7.

---

## 6. Xử lý trạng thái trống (Empty State) và thông báo lỗi

Theo tiêu chuẩn nghiệm thu R14:
- **Trạng thái trống:** Khi bảng/view không có dữ liệu phù hợp với vai trò hiện tại, hiển thị thông báo rõ ràng:
  - *Ví dụ đối với CBTD:* "Bạn hiện chưa có công việc nào được phân công. Hãy liên hệ KSV hoặc tạo công việc mới nếu bạn là người thực hiện chính."
- **Trạng thái lỗi/từ chối quyền:** Khi người dùng cố thực hiện hành động ngoài phạm vi (ví dụ CBTD cố duyệt tiến độ hoặc chuyển `completed`), hiển thị cảnh báo từ chối truy cập và hướng dẫn thao tác đúng.

