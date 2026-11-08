# Đánh giá của đội 4 vai trò: backend đã tái cấu trúc

Phạm vi: `app/backend/src` ở nhánh `refactor/clean-architecture` (sau commit `467902b`). Mục tiêu: đánh giá thiết kế, kiểm lỗi, và tối ưu hiệu năng mà **không đổi hành vi API**.

Quy trình: Kiến trúc sư → Kỹ sư → Người đánh giá → Người tối ưu hóa, mỗi vai trò kiểm tra kết quả của vai trò trước. Mọi nhận định đều dựa trên số liệu hoặc tái hiện được.

## 1. Kiến trúc (Kiến trúc sư)

**Đã xác nhận bằng số liệu:** các luật phụ thuộc giữa các lớp được giữ.

| Luật | Kiểm tra | Kết quả |
|---|---|---|
| Miền (`20_Domain`) không chạm hạ tầng hay lớp trên | tìm `Q.Env/Store/Repo/Policy/Auth/...` | 0 vi phạm |
| Trình bày (`23_Presenters`) chỉ đọc | tìm `insert/update/Store/Env` | 0 vi phạm |
| Use case (`40`–`48`) không chạm `Q.Store` | tìm `Q.Store` | 0 vi phạm |
| `Q.Store` chỉ ở hạ tầng và adapter | tìm `Q.Store` | 0 vi phạm |
| Repository là nơi duy nhất gọi `S()` | tìm `S()` | chỉ trong `22_Repositories.js` |

Các luật này nay được kiểm bằng kiểm thử tự động (`tests/architecture.test.js`), để refactor sau này không làm vỡ ranh giới mà không ai biết.

**Điểm thiết kế cần lưu ý (không sửa trong vòng này):**
- `21_Access` (ứng dụng) đọc `Q.Env` để lưu bộ nhớ đệm vai trò và Properties. Đây là hạ tầng bị trộn vào lớp quyền. Nên chuyển sang một cổng tham chiếu (`Repo.reference()`). Ưu tiên thấp.
- Tên namespace không khớp tên tệp: `Q.Audit`/`Q.Notify` nằm trong `24_Activity.js`, `Q.Assignments` nằm trong `25_Assignments.js`. Chấp nhận được, nhưng nên ghi rõ trong `ARCHITECTURE.md` (chưa làm).
- `Repo.of` và `Repo.resetCache` là hai điểm lộ ra có chủ đích (kiểm tra toàn vẹn và đầu request). Chấp nhận được.

## 2. Triển khai (Kỹ sư)

Vòng này **không thay đổi mã runtime**. Kỹ sư thêm:
- `tests/architecture.test.js`: 8 kiểm thử (6 luật kiến trúc, tiền tố số của tệp, và ca tự kiểm để chứng minh bộ phát hiện bắt được vi phạm thật và bỏ qua chú thích).
- `tools/bench-memory.js`: công cụ đo hiệu năng trên bộ dữ liệu lớn, để số liệu tái lập được.
- Thêm `tests/architecture.test.js` vào `npm test`.

Kết quả: `npm test` đạt **57/57**. File golden `characterization.json` không đổi.

## 3. Nhận xét đánh giá (Người đánh giá)

**Giả thuyết đã bị bác bỏ bằng tái hiện:**
- *Giả thuyết:* `dashboard.get` sẽ lỗi khi có phân công còn hiệu lực trỏ tới công việc không tồn tại (vì dereference `null`).
- *Kết quả:* **không lỗi**. Mã chỉ duyệt phân công của công việc đang nằm trong phạm vi xem, nên bản ghi mồ côi bị bỏ qua. `admin.integrity` vẫn phát hiện đúng 1 vấn đề. Không ghi nhận là lỗi.

**Rủi ro còn lại được xác nhận:**
- Chưa chạy trên Apps Script thật ngoài việc đẩy mã và so khớp (chưa chạy hàm, chưa deploy). Xem `docs/VERIFY_GAS.md`.
- Ba chỗ trong mã nhắc tới `operations-runbook` (`48_Svc_Maintenance.js`, `admin.js`, bundle demo) nhưng file này không tồn tại. Cần sửa thành `VERIFY_GAS.md` hoặc tạo runbook.
- `docs/CODE_REVIEW.md` còn nhắc tới tên cũ (`Q.Rules`, `30_Core.js`). Đây là tài liệu lịch sử, chưa cập nhật.

## 4. Tối ưu hóa (Người tối ưu hóa)

### Số đo trước khi thay đổi

Bộ dữ liệu tổng hợp lớn: 5.000 công việc, 6.700 phân công, 10.000 cập nhật tiến độ, 20.000 thông báo, 20.000 nhật ký, 2.000 người dùng, 3.000 khách hàng. Số đo từ `tools/bench-memory.js`.

| Hành động | Dòng đọc / request | Thời gian (ms, trung vị) |
|---|---:|---:|
| `auth.me` | 22.011 | ~86 |
| `task.list` (Admin, trang 1) | 26.690 | ~125 |
| `task.get` | 26.690 | ~168 |
| `dashboard.overview` | 26.690 | ~168 |
| `dashboard.get` (KSV) | 26.690 | ~135 |
| `progress.pending` | 17.015 | ~77 |
| `customer.list` (Admin) | 5.010 | ~26 |
| `notification.list` (CBTD) | 22.011 | ~75 |
| `user.list` | 2.011 | ~7 |
| `admin.integrity` | 66.721 | ~314 |

### Chẩn đoán

Profile CPU (`--cpu-prof`) trên các request nóng:
- **~58%** nằm trong `clone` của driver bộ nhớ (`Env_Memory.js`). Đây là chi phí của giả lập, **không có trên Sheets**.
- **~25%** nằm ở nạp và chuẩn hóa dòng (`freeze`, `normalize`, `keyOf`, lập chỉ mục).
- Logic nghiệp vụ (`Dash.get`, `T.list`, ...) **dưới 1%** mỗi hàm.

Kết luận: **không có nút thắt trong nghiệp vụ** để sửa mà không đổi hành vi. Chi phí thật khi chạy trên Sheets là **số dòng đọc mỗi request**, và số này bằng kích thước các bảng mà request chạm tới. Mỗi request nạp trọn bảng, vì Sheets không có chỉ mục để đọc một phần.

### Đề xuất (cần quyết định, chưa triển khai)

| Mã | Thay đổi | Giảm dòng đọc (ước lượng từ kích thước bảng đo được) | Đánh đổi |
|---|---|---|---|
| P1 | Lưu sẵn `approved_progress` và `pending_updates` trên `Tasks`, cập nhật khi gửi/duyệt tiến độ | `task.list`, `task.get`, `dashboard.*`: từ 26.690 xuống ~16.700 (−10.000, khoảng −37%) | Đổi lược đồ, cần migration; giữ nguyên DTO |
| P2 | Đếm thông báo chưa đọc lưu trên `Users` (`unread_count`) | `auth.me`: từ 22.011 xuống ~2.011 (−90%) | Thêm cột, phải đồng bộ khi tạo và đọc thông báo |
| P3 | Bộ nhớ đệm người dùng theo email (CacheService, TTL ngắn) | Bớt ~2.000 dòng/request khi cache trúng | Thay đổi trạng thái (vô hiệu hóa, đổi vai trò) có độ trễ tối đa bằng TTL |

Không đề xuất tối ưu CPU ở mức mã (ví dụ đổi `findBy` thành `where`): tiết kiệm dưới 5%, không đáng đổi.

## 5. Vòng 2: triển khai P1, P2, P3 (người dùng đã duyệt)

| Vai trò | Việc đã làm |
|---|---|
| Kiến trúc sư | Thêm lớp `26_Derived.js` (duy trì số liệu dẫn xuất) và `Q.UserCache` trong `21_Access.js`. Cột dẫn xuất khai báo tường minh bằng `derived` trong lược đồ. Nguồn sự thật vẫn là TaskUpdates và Notifications. |
| Kỹ sư | Cập nhật tăng dần đúng chỗ đổi trạng thái (gửi, duyệt lần đầu, tạo thông báo, đánh dấu đã đọc); ghi xuyên cache khi đổi dòng Users; di trú bổ sung cột cho tab cũ trong `ensureTabs`; tính lại khi bootstrap, seed và nạp dữ liệu mẫu. |
| Người đánh giá | Golden 140 bước không đổi (DTO cho ra đúng giá trị như cách tính cũ). Thêm `tests/derived.test.js` (7 ca): thử lại không trừ hai lần, lệch dữ liệu bị `admin.integrity` phát hiện và `admin.reconcile` sửa, số chưa đọc khớp thực tế, vô hiệu hóa qua API có hiệu lực ngay, đánh đổi khi sửa tay, đường đọc không chạm bảng lớn, di trú sheet cũ trên Apps Script giả lập. |
| Người tối ưu hóa | Đo lại trên cùng bộ dữ liệu (bảng dưới). |

### Số đo trước và sau

| Hành động | Dòng đọc trước | Dòng đọc sau | Thay đổi |
|---|---:|---:|---:|
| `auth.me` (trúng cache) | 22.011 | 0 | −100% |
| `task.list` (Admin) | 26.690 | 16.686 | −37% |
| `dashboard.overview` | 26.690 | 16.686 | −37% |
| `dashboard.get` (KSV) | 26.690 | 16.686 | −37% |
| `customer.list` (Admin) | 5.010 | 3.003 | −40% |
| `customer.list` (CBTD) | 16.686 | 14.679 | −12% |
| `notification.list` | 22.011 | 20.004 | −9% |
| `audit.list` | 22.015 | 20.008 | −9% |
| `task.get` | 26.690 | 26.690 | 0 (cần lịch sử tiến độ) |
| `progress.pending` | 17.015 | 17.015 | 0 (cần danh sách báo cáo) |

### Đánh đổi đã chấp nhận

- **Ghi:** tạo thông báo và đánh dấu đã đọc nay cập nhật thêm dòng Users. `notification.markRead` đọc thêm tab Users (khoảng 2.000 dòng ở bộ dữ liệu này). Ghi ít hơn đọc rất nhiều nên tổng chi phí giảm.
- **Cache:** thay đổi qua API có hiệu lực ngay (ghi xuyên). Sửa trực tiếp trên Sheets (ví dụ vô hiệu hóa người dùng) chỉ có hiệu lực sau tối đa `USER_CACHE_SEC` = 60 giây. Có kiểm thử ghi nhận đánh đổi này.
- **Sheet đang có dữ liệu:** chạy `bootstrapDatabase` một lần sau khi đẩy mã để thêm cột và tính lại số liệu.
- **`pendingReviews` trên dashboard:** nay là tổng `pending_updates` của mọi công việc. Kết quả giống cách đếm cũ khi dữ liệu nhất quán; chỉ khác nếu có báo cáo trỏ tới công việc không tồn tại (dữ liệu hỏng, `admin.integrity` báo lỗi).

## 6. Phiên bản cuối cùng

- Kiểm thử: **64/64** đạt. Golden không đổi. Hành vi API giữ nguyên.
- Thay đổi chưa commit: các tệp backend liên quan P1–P3, `tests/derived.test.js`, `tests/architecture.test.js`, `tools/bench-memory.js`, bundle demo, `package.json`, tài liệu.
- Chưa kiểm trên Apps Script thật: cần `clasp push` lại và chạy `bootstrapDatabase`/`seedDemoData` theo `VERIFY_GAS.md`.
