# Đặc tả thiết kế Dashboard và tổng hợp chỉ số theo vai trò (U5)

Tài liệu này đặc tả chi tiết cấu hình các **Slices**, **KPI Blocks**, **Charts** và các view thành phần của Bảng điều khiển (Dashboard) theo các yêu cầu R3, R10, R15 trong [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md).

---

## 1. Nguyên tắc thiết kế số liệu tổng hợp (R3, R10)

1. **Phạm vi bảo mật là tiên quyết:** Mọi con số thống kê và danh sách chi tiết đều phải tuân thủ nghiêm ngặt **Security Filter** của tầng dữ liệu (U2). CBTD chỉ nhìn thấy các chỉ số tính toán dựa trên tập công việc và khách hàng mà mình được phân công.
2. **Không lưu trữ bảng trung gian tĩnh:** Các chỉ số tổng hợp được tính toán động (dynamically computed) từ các bảng `Tasks`, `TaskUpdates`, `Customers` thông qua Slice và Virtual Columns/AppSheet formulas; không dùng bảng Sheets tĩnh để tránh số liệu cũ, lệch pha.
3. **Tuyệt đối không hiển thị chỉ số tín dụng:** Không đưa số dư nợ, phân loại nợ hay thông tin tài chính nhạy cảm vào Dashboard thí điểm.

---

## 2. Dashboard ưu tiên cho Giám đốc (R15)

Dành riêng cho vai trò `Giam_Doc` (Ban Giám đốc) và `Admin` để giám sát các công việc trọng yếu, khẩn cấp hoặc trễ hạn.

### 2.1 Cấu hình Slice nguồn: `Slice_Director_Priority_Tasks`
- **Bảng nguồn:** `Tasks`
- **Row Filter Condition (Nguyên văn theo R15):**
  ```text
  AND(
    OR(
      [priority] = "high",
      [priority] = "urgent",
      [due_at] < TODAY()
    ),
    [status] <> "completed"
  )
  ```
  *(Đối với trường hợp sử dụng chuỗi tiếng Việt như công thức gốc R15: `AND(OR([Muc_Do_Uu_Tien] = "Khan", [Muc_Do_Uu_Tien] = "Quan_Trong", [Ngay_Het_Han] < TODAY()), [Trang_Thai] <> "Hoàn thành")`).*

> **Lưu ý kiểm thử AE8:**
> Phép so sánh `[due_at] < TODAY()` nghĩa là công việc có hạn là **ngày hôm nay** (`= TODAY()`) sẽ **chưa** bị tính là quá hạn.

### 2.2 View Show_If (R15)
Chỉ hiển thị view này cho Giám đốc và Quản trị viên:
```text
OR(
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN",
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-BGD"
)
```
*(Nếu sử dụng tên vai trò chi tiết: `OR(LOOKUP(USEREMAIL(), "Nhan_Su", "Email", "Vai_Tro") = "Giam_Doc", LOOKUP(USEREMAIL(), "Nhan_Su", "Email", "Vai_Tro") = "Admin")`).*

---

## 3. Các chỉ số KPI tổng quan theo vai trò (R10)

| Mã chỉ số | Tên chỉ số | Công thức tính toán | Vai trò hiển thị |
|---|---|---|---|
| **KPI-01** | Công việc đang thực hiện | `COUNT(SELECT(Tasks[task_id], [status] = "in_progress"))` | Tất cả (theo scope) |
| **KPI-02** | Công việc chưa bắt đầu | `COUNT(SELECT(Tasks[task_id], [status] = "not_started"))` | Tất cả (theo scope) |
| **KPI-03** | Công việc quá hạn | `COUNT(SELECT(Tasks[task_id], AND([status] <> "completed", [due_at] < TODAY())))` | Tất cả (theo scope) |
| **KPI-04** | Báo cáo chờ duyệt | `COUNT(SELECT(TaskUpdates[update_id], [review_status] = "pending"))` | KSV, Admin |
| **KPI-05** | Công việc hoàn thành | `COUNT(SELECT(Tasks[task_id], [status] = "completed"))` | Tất cả (theo scope) |
| **KPI-06** | Khách hàng quản lý | `COUNT(Customers[customer_id])` | Tất cả (theo scope) |

---

## 4. Bố cục giao diện Dashboard (UX Layout)

### 4.1 Bảng điều khiển CBTD (`Dashboard_CBTD`)
- **Khối KPI Card:** 
  - Việc cần làm hôm nay (`due_at <= TODAY()` & `status <> "completed"`)
  - Đang làm (`status = "in_progress"`)
  - Quá hạn
- **Khối View tương tác:**
  - Danh sách công việc được giao (phân nhóm theo mức độ ưu tiên)
  - Thông báo mới chưa đọc

### 4.2 Bảng điều khiển KSV (`Dashboard_KSV`)
- **Khối KPI Card:**
  - Báo cáo tiến độ chờ KSV duyệt (nhấn vào mở ngay danh sách chờ duyệt)
  - Tổng số công việc đơn vị đang theo dõi
  - Số công việc quá hạn
- **Khối View tương tác:**
  - Table: Danh sách báo cáo chờ duyệt (có nút duyệt/từ chối nhanh)
  - Chart: Phân bổ công việc theo cán bộ phụ trách (`TaskAssignees.user_id`)

### 4.3 Bảng điều khiển BGD & Giám đốc (`Dashboard_Director`)
- **Khối KPI Card:**
  - Tỷ lệ công việc hoàn thành toàn đơn vị
  - Số việc khẩn cấp / quan trọng đang mở
  - Số việc quá hạn toàn đơn vị
- **Khối View tương tác (R15):**
  - Table: `Slice_Director_Priority_Tasks` (danh sách công việc ưu tiên cần chỉ đạo)
  - Chart: Tỷ lệ tiến độ theo nhóm khách hàng / loại công việc

