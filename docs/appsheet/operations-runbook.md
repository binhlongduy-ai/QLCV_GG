# Sổ tay vận hành AppSheet QLCV CBTD

Tài liệu này mô tả các quy trình vận hành thường ngày và xử lý sự cố cho ứng dụng AppSheet QLCV CBTD.  
Nguồn: [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md) mục "Kế hoạch tài liệu" và "Các giai đoạn triển khai".

> [!NOTE]
> Tài liệu này là **bản thiết kế** cho giai đoạn thí điểm. Các quy trình cần được cập nhật sau khi AppSheet/Workspace được cấu hình thực tế và nghiệm thu U7 đạt.

---

## 1. Người chịu trách nhiệm

| Vai trò vận hành | Mô tả | Người phụ trách | Người dự phòng |
|---|---|---|---|
| Chủ ứng dụng AppSheet | Thay đổi cấu hình ứng dụng, cấp/thu hồi quyền biên tập | **TBD** | **TBD** |
| Chủ sổ dữ liệu (Google Sheets) | Quản lý quyền truy cập trực tiếp sổ, sao lưu | **TBD** | **TBD** |
| Chủ nghiệp vụ / quy trình | Phê duyệt thay đổi quy trình, vai trò | **TBD** | **TBD** |
| Chủ dữ liệu | Phê duyệt nạp/thay đổi dữ liệu, mapping | **TBD** | **TBD** |
| Quản trị viên Workspace/bảo mật | Giấy phép, chia sẻ, chính sách thiết bị, kiểm toán | **TBD** | **TBD** |
| Chủ đơn vị thí điểm | Xác nhận người dùng pilot, nghiệm thu | **TBD** | **TBD** |

> [!IMPORTANT]
> Phải điền tên cụ thể vào bảng trên trước khi mời người dùng thí điểm (theo điều kiện hoàn thành U7).

---

## 2. Vòng đời tài khoản người dùng

### 2.1 Thêm người dùng mới

1. Quản trị viên Workspace xác nhận tài khoản Google Workspace hợp lệ và đã được cấp giấy phép AppSheet.
2. Admin ứng dụng thêm dòng vào tab `Users` (Nhan_Su) với `status = active`.
3. Chủ ứng dụng chia sẻ ứng dụng AppSheet cho email tương ứng (hoặc nhóm Workspace được duyệt).
4. Kiểm thử đăng nhập lần đầu với tài khoản mới — xác nhận vai trò, màn hình đầu và bộ lọc dữ liệu đúng.
5. Ghi nhật ký: `AuditLogs` với `action = user.create`.

### 2.2 Thay đổi vai trò

1. Chủ nghiệp vụ gửi yêu cầu thay đổi vai trò bằng văn bản.
2. Admin ứng dụng cập nhật `Users.role_id` → vai trò mới.
3. Kiểm thử lại quyền với tài khoản đó trước khi đóng yêu cầu.
4. Ghi nhật ký: `AuditLogs` với `action = user.role_change`.

> [!CAUTION]
> Admin **không được tự thay đổi vai trò của chính mình**. Yêu cầu phải có phê duyệt độc lập từ người có thẩm quyền trước khi thực hiện (điểm chưa chốt — xem [role-permission-matrix.md](./role-permission-matrix.md)).

### 2.3 Thu hồi quyền (nhân viên nghỉ việc / đổi đơn vị)

1. Chủ sổ dữ liệu hoặc Admin cập nhật `Users.status = inactive` (không xóa dòng).
2. Chủ ứng dụng xóa tài khoản khỏi danh sách chia sẻ AppSheet.
3. Kiểm tra: lần đồng bộ kế tiếp người đó không còn truy cập được ứng dụng.
4. **Không xóa dòng `Users`**: phân công, cập nhật tiến độ và nhật ký kiểm toán liên quan vẫn giữ `email_snapshot` để truy xuất lịch sử.
5. Nếu người dùng có công việc đang được giao (`TaskAssignees.active = TRUE`): Admin phải phân công lại trước khi vô hiệu hóa (quy tắc xử lý chính xác **chưa chốt** — xem [role-permission-matrix.md](./role-permission-matrix.md) mục Điểm chưa chốt).

---

## 3. Sao lưu và khôi phục sổ dữ liệu

> [!WARNING]
> Nút **Backup/Restore** trong ứng dụng chỉ được bật cho Admin sau khi handler được xác nhận và kiểm thử phục hồi trên dữ liệu tổng hợp đạt (theo R16, U7). Hiện tại handler chưa được xác định.

### 3.1 Sao lưu thủ công (trước khi handler được duyệt)

1. Chủ sổ dữ liệu truy cập Google Sheets trực tiếp (chỉ người có quyền sở hữu).
2. **File → Tạo bản sao** — đặt tên theo quy ước `QLCV_GG_Backup_YYYYMMDD`.
3. Lưu bản sao vào thư mục Google Drive chỉ chủ sở hữu truy cập được.
4. Ghi nhật ký thời gian, người thực hiện và tên file sao lưu.

### 3.2 Khôi phục

1. Chủ sổ dữ liệu xác định bản sao lưu cần dùng.
2. Khôi phục trên bản sao thử trước — không ghi đè sổ production trước khi xác nhận dữ liệu.
3. Chạy `node tools/appsheet/check-integrity.js` trên bản xuất CSV để xác nhận toàn vẹn.
4. Nếu đạt: chủ sổ dữ liệu thực hiện khôi phục production với sự chứng kiến của ít nhất một người có thẩm quyền.
5. Ghi nhật ký: thời gian, lý do, bản sao được dùng, người thực hiện, người chứng kiến.

---

## 4. Giám sát lỗi automation

AppSheet automation (tự động hoàn thành, thông báo, kiểm toán) có thể thất bại hoặc chạy lại. Quy trình xử lý:

### 4.1 Phát hiện lỗi

- Chủ ứng dụng kiểm tra **AppSheet Audit History** (mục chẩn đoán, không phải nhật ký nghiệp vụ) định kỳ — ít nhất 1 lần/tuần trong giai đoạn thí điểm.
- Dấu hiệu lỗi automation: công việc có `TaskUpdates.review_status = approved` và `progress_pct = 100` nhưng `Tasks.status ≠ completed`; hoặc thông báo không được tạo sau sự kiện.

### 4.2 Xử lý lỗi automation

| Loại lỗi | Hành động |
|---|---|
| Automation thất bại một lần | Kiểm tra `request_or_event_key` trong `Notifications`/`AuditLogs` — nếu chưa ghi thì chạy lại theo cách thủ công |
| Automation tạo trùng thông báo/nhật ký | Xác định `request_or_event_key` trùng; giữ dòng đầu tiên; đánh dấu dòng trùng để chủ dữ liệu xem xét |
| Công việc không tự chuyển `completed` | Admin thực hiện thủ công sau khi xác nhận có `approved` 100%; ghi `AuditLogs` với `action = task.manual_complete` và lý do |

> [!NOTE]
> Dùng `request_or_event_key` ổn định để phân biệt lần chạy đầu tiên và lần chạy lại. Nếu AppSheet/Sheets không thể khử trùng lặp an toàn, ghi nhận giới hạn và chặn phát hành dữ liệu thật cho đến khi có kiểm soát được phê duyệt (theo U6).

---

## 5. Quy trình báo cáo sự cố

### 5.1 Phân loại mức độ

| Mức | Mô tả | Thời gian xử lý |
|---|---|---|
| **P1 — Nghiêm trọng** | Dữ liệu bị lộ cho người không có quyền; ứng dụng hoàn toàn không truy cập được | Ngay lập tức; báo cáo trong vòng 1 giờ |
| **P2 — Cao** | Luồng nghiệp vụ chính bị gián đoạn (không giao/nhận việc, không gửi tiến độ) | Báo cáo trong ngày làm việc |
| **P3 — Trung bình** | Chức năng phụ bị ảnh hưởng; dữ liệu không đồng bộ nhưng không mất | Báo cáo trong 2 ngày làm việc |
| **P4 — Thấp** | Hiển thị sai; lỗi không ảnh hưởng dữ liệu | Lên lịch xử lý theo chu kỳ bảo trì |

### 5.2 Quy trình báo cáo

1. **Người dùng** phát hiện sự cố → báo cáo cho **Admin ứng dụng** kèm: thời gian xảy ra, vai trò tài khoản, thao tác đang thực hiện, ảnh chụp màn hình (không chứa dữ liệu khách hàng).
2. **Admin ứng dụng** xác định mức độ → báo ngay cho **Chủ ứng dụng** và **Chủ sổ dữ liệu** nếu P1/P2.
3. **Chủ ứng dụng** kiểm tra AppSheet Audit History và sổ dữ liệu để xác định phạm vi.
4. Nếu có nghi ngờ lộ dữ liệu (P1): **thu hồi quyền truy cập tạm thời** → báo **Quản trị viên bảo mật** → điều tra → chỉ cấp lại quyền sau khi xác nhận an toàn.
5. Ghi lại toàn bộ quá trình xử lý vào nhật ký sự cố (file Google Docs riêng, không phải `AuditLogs` ứng dụng).

---

## 6. Chính sách lưu trữ dữ liệu

> [!IMPORTANT]
> Thời hạn lưu nhật ký và dữ liệu **chưa được tổ chức phê duyệt**. Bảng dưới là giá trị đề xuất — cần xác nhận trước khi mời người dùng thí điểm (điểm chặn từ quyết định 2026-10-13).

| Loại dữ liệu | Lưu trong sổ | Thời hạn tối thiểu đề xuất | Trạng thái |
|---|---|---|---|
| `Tasks` (công việc) | Vĩnh viễn (soft archive) | Vĩnh viễn | Chờ duyệt |
| `TaskAssignees` (phân công) | Vĩnh viễn | Vĩnh viễn | Chờ duyệt |
| `TaskUpdates` (tiến độ) | Vĩnh viễn | Vĩnh viễn | Chờ duyệt |
| `AuditLogs` (nhật ký nghiệp vụ) | Vĩnh viễn (chỉ ghi thêm) | Theo yêu cầu pháp lý/nội bộ | **Chưa chốt** |
| `Notifications` (thông báo) | Có thể lưu trữ sau 90 ngày | 90 ngày | Chờ duyệt |
| AppSheet Audit History (chẩn đoán) | Tự động (7 ngày/53 ngày theo gói) | Không dùng làm hồ sơ nghiệp vụ | Đã biết |
| Bản sao lưu sổ | Google Drive | Tối thiểu 12 tháng | Chờ duyệt |

---

## 7. Thay đổi cấu hình ứng dụng

Mọi thay đổi cấu hình AppSheet (bảng, biểu mẫu, hành động, security filter) phải:

1. Được kiểm thử trong môi trường test (bản sao ứng dụng) trước.
2. Được chủ ứng dụng và chủ nghiệp vụ duyệt.
3. Được triển khai trong giờ thấp điểm.
4. Được ghi lại trong nhật ký thay đổi (changelog) của ứng dụng.
5. Được kiểm tra lại bộ lọc bảo mật (`security filter`) sau mỗi thay đổi liên quan đến phân quyền.

---

## 8. Checklist hàng tuần (giai đoạn thí điểm)

- [ ] Kiểm tra AppSheet Audit History tìm lỗi automation.
- [ ] Xác nhận không có công việc stuck (có `approved 100%` nhưng `status ≠ completed`).
- [ ] Xác nhận không có tài khoản inactive còn trong danh sách chia sẻ AppSheet.
- [ ] Chạy `node tools/appsheet/check-integrity.js` trên bản xuất CSV mới nhất.
- [ ] Xem xét thông báo chưa đọc quá 7 ngày (có thể là lỗi giao thông báo).
- [ ] Tạo bản sao lưu sổ nếu chưa có trong tuần.

---

## 9. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 2026-11-08 | Khởi tạo tài liệu theo kế hoạch plan AppSheet U7 |

