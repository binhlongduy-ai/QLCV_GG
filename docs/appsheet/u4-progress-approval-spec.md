# Đặc tả quy trình tiến độ, phê duyệt và tự động hoàn thành (U4)

Tài liệu này đặc tả chi tiết luồng nghiệp vụ **Báo cáo tiến độ (`TaskUpdates`)**, quy trình **Duyệt / Từ chối của KSV** và cơ chế **Tự động hoàn thành công việc (`completed`)** theo các yêu cầu R7, R8, R11, R12 trong [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md).

---

## 1. Luồng nghiệp vụ tổng quan

```text
CBTD được giao việc
   │
   ▼
Gửi báo cáo tiến độ (0 - 100%) kèm diễn giải
   │
   ▼
Tạo dòng mới trong TaskUpdates (review_status = "pending")
Tạo thông báo trong Notifications gửi KSV phụ trách
Ghi AuditLogs (action = "progress.submit")
   │
   ▼
KSV xem xét báo cáo
   ├──► [TỪ CHỐI] ──► Cập nhật dòng TaskUpdates: review_status = "rejected", ghi lý do
   │                  Tạo thông báo cho CBTD kèm lý do từ chối
   │                  Ghi AuditLogs (action = "progress.reject")
   │                  Công việc VẪN MỞ. CBTD gửi báo cáo mới để khắc phục.
   │
   └──► [DUYỆT] ──► Cập nhật dòng TaskUpdates: review_status = "approved"
                    Tạo thông báo cho CBTD
                    Ghi AuditLogs (action = "progress.approve")
                    │
                    ├── Nếu tiến độ < 100%: Công việc tiếp tục thực hiện
                    │
                    └── Nếu tiến độ = 100% (R8):
                        TỰ ĐỘNG CHUYỂN Tasks.status = "completed"
                        Ghi nhận Tasks.completed_at = NOW()
                        Tạo thông báo hoàn thành công việc
                        Ghi AuditLogs (action = "task.auto_complete")
```

---

## 2. Gửi báo cáo tiến độ (CBTD) — R7

### 2.1 Form `TaskUpdate_Form`
- **Bảng đích:** `TaskUpdates`
- **Quyền tạo:** CBTD phụ trách chính (`primary`) hoặc phối hợp (`collaborator`) đang hoạt động (`active = TRUE`) của công việc.

#### Cấu hình các trường:
| Trường | Kiểu dữ liệu | Giá trị khởi tạo (Initial Value) / Ràng buộc |
|---|---|---|
| `update_id` | Text | `UNIQUEID()` |
| `task_id` | Ref | Khóa công việc tương ứng |
| `progress_pct` | Number | **Valid_If:** `AND([progress_pct] >= 0, [progress_pct] <= 100)`<br>*(Chỉ chấp nhận số nguyên từ 0 đến 100)* |
| `narrative` | LongText | Bắt buộc (nội dung chi tiết diễn giải kết quả thực hiện) |
| `submitted_by_user_id` | Ref | `LOOKUP(USEREMAIL(), "Users", "email", "user_id")` (không cho phép sửa) |
| `submitted_by_email_snapshot` | Email | `USEREMAIL()` (không cho phép sửa) |
| `submitted_at` | DateTime | `NOW()` (không cho phép sửa) |
| `review_status` | Enum | Mặc định: `"pending"` |
| `reviewed_by_user_id` | Ref | Trống khi gửi (`Initial Value: ""`) |
| `reviewed_by_email_snapshot` | Email | Trống khi gửi |
| `reviewed_at` | DateTime | Trống khi gửi |
| `review_comment` | LongText | Trống khi gửi |

#### Ràng buộc không sửa/ghi đè lịch sử:
Bảng `TaskUpdates` được cấu hình **chỉ cho phép Thêm (Adds only)** đối với vai trò CBTD. Mọi báo cáo sau khi gửi sẽ không thể chỉnh sửa nội dung ban đầu. Khi cần bổ sung, CBTD tạo một bản ghi cập nhật mới.

---

## 3. Quy trình phê duyệt / từ chối (KSV & Admin) — R7, R8

### 3.1 Hành động Phê duyệt (`Action_Approve_Progress`)
- **Bảng:** `TaskUpdates`
- **Tên hiển thị:** "Duyệt tiến độ"
- **Icon:** `check-circle`
- **Chỉ hiển thị khi (Only if this condition is true):**
  ```text
  AND(
    [review_status] = "pending",
    IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-KSV", "ROL-ADMIN"))
  )
  ```
- **Hành vi thực thi (Group Action):**
  1. **Cập nhật dòng tiến độ:**
     - `review_status = "approved"`
     - `reviewed_by_user_id = LOOKUP(USEREMAIL(), "Users", "email", "user_id")`
     - `reviewed_by_email_snapshot = USEREMAIL()`
     - `reviewed_at = NOW()`
  2. **Kích hoạt tự động hoàn thành (nếu tiến độ = 100%):**
     - Thực hiện Action `Task_Mark_Completed` trên bảng `Tasks` tương ứng (chi tiết mục 4).
  3. **Tạo thông báo phản hồi cho CBTD:**
     - Thêm dòng vào `Notifications` gửi đến `[submitted_by_user_id]`.
  4. **Ghi nhật ký:**
     - Thêm dòng vào `AuditLogs` với mã hành động `"progress.approve"`.

### 3.2 Hành động Từ chối (`Action_Reject_Progress`)
- **Bảng:** `TaskUpdates`
- **Tên hiển thị:** "Từ chối / Yêu cầu làm lại"
- **Icon:** `x-circle`
- **Chỉ hiển thị khi:**
  ```text
  AND(
    [review_status] = "pending",
    IN(LOOKUP(USEREMAIL(), "Users", "email", "role_id"), LIST("ROL-KSV", "ROL-ADMIN"))
  )
  ```
- **Yêu cầu nhập lý do:** Mở form nhỏ yêu cầu KSV bắt buộc nhập trường `review_comment`.
- **Hành vi thực thi:**
  1. Cập nhật `review_status = "rejected"`, lưu lý do vào `review_comment`.
  2. Ghi nhận thông tin người duyệt và thời điểm tương tự luồng duyệt.
  3. Tạo thông báo cảnh báo cho CBTD: `"Cập nhật tiến độ của bạn bị từ chối. Vui lòng xem lý do và nộp lại."`
  4. Ghi `AuditLogs` với mã `"progress.reject"`.
  5. **Trạng thái công việc giữ nguyên (không bị đóng hay hủy).**

---

## 4. Tự động hoàn thành công việc (R8)

Quy tắc R8 yêu cầu: **Khi người duyệt chấp thuận báo cáo tiến độ đạt 100%, tự động chuyển công việc sang trạng thái `completed`, không cần thao tác đóng thủ công.**

### 4.1 Cấu hình Action `Task_Mark_Completed`
- **Bảng:** `Tasks`
- **Hành vi:** `Data: set the values of some columns in this row`
- **Các giá trị gán:**
  - `status = "completed"`
  - `completed_at = NOW()`
  - `updated_at = NOW()`
- **Chỉ kích hoạt khi:**
  ```text
  AND(
    [status] <> "completed",
    ISNOTBLANK(
      FILTER("TaskUpdates",
        AND(
          [task_id] = [_THISROW].[task_id],
          [review_status] = "approved",
          [progress_pct] = 100
        )
      )
    )
  )
  ```

### 4.2 Automation Bot (Tự động hóa ngầm)
- **Tên Bot:** `Bot_Auto_Complete_On_Approval`
- **Sự kiện kích hoạt:** Bảng `TaskUpdates` có bản ghi cập nhật:
  ```text
  AND(
    [_THISROW_BEFORE].[review_status] = "pending",
    [_THISROW_AFTER].[review_status] = "approved",
    [_THISROW_AFTER].[progress_pct] = 100
  )
  ```
- **Tác vụ thực thi:** Chạy Action `Task_Mark_Completed` trên dòng `Tasks` liên kết.

---

## 5. Ràng buộc bảo vệ tính toàn vẹn (Integrity Controls)

1. **Khóa công việc đã hoàn thành:**
   - Khi `Tasks.status = "completed"`, không cho phép gửi thêm cập nhật tiến độ mới:
     ```text
     [task_id].[status] <> "completed"
     ```
2. **Khử trùng lặp sự kiện (Idempotency Key):**
   - Mọi thông báo và nhật ký kiểm toán sinh ra từ việc duyệt/từ chối đều sử dụng `request_or_event_key` có cấu trúc:
     ```text
     CONCATENATE("evt-review-", [update_id])
     ```
   - Đảm bảo việc nhấn duyệt nhiều lần hoặc mạng gián đoạn không sinh ra nhiều thông báo hay nhiều lần đổi trạng thái.

