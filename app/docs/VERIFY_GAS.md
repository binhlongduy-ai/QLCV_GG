# Kiểm chứng trên Apps Script thật (sheet thử nghiệm)

Tài liệu này dành cho sheet **thử nghiệm riêng, chỉ dùng dữ liệu tổng hợp** (R13). Không chạy các bước này trên sheet có dữ liệu thật.

## 0. Đã kiểm chứng và còn lại

| Hạng mục | Trạng thái |
|---|---|
| Đẩy mã lên dự án Apps Script (`clasp push`, 28 file) | Đã làm, không báo lỗi cú pháp |
| Mã trên dự án khớp repo từng file | Đã kiểm: kéo về thư mục tạm bằng `clasp pull` rồi so sánh, khớp hoàn toàn |
| Thứ tự nạp file | Đúng: `clasp` sắp theo tên khi không có `filePushOrder`, tên file có tiền tố số hai chữ số |
| Trình tự khởi tạo trong `DEPLOYMENT.md` | Đã sửa: bootstrap và seed không chạy chung trên một sheet |
| Chạy hàm trên sheet (bước 1–5 dưới đây) | **Cần bạn chạy** trong trình soạn thảo |
| Deploy web app và luồng API thật | Chưa làm (chưa được phép deploy) |

## 1. Thuộc tính script (Project Settings → Script properties)

| Khóa | Giá trị | Bắt buộc ở bước |
|---|---|---|
| `ADMIN_EMAIL` | email quản trị thử của bạn | seed |
| `ALLOW_SEED` | `true` | seed (đặt lại `false` sau khi xong) |
| `SPREADSHEET_ID` | ID của sheet thử | chỉ khi script không gắn trực tiếp vào sheet |
| `GOOGLE_CLIENT_ID` | Client ID loại Web | chỉ khi deploy web app |
| `BACKUP_FOLDER_ID` | thư mục Drive để chứa bản sao lưu thử | tùy chọn (bước 5) |
| `DIRECTOR_EMAILS` | email Giám đốc thử | tùy chọn |

## 2. Nạp dữ liệu tổng hợp: chạy `seedDemoData`

Chạy trên sheet **trống**. Không chạy `bootstrapDatabase` trước.

**Kỳ vọng:**
- Log: `Đã nạp dữ liệu tổng hợp.`
- Có đủ 10 tab, tab Users có 7 dòng, dòng `USR-001` mang email `ADMIN_EMAIL`.
- Chạy lại lần hai phải báo lỗi `Từ chối: tab Users đã có dữ liệu.` (đây là hành vi đúng: không nạp trùng).

## 3. Kiểm tra toàn vẹn: chạy `checkIntegrity`

**Kỳ vọng:** log JSON có `"ok": true` và `"issueCount": 0`.

## 4. Cấu hình: chạy `showConfig`

**Kỳ vọng:** `clientId`, `allowedDomain`, `directors`, `backupFolder`, `allowSeed` phản ánh đúng các thuộc tính đã đặt.

Sau đó đặt `ALLOW_SEED` về `false`.

## 5. Sao lưu (tùy chọn): chạy `dailyBackup`

**Kỳ vọng:** một file Google Sheets có tên `QLCV_backup_daily_<ngày_giờ>` xuất hiện trong thư mục `BACKUP_FOLDER_ID` (hoặc Drive gốc nếu không đặt). Xóa file thử sau khi kiểm tra.

## 6. Trigger (tùy chọn): chạy `installTriggers`

**Kỳ vọng:** trong Triggers có một trigger `dailyBackup`, chạy hằng ngày lúc 2 giờ.

## 7. Những việc chưa kiểm chứng được nếu chưa deploy

| Hạng mục | Vì sao cần deploy | Cách kiểm |
|---|---|---|
| Xác minh Google ID token thật | cần request từ trình duyệt đã đăng nhập | đăng nhập SPA bằng tài khoản Admin thử |
| Khóa đồng thời (`LockService`) | cần nhiều request song song | gửi 2 yêu cầu ghi cùng lúc, kiểm tra không bị ghi đôi |
| Bộ nhớ đệm vai trò (`CacheService`) | cần request qua web app | đổi quyền một vai trò, đợi tối đa `REF_CACHE_SEC` |

Các mục này cần web app đã deploy. Chỉ làm khi bạn đồng ý deploy.

## 8. Báo kết quả

Dán log thực thi của từng bước (bước 2–6) vào trò chuyện. Không dán token, mật khẩu hay tệp cấu hình chứa khóa. Nếu có lỗi, ghi kèm tên hàm và thông báo lỗi nguyên văn.
