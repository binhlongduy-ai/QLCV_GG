# Ma trận vai trò và quyền AppSheet (U2)

Tài liệu này liệt kê đầy đủ vai trò, quyền và phạm vi dữ liệu cho ứng dụng AppSheet QLCV CBTD.  
Nguồn: [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md) mục "Ma trận vai trò" và [data-dictionary.md](./data-dictionary.md) mục `Permissions`.

> [!IMPORTANT]
> Ma trận này là **thiết kế**. Cấu hình AppSheet thực tế phải được kiểm thử với tài khoản đăng nhập riêng cho từng vai trò trước khi nghiệm thu (xem [acceptance-test-matrix.md](./acceptance-test-matrix.md) nhóm B).

---

## 1. Định nghĩa vai trò

| `role_id` | `code` | Tên hiển thị | Mô tả |
|---|---|---|---|
| `ROL-ADMIN` | `Admin` | Quản trị viên | Toàn quyền nghiệp vụ trong ứng dụng; không sửa/xóa nhật ký và lịch sử |
| `ROL-BGD` | `BGD` | Ban Giám đốc | Tạo/giao việc; xem báo cáo khối lượng công việc; Giám đốc có dashboard ưu tiên |
| `ROL-KSV` | `KSV` | Kiểm soát viên | Tạo/giao việc; duy trì khách hàng; duyệt/từ chối tiến độ |
| `ROL-CBTD` | `CBTD` | Cán bộ tín dụng | Xem việc được giao; gửi tiến độ; tạo việc nếu tự là người chính |

---

## 2. Ma trận quyền (vai trò × quyền)

✅ Có quyền | ❌ Không có | ⚠️ Có điều kiện (xem chú thích)

| Mã quyền | Tên quyền | Admin | BGD | KSV | CBTD |
|---|---|:---:|:---:|:---:|:---:|
| `PER-01` task.view | Xem công việc | ✅ | ✅ | ✅ | ✅⚠️¹ |
| `PER-02` task.create | Tạo công việc | ✅ | ✅ | ✅ | ✅⚠️² |
| `PER-03` task.update | Cập nhật/quản trị công việc | ✅ | ✅ | ✅ | ❌ |
| `PER-04` task.transfer | Chuyển giao người thực hiện chính | ✅ | ✅⚠️³ | ✅ | ❌ |
| `PER-05` task.start | Bắt đầu công việc (→ in_progress) | ✅ | ✅ | ✅ | ✅⚠️¹ |
| `PER-06` customer.view | Xem khách hàng | ✅ | ✅ | ✅ | ✅⚠️⁴ |
| `PER-07` customer.maintain | Tạo/cập nhật khách hàng | ✅ | ❌ | ✅ | ❌ |
| `PER-08` customer.delete | Xóa khách hàng (soft delete) | ✅ | ❌ | ❌ | ❌ |
| `PER-09` progress.submit | Gửi tiến độ | ✅ | ✅ | ✅ | ✅⚠️¹ |
| `PER-10` progress.review | Duyệt/từ chối tiến độ | ✅ | ❌ | ✅ | ❌ |
| `PER-11` dashboard.view | Xem bảng điều khiển | ✅ | ✅ | ✅ | ✅⚠️¹ |
| `PER-12` dashboard.view_director | Dashboard ưu tiên Giám đốc | ✅ | ✅⚠️³ | ❌ | ❌ |
| `PER-13` audit.view | Xem nhật ký kiểm toán | ✅ | ❌ | ❌ | ❌ |
| `PER-14` notification.view | Xem thông báo của mình | ✅ | ✅ | ✅ | ✅ |
| `PER-15` user.manage | Quản lý người dùng & Backup/Restore | ✅ | ❌ | ❌ | ❌ |

### Chú thích điều kiện

| Ký hiệu | Điều kiện |
|---|---|
| ⚠️¹ | **Phạm vi CBTD:** chỉ áp dụng cho công việc được giao với vai trò `primary` hoặc `collaborator` đang hoạt động; khách hàng liên kết công việc đó; dashboard chỉ tính bản ghi được phép xem |
| ⚠️² | **Ràng buộc R6:** CBTD chỉ được tạo công việc khi tự là người phụ trách chính (`assignment_role = primary`) |
| ⚠️³ | **Chỉ Giám đốc:** BGD có `PER-04` và `PER-12` chỉ khi vai trò trong ứng dụng được xác định là `Giam_Doc` theo biểu thức R15/R16/R17; cơ chế phân biệt Giám đốc trong BGD **chưa chốt** — xem [Điểm chưa chốt](#4-điểm-chưa-chốt) |
| ⚠️⁴ | **Phạm vi CBTD:** chỉ khách hàng liên kết với công việc được giao |

---

## 3. Phạm vi dữ liệu theo vai trò

| Thực thể | Admin | BGD | KSV | CBTD |
|---|---|---|---|---|
| **Tasks** — xem | Tất cả | Phạm vi thí điểm | Phạm vi thí điểm | Chỉ công việc được giao |
| **Tasks** — tạo/giao | Có | Có | Có | Chỉ khi tự là người chính |
| **Tasks** — cập nhật trạng thái thủ công | Có | Có (trừ auto-complete) | Có (trừ auto-complete) | Không |
| **Tasks** — `completed` | Chỉ theo R8 | Chỉ theo R8 | Chỉ theo R8 | Không được tự hoàn thành |
| **Tasks** — lưu trữ (archive) | Có | Có | Có | Không |
| **Customers** — xem | Tất cả | Phạm vi thí điểm | Phạm vi thí điểm | Chỉ liên kết công việc được giao |
| **Customers** — tạo/sửa | Có | Không | Có | Không |
| **Customers** — xóa (soft) | Có | Không | Không | Không |
| **TaskUpdates** — gửi | Có | Có | Có | Chỉ công việc được giao |
| **TaskUpdates** — duyệt/từ chối | Có | Không | Có | Không |
| **Notifications** | Chỉ dòng của mình | Chỉ dòng của mình | Chỉ dòng của mình | Chỉ dòng của mình |
| **AuditLogs** | Xem tất cả | Không | Không | Không |
| **Users (Nhan_Su)** — CRUD | Có | Không | Không | Không |
| **Backup / Restore** | Có | Không | Không | Không |
| **Dashboard ưu tiên Giám đốc** | Có | Chỉ Giám đốc ⚠️³ | Không | Không |

---

## 4. Biểu thức AppSheet tham chiếu (R15–R17)

> [!WARNING]
> Các biểu thức sau sử dụng tên bảng/cột **chờ xác nhận** (`Nhan_Su`, `Email`, `Vai_Tro`, `Giam_Doc`). **Không bật biểu thức** trước khi ánh xạ tên thực tế trong ứng dụng được xác nhận (xem KTD8 trong plan).

### R15 — Dashboard Giám đốc

```text
-- Row filter cho Slice nguồn:
AND(
  OR([Muc_Do_Uu_Tien] = "Khan", [Muc_Do_Uu_Tien] = "Quan_Trong", [Ngay_Het_Han] < TODAY()),
  [Trang_Thai] <> "Hoàn thành"
)

-- View Show If:
OR(
  LOOKUP(USEREMAIL(), "Nhan_Su", "Email", "Vai_Tro") = "Giam_Doc",
  LOOKUP(USEREMAIL(), "Nhan_Su", "Email", "Vai_Tro") = "Admin"
)
```

**Lưu ý:** Ngày đến hạn bằng hôm nay (`= TODAY()`) **không** được tính là quá hạn bởi phép so sánh `< TODAY()`.

### R16 — Quản lý người dùng & Backup/Restore (chỉ Admin)

```text
-- Show If cho màn hình quản lý Nhan_Su và nút Backup/Restore:
LOOKUP(USEREMAIL(), "Nhan_Su", "Email", "Vai_Tro") = "Admin"
```

### R17 — Trường đại diện công ty và Action chuyển giao

```text
-- Show If cho trường Nguoi_Dai_Dien_Cty:
[Loai_Khach_Hang] = "Cong_Ty"

-- Show If cho Action chuyển giao Nguoi_Thuc_Hien:
IN(LOOKUP(USEREMAIL(), "Nhan_Su", "Email", "Vai_Tro"), LIST("Giam_Doc", "KSV", "Admin"))
```

---

## 5. Màn hình đầu theo vai trò (R14)

| Vai trò | Màn hình đầu | Điều hướng bổ sung |
|---|---|---|
| `Admin` | Màn hình quản trị (Users/Nhan_Su) | Toàn bộ menu: công việc, khách hàng, audit, thông báo, Backup/Restore |
| `BGD` | Tổng quan khối lượng công việc (chỉ đọc) | Điều hướng công việc/khách hàng theo quyền; không có duyệt tiến độ |
| `KSV` | Danh sách tiến độ chờ duyệt | Menu: công việc, khách hàng, duyệt tiến độ, thông báo |
| `CBTD` | Danh sách công việc được giao | Menu: công việc được giao, khách hàng liên kết, gửi tiến độ, thông báo |

**Trạng thái trống:** phải nêu rằng không có bản ghi được phép xem và bước tiếp theo được phép.  
**Trạng thái lỗi:** phải nêu rõ lỗi, có thao tác thử lại và hướng báo lỗi nếu sự cố tiếp diễn.

---

## 4. Điểm chưa chốt

| Mục | Mô tả | Người cần quyết định |
|---|---|---|
| Cơ chế phân biệt Giám đốc trong BGD | `Vai_Tro = "Giam_Doc"` hay cột riêng? Có cần bảng con `SubRoles` không? | Chủ nghiệp vụ |
| Tên bảng vật lý AppSheet | Ánh xạ `Nhan_Su` ↔ `Users`, `Email` ↔ `email`, `Vai_Tro` ↔ `role_id` | Người xây dựng AppSheet |
| Giá trị thô `Vai_Tro` | Chuỗi lưu là `"Admin"`, `"BGD"`, `"KSV"`, `"CBTD"`, `"Giam_Doc"` hay khác? | Người xây dựng AppSheet + chủ dữ liệu |
| Giá trị `Muc_Do_Uu_Tien` trong R15 | `"Khan"` và `"Quan_Trong"` hay `"high"` và `"normal"`? | Chủ nghiệp vụ |
| `Nguoi_Thuc_Hien` trong R17 | Ánh xạ vào `TaskAssignees.user_id` (người chính) hay cột vật lý khác? | Người xây dựng AppSheet + chủ dữ liệu |
| Quy tắc xóa người dùng có công việc đang giao | Chặn xóa hay chuyển `inactive`? | Chủ quy trình nghiệp vụ |
| Admin tự thay đổi vai trò của mình | Cho phép hay phải có phê duyệt độc lập? | Quản trị viên bảo mật |

---

## 5. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 2026-10-13 | Khởi tạo theo plan AppSheet và từ điển dữ liệu |
| 2026-11-08 | Tạo tài liệu chính thức; bổ sung biểu thức R15–R17, màn hình đầu, điểm chưa chốt |

