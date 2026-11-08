# Bảng ma trận cấu hình Views, Forms, Slices và Actions (U3–U6)

Tài liệu này tổng hợp toàn bộ các thực thể cần khai báo trực tiếp trong trình biên tập AppSheet Editor cho các đơn vị U3, U4, U5, U6, đi kèm vị trí menu, bảng nguồn, biểu thức Show_If/Valid_If và kiểu hiển thị.

---

## 1. Danh mục Slices

| Tên Slice | Bảng gốc | Row Filter Condition | Cột hiển thị (Columns) | Mục đích / Quyền xem |
|---|---|---|---|---|
| `Slice_Pending_Reviews` | `TaskUpdates` | `[review_status] = "pending"` | Toàn bộ | Phục vụ màn hình đầu KSV (`Pending_Reviews_View`) |
| `Slice_Director_Priority_Tasks` | `Tasks` | `AND(OR([priority] = "high", [priority] = "urgent", [due_at] < TODAY()), [status] <> "completed")` | `task_code`, `title`, `customer_id`, `priority`, `due_at`, `status` | Dashboard ưu tiên Giám đốc & Admin (R15) |
| `Slice_My_Assigned_Tasks` | `Tasks` | `ISNOTBLANK(FILTER("TaskAssignees", AND([task_id] = [_THISROW].[task_id], [active] = TRUE, LOOKUP([user_id], "Users", "user_id", "email") = USEREMAIL())))` | Toàn bộ | Màn hình đầu và danh sách việc của CBTD (R14) |
| `Slice_Active_Users` | `Users` | `[status] = "active"` | `user_id`, `full_name`, `email`, `role_id`, `employee_code` | Nguồn chọn nhân sự cho form giao việc |
| `Slice_Unread_Notifications` | `Notifications` | `ISBLANK([read_at])` | Toàn bộ | Thông báo chưa đọc |

---

## 2. Danh mục Views & Forms (UX)

| Tên View | Vị trí (Position) | Kiểu View (View Type) | Bảng / Slice nguồn | Show_If / Quyền hiển thị | Mục đích |
|---|---|---|---|---|---|
| `Tasks_Assigned_View` | Starting / Bottom | Deck | `Slice_My_Assigned_Tasks` | `LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-CBTD"` | Màn hình đầu CBTD (R14) |
| `Pending_Reviews_View` | Starting / Bottom | Table | `Slice_Pending_Reviews` | `IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-KSV", "ROL-ADMIN"))` | Màn hình đầu KSV (R14) |
| `Director_Overview_View` | Starting / Bottom | Dashboard | `Slice_Director_Priority_Tasks` | `IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-BGD", "ROL-ADMIN"))` | Màn hình đầu BGD (R14, R15) |
| `Admin_Console_View` | Starting / Menu | Menu / Detail | `Users` | `LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN"` | Màn hình đầu Admin (R14, R16) |
| `Tasks_List_View` | Bottom Nav (Icon: List) | Table | `Tasks` | `TRUE` (đã lọc Security Filter) | Xem danh sách công việc |
| `Task_Detail_View` | Ref | Detail | `Tasks` | `TRUE` | Chi tiết công việc, tiến độ, nút bắt đầu |
| `Task_Form` | Form | Form | `Tasks` | `TRUE` | Form tạo mới/sửa công việc (R6) |
| `Customers_List_View` | Bottom Nav (Icon: Users) | Table | `Customers` | `TRUE` (đã lọc Security Filter) | Tra cứu danh bạ khách hàng (R9) |
| `Customer_Form` | Form | Form | `Customers` | `IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-KSV", "ROL-ADMIN"))` | Tạo/sửa khách hàng (R9) |
| `TaskUpdate_Form` | Form | Form | `TaskUpdates` | `TRUE` | Form nộp tiến độ lũy kế 0–100% (R7) |
| `Notifications_View` | Bottom Nav (Icon: Bell) | Deck | `Notifications` | `TRUE` | Hộp thông báo cá nhân (R11) |
| `AuditLogs_View` | Menu Nav (Icon: Shield) | Table | `AuditLogs` | `LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN"` | Nhật ký kiểm toán (R12, R16) |

---

## 3. Danh mục Actions (Hành động & Quy tắc)

### 3.1 Bảng `Tasks`

1. **`Task_Start` (Bắt đầu công việc - R5):**
   - **Do this:** `Data: set the values of some columns in this row`
   - **Set columns:** `status = "in_progress"`, `updated_at = NOW()`
   - **Condition:**
     ```text
     AND(
       [status] = "not_started",
       ISNOTBLANK(
         FILTER("TaskAssignees",
           AND([task_id] = [_THISROW].[task_id], [active] = TRUE, LOOKUP([user_id], "Users", "user_id", "email") = USEREMAIL())
         )
       )
     )
     ```

2. **`Task_Transfer_Primary` (Chuyển giao người thực hiện - R17):**
   - **Do this:** `App: go to another view within this app`
   - **Target:** Mở form phân công cập nhật người chính
   - **Condition:**
     ```text
     IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-ADMIN", "ROL-BGD", "ROL-KSV"))
     ```

3. **`Task_Mark_Completed` (Tự động hoàn thành - R8):**
   - **Do this:** `Data: set the values of some columns in this row`
   - **Set columns:** `status = "completed"`, `completed_at = NOW()`, `updated_at = NOW()`
   - **Condition:**
     ```text
     AND(
       [status] <> "completed",
       ISNOTBLANK(
         FILTER("TaskUpdates",
           AND([task_id] = [_THISROW].[task_id], [review_status] = "approved", [progress_pct] = 100)
         )
       )
     )
     ```

### 3.2 Bảng `TaskUpdates`

1. **`Action_Approve_Progress` (Duyệt tiến độ - R7, R8):**
   - **Do this:** `Grouped: execute a sequence of actions`
   - **Condition:**
     ```text
     AND(
       [review_status] = "pending",
       IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-KSV", "ROL-ADMIN"))
     )
     ```
   - **Sequence:**
     1. Gán `review_status = "approved"`, `reviewed_by_user_id = LOOKUP(USEREMAIL(), "Users", "email", "user_id")`, `reviewed_by_email_snapshot = USEREMAIL()`, `reviewed_at = NOW()`
     2. Nếu `[progress_pct] = 100`: Kích hoạt `Task_Mark_Completed` trên bảng `Tasks`
     3. Thêm dòng vào `Notifications` báo cho CBTD nộp báo cáo
     4. Thêm dòng vào `AuditLogs` với `action = "progress.approve"`

2. **`Action_Reject_Progress` (Từ chối tiến độ - R7):**
   - **Do this:** `Data: set the values of some columns in this row` (kèm form nhập `review_comment`)
   - **Condition:**
     ```text
     AND(
       [review_status] = "pending",
       IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-KSV", "ROL-ADMIN"))
     )
     ```
   - **Set columns:** `review_status = "rejected"`, `reviewed_by_user_id = LOOKUP(...)`, `reviewed_at = NOW()`, `review_comment = [Nhập lý do]`
   - **Trigger:** Thêm dòng thông báo từ chối & ghi `AuditLogs` với `action = "progress.reject"`

### 3.3 Bảng `Customers`

1. **Hiển thị trường đại diện công ty (R17):**
   - Cột `Nguoi_Dai_Dien_Cty` (hoặc `representative_name`):
     - **Show_If:** `[type] = "business"` (hoặc `[Loai_Khach_Hang] = "Cong_Ty"`)

### 3.4 Bảng `Users` & Admin Console

1. **Nút Backup / Restore (R16):**
   - **Do this:** Webhook kích hoạt kịch bản sao lưu Drive
   - **Show_If:** `LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN"`

---

## 4. Automation Bots (Tự động hóa ngầm)

1. **`Bot_Auto_Complete_On_Approval` (Hoàn thành tự động R8):**
   - **Bảng:** `TaskUpdates`
   - **Event:** `Update only`
   - **Condition:**
     ```text
     AND([_THISROW_BEFORE].[review_status] = "pending", [_THISROW_AFTER].[review_status] = "approved", [_THISROW_AFTER].[progress_pct] = 100)
     ```
   - **Task:** Run data action `Task_Mark_Completed` trên dòng `[task_id]`.

2. **`Bot_Progress_Notification` (Thông báo tiến độ R11):**
   - **Bảng:** `TaskUpdates`
   - **Event:** `Adds only`
   - **Condition:** `[review_status] = "pending"`
   - **Task:** Thêm thông báo đến các KSV trong đơn vị (`event_type = "progress_submitted"`).

