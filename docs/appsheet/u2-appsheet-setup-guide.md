# Hướng dẫn cấu hình AppSheet (U2)

Tài liệu này là hướng dẫn từng bước để tạo sổ Google Sheets, kết nối AppSheet và cấu hình danh tính/vai trò/phân quyền dữ liệu cho giai đoạn thí điểm QLCV CBTD.

**Điều kiện tiên quyết:** U1 đã hoàn thành (lược đồ, dữ liệu tổng hợp, kiểm tra toàn vẹn đạt).

> [!IMPORTANT]
> Toàn bộ U2 phải được thực hiện với **dữ liệu tổng hợp** (`@example.com`). Chưa nạp dữ liệu thật cho đến khi đạt cổng bảo mật/chủ dữ liệu tại R13.

---

## Checklist tiền điều kiện (trả lời trước khi mở AppSheet)

Điền tên người chịu trách nhiệm vào cột bên phải trước khi bắt đầu:

| # | Điều kiện | Người xác nhận | Trạng thái |
|---|---|---|---|
| P1 | Có tài khoản Google Workspace của tổ chức (không dùng tài khoản cá nhân) | Quản trị viên Workspace | ⬜ Chưa xác nhận |
| P2 | Giấy phép AppSheet đã được duyệt cho chủ ứng dụng và từng người dùng thí điểm | Quản trị viên Workspace | ⬜ Chưa xác nhận |
| P3 | Đã chỉ định: chủ ứng dụng AppSheet, chủ sổ dữ liệu, người dự phòng | Chủ đơn vị thí điểm | ⬜ Chưa xác nhận |
| P4 | Đã chỉ định: danh sách email tài khoản kiểm thử cho Admin, BGD, KSV, CBTD (đang hoạt động), CBTD (không hoạt động) | Chủ đơn vị thí điểm | ⬜ Chưa xác nhận |
| P5 | Chính sách thiết bị và bộ nhớ đệm offline đã được phê duyệt | Quản trị viên bảo mật | ⬜ Chưa xác nhận |
| P6 | Chế độ truy cập nguồn dữ liệu AppSheet đã được phê duyệt (người dùng ứng dụng không có quyền trực tiếp vào sổ) | Quản trị viên bảo mật | ⬜ Chưa xác nhận |

---

## Bước 1 — Tạo sổ Google Sheets

### 1a. Tạo sổ mới

1. Đăng nhập bằng tài khoản **chủ sổ dữ liệu** (không dùng tài khoản cá nhân).
2. Tạo Google Sheets mới. Đặt tên theo quy ước:
   ```
   QLCV_CBTD_Pilot_<YYYY-MM-DD>
   ```
3. Lưu vào thư mục Google Drive chỉ chủ sổ truy cập được (không chia sẻ chung).

### 1b. Chạy script tạo cấu trúc

1. Trong sổ vừa tạo, mở **Extensions → Apps Script**.
2. Xóa toàn bộ code mặc định trong editor.
3. Copy toàn bộ nội dung file [`tools/appsheet/setup-sheets.gs`](../../tools/appsheet/setup-sheets.gs) và dán vào editor.
4. Nhấn **Save** (Ctrl+S).
5. Chọn hàm `setupWorkbook` trong dropdown → nhấn **Run**.
6. Lần đầu chạy: cho phép quyền truy cập khi được hỏi.
7. Kiểm tra kết quả trong tab **SetupLog** của sổ — tất cả 10 tab phải hiển thị ✅.

### 1c. Xác minh cấu trúc

```
Menu: 🗂️ QLCV Setup → 2. Kiểm tra lược đồ (không ghi dữ liệu)
```

Phải nhận thông báo: `✅ Tất cả tab và tiêu đề cột đều khớp lược đồ.`

### 1d. Hạn chế quyền chia sẻ sổ

> [!CAUTION]
> Bước này **bắt buộc** trước khi kết nối AppSheet. Người dùng ứng dụng không được có quyền trực tiếp vào sổ.

1. **File → Share → Share with others** → đảm bảo chỉ chủ sổ và chủ ứng dụng AppSheet có quyền.
2. Tắt "Anyone with the link can view/edit".
3. Xem xét cài đặt "Restrict who can download, print, and copy" nếu chính sách tổ chức yêu cầu.
4. Ghi lại URL sổ để dùng ở bước kết nối AppSheet.

---

## Bước 2 — Tạo ứng dụng AppSheet

### 2a. Khởi tạo từ Google Sheets

1. Đăng nhập AppSheet bằng tài khoản **chủ ứng dụng** (phải có giấy phép).
2. Vào [appsheet.com](https://www.appsheet.com) → **New App → Start with existing data**.
3. Chọn **Google Sheets** → chọn sổ `QLCV_CBTD_Pilot_<YYYY-MM-DD>`.
4. AppSheet tự động nhận diện các tab — chọn **tất cả 10 tab**.
5. Tên ứng dụng đề xuất: `QLCV_CBTD_Pilot`.

### 2b. Kiểm tra kiểu dữ liệu tự động nhận diện

Vào **Data → Tables** và xác nhận kiểu cột đúng cho các cột quan trọng:

| Tab | Cột | Kiểu mong đợi | Ghi chú |
|---|---|---|---|
| `Tasks` | `due_at` | Date | Nếu AppSheet nhận là Text, đổi thủ công |
| `Tasks` | `status` | Enum | Giá trị: `not_started`, `in_progress`, `completed` |
| `Tasks` | `priority` | Enum | Giá trị: `high`, `normal`, `low` |
| `TaskAssignees` | `active` | Yes/No | Giá trị: `TRUE`/`FALSE` |
| `TaskUpdates` | `progress_pct` | Number | Phải là số, không phải Text |
| `TaskUpdates` | `review_status` | Enum | Giá trị: `pending`, `approved`, `rejected` |
| `Notifications` | `read_at` | DateTime | Cho phép trống |
| `AuditLogs` | `created_at` | DateTime | |

### 2c. Cấu hình Ref (tham chiếu)

Vào **Data → Tables → [bảng con] → [cột FK]** và thêm kiểu `Ref` trỏ đến bảng cha:

| Bảng con | Cột | Ref đến bảng cha |
|---|---|---|
| `Users` | `role_id` | `Roles` |
| `RolePermissions` | `role_id` | `Roles` |
| `RolePermissions` | `permission_id` | `Permissions` |
| `Tasks` | `customer_id` | `Customers` |
| `Tasks` | `created_by_user_id` | `Users` |
| `TaskAssignees` | `task_id` | `Tasks` |
| `TaskAssignees` | `user_id` | `Users` |
| `TaskUpdates` | `task_id` | `Tasks` |
| `TaskUpdates` | `submitted_by_user_id` | `Users` |
| `TaskUpdates` | `reviewed_by_user_id` | `Users` |
| `Notifications` | `recipient_user_id` | `Users` |
| `AuditLogs` | `actor_user_id` | `Users` |

---

## Bước 3 — Cấu hình xác thực và chia sẻ

### 3a. Bắt buộc đăng nhập

1. Vào **Security → Require Sign-In** → bật **ON**.
2. Provider: **Google** (dùng tài khoản Workspace của tổ chức).
3. **Tắt** "Allow public access" và "Allow embedded".

### 3b. Chia sẻ ứng dụng

> [!WARNING]
> Chỉ chia sẻ cho **danh sách email cụ thể** của tài khoản kiểm thử pilot. Không chia sẻ cho "Anyone with the link".

1. Vào **Users → Share** → thêm email từng tài khoản kiểm thử:
   ```
   admin@example.com        → (thay bằng email thật của người kiểm thử Admin)
   bgd@example.com          → (thay bằng email thật của người kiểm thử BGD)
   ksv01@example.com        → (thay bằng email thật của người kiểm thử KSV)
   cbtd01@example.com       → (thay bằng email thật của người kiểm thử CBTD 1)
   cbtd02@example.com       → (thay bằng email thật của người kiểm thử CBTD 2)
   cbtd03@example.com       → (thay bằng email thật của người kiểm thử CBTD 3)
   ```
2. Quyền mặc định: **User** (không phải Admin/Editor AppSheet).
3. Chủ ứng dụng và người dự phòng: quyền **Editor** (chia sẻ riêng qua AppSheet team).

### 3c. Cập nhật email trong sổ Users

> [!IMPORTANT]
> Tab `Users` trong sổ dùng email `@example.com` (tổng hợp). Trước khi kiểm thử phân quyền thật, cần cập nhật `email` trong tab `Users` khớp với email Workspace thật của từng người kiểm thử.

```
Ví dụ: đổi "admin@example.com" → "ten.nguoi@donvi.vn"
```

Chạy lại `verifySchema()` sau khi cập nhật để đảm bảo cấu trúc không thay đổi.

---

## Bước 4 — Cấu hình Security Filters (phân quyền dữ liệu theo dòng)

> [!WARNING]
> Security filter là cơ chế **bảo mật chính** để giới hạn dữ liệu gửi đến ứng dụng. Slice chỉ dùng để tạo màn hình, **không thay thế** security filter. Kiểm thử với tài khoản đăng nhập riêng, không kiểm tra chỉ bằng màn hình ẩn.

Vào **Data → Tables → [bảng] → Security Filter**:

### Tab `Tasks` — CBTD chỉ thấy công việc được giao

```
OR(
  IN(USEREMAIL(), Users[email]),
  AND(
    LOOKUP(USEREMAIL(), "Users", "email", "role_id") <> "ROL-CBTD",
    TRUE
  ),
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

**Phiên bản đơn giản hóa (khuyến nghị — test trước):**
```
OR(
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") <> "ROL-CBTD",
  ISNOTBLANK(
    FILTER("TaskAssignees",
      AND([task_id] = [_THISROW].[task_id],
          [active] = TRUE,
          LOOKUP([user_id], "Users", "user_id", "email") = USEREMAIL())
    )
  )
)
```

> **Giải thích:** Nếu không phải CBTD → xem tất cả. Nếu là CBTD → chỉ xem task có phân công active cho email của mình.

### Tab `Customers` — CBTD chỉ thấy khách hàng liên kết công việc được giao

```
OR(
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") <> "ROL-CBTD",
  ISNOTBLANK(
    FILTER("Tasks",
      AND([customer_id] = [_THISROW].[customer_id],
          ISNOTBLANK(
            FILTER("TaskAssignees",
              AND([task_id] = [_THISROW_OUTER].[task_id],
                  [active] = TRUE,
                  LOOKUP([user_id], "Users", "user_id", "email") = USEREMAIL())
            )
          )
      )
    )
  )
)
```

### Tab `TaskUpdates` — CBTD chỉ thấy cập nhật công việc được giao

```
OR(
  LOOKUP(USEREMAIL(), "Users", "email", "role_id") <> "ROL-CBTD",
  ISNOTBLANK(
    FILTER("TaskAssignees",
      AND([task_id] = [_THISROW].[task_id],
          [active] = TRUE,
          LOOKUP([user_id], "Users", "user_id", "email") = USEREMAIL())
    )
  )
)
```

### Tab `Notifications` — mỗi người chỉ thấy thông báo của mình

```
LOOKUP(USEREMAIL(), "Users", "email", "user_id") = [recipient_user_id]
```

### Tab `AuditLogs` — chỉ Admin xem được

```
LOOKUP(USEREMAIL(), "Users", "email", "role_id") = "ROL-ADMIN"
```

### Các tab còn lại (không có security filter riêng)

| Tab | Quyết định |
|---|---|
| `Roles`, `Permissions`, `RolePermissions` | Chỉ đọc; mọi người dùng đã đăng nhập được xem (dữ liệu tham chiếu) |
| `Users` | Admin xem tất cả; người dùng khác chỉ cần xem chính mình (AppSheet USEREMAIL) |
| `TaskAssignees` | Không có filter riêng — quyền xem task đã kiểm soát gián tiếp |

> [!NOTE]
> Tên bảng và cột trong biểu thức (`Users`, `email`, `role_id`, v.v.) phải khớp **chính xác** với tên tab và cột trong AppSheet. Xác minh sau khi cấu hình Ref ở Bước 2c.

---

## Bước 5 — Kiểm thử phân quyền (ma trận nghiệm thu nhóm B)

Dùng [acceptance-test-matrix.md](./acceptance-test-matrix.md) nhóm B. Trình tự kiểm thử:

### 5a. Checklist trước khi kiểm thử

- [ ] Đã cập nhật email trong tab `Users` khớp với email Workspace thật của từng tài khoản kiểm thử.
- [ ] Đã chia sẻ ứng dụng cho từng email kiểm thử.
- [ ] Có ít nhất 5 tài khoản kiểm thử riêng biệt: Admin, BGD, KSV, CBTD (active), CBTD (inactive).
- [ ] Chủ ứng dụng **không** dùng tài khoản của mình để kiểm thử vai trò khác.

### 5b. Quy trình cho từng ca kiểm thử

1. Mở ứng dụng AppSheet bằng trình duyệt **ẩn danh** (hoặc thiết bị riêng) đăng nhập bằng email kiểm thử.
2. Thực hiện thao tác theo mô tả ca kiểm thử.
3. Xác nhận kết quả bằng **đồng bộ dữ liệu** (không chỉ nhìn giao diện).
4. Ghi vào cột "Trạng thái" của [acceptance-test-matrix.md](./acceptance-test-matrix.md): `ĐẠT / KHÔNG ĐẠT / GHI CHÚ`.

### 5c. Ca ưu tiên kiểm thử trước

| Mã | Lý do ưu tiên |
|---|---|
| AE1 | Xác nhận tài khoản không được chia sẻ bị từ chối hoàn toàn |
| AE2 | Xác nhận CBTD chỉ thấy đúng công việc được giao |
| AE5 | Xác nhận người không có quyền bị từ chối truy cập trực tiếp sổ |

Nếu 3 ca này không đạt → **dừng lại**, rà soát security filter và quyền chia sẻ trước khi tiếp tục.

---

## Bước 6 — Ghi kết quả và bàn giao U2

Khi tất cả ca nhóm B đạt:

1. Cập nhật cột "Trạng thái" trong [acceptance-test-matrix.md](./acceptance-test-matrix.md).
2. Cập nhật bảng "Người chịu trách nhiệm" trong [operations-runbook.md](./operations-runbook.md) với tên thật.
3. Quản trị viên Workspace/bảo mật xác nhận bằng văn bản: chế độ truy cập, giấy phép, chính sách thiết bị.
4. Ghi kết quả kiểm thử vào file bằng chứng (Google Docs riêng) kèm: người thực hiện, ngày, kết quả từng ca.
5. Chuyển sang U3.

---

## Điểm chưa chốt cần giải quyết trước U3

| # | Nội dung | Người quyết định |
|---|---|---|
| Q1 | Tên bảng vật lý AppSheet thực tế (`Nhan_Su` hay `Users`?) và mapping cột | Người xây dựng AppSheet |
| Q2 | Giá trị `role_id` lưu trong sổ: `ROL-ADMIN` hay `Admin` hay tên tiếng Việt? | Người xây dựng AppSheet + chủ dữ liệu |
| Q3 | Biểu thức R15–R17 dùng `Vai_Tro` hay `role_id`? Giá trị `Giam_Doc` lưu thế nào? | Chủ nghiệp vụ |
| Q4 | Chính sách thiết bị offline: có tắt offline mode không? | Quản trị viên bảo mật |

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 2026-11-08 | Khởi tạo hướng dẫn U2 theo plan AppSheet và data-dictionary.md |

