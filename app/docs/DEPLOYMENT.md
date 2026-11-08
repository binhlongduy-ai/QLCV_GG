# Triển khai

## 0. Kiểm thử cục bộ (không cần Google)
```bash
npm test                 # 49 kiểm thử (gồm kiểm thử đặc trưng hành vi characterization)
npm run serve            # demo tại http://localhost:8080 (DEMO_MODE=true mặc định)
```

## 1. Google Sheets + Apps Script
1. Tạo một Google Sheet trống (đặt tên "QLCV_CBTD_DB"), tạo dự án Apps Script gắn vào Sheet (hoặc dùng `clasp create --parentId`).
2. Đẩy mã: `cd backend && cp .clasp.json.example .clasp.json` → điền `scriptId` → `clasp push` (chỉ thư mục `src`, không đẩy `dev/`).
3. Script Properties (Project Settings):
   | Khóa | Ý nghĩa |
   |---|---|
   | `GOOGLE_CLIENT_ID` | OAuth Client ID (Web) tạo ở bước 2 |
   | `SPREADSHEET_ID` | ID của Sheet (nếu script không gắn trực tiếp) |
   | `ADMIN_EMAIL` | Email quản trị đầu tiên |
   | `ALLOWED_DOMAIN` | (tùy chọn) tên miền Workspace được phép |
   | `DIRECTOR_EMAILS` | email Giám đốc, cách nhau dấu phẩy |
   | `BACKUP_FOLDER_ID` | thư mục Drive chứa bản sao lưu |
   | `ALLOW_SEED` | `true` chỉ khi nạp dữ liệu mẫu, xong đổi lại `false` |
4. Chạy trong trình soạn thảo. **Chọn đúng một nhánh, không chạy cả hai:**
   - Sheet **thật**: `bootstrapDatabase` (tạo tab, nạp vai trò/quyền, tạo Admin đầu tiên từ `ADMIN_EMAIL`).
   - Sheet **thử nghiệm**: `seedDemoData` trên sheet trống (tự tạo tab, vai trò/quyền và dữ liệu tổng hợp, kể cả Admin). **Không** chạy `bootstrapDatabase` trước: bootstrap đã tạo Admin ở tab Users nên `seedDemoData` sẽ từ chối (đã tái hiện bằng môi trường giả lập).
   - Sau đó: `checkIntegrity` → `installTriggers` → `showConfig`. `protectSheets` chạy sau cùng. Hoặc dùng menu **QLCV** trong Sheet.
   - Quy trình kiểm chứng đầy đủ: xem [VERIFY_GAS.md](VERIFY_GAS.md).
5. Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone**. Sao chép URL `/exec` làm `API_URL`. Mỗi lần đổi mã phải tạo phiên bản triển khai mới.

## 2. Google OAuth Client ID
Google Cloud Console → APIs & Services → Credentials → OAuth client ID loại **Web application**. Authorized JavaScript origins: URL Render của bạn (và `http://localhost:8080` khi thử). Màn hình đồng ý OAuth: chọn Internal nếu dùng Workspace.

## 3. Render (giao diện tĩnh)
1. Đẩy kho mã lên Git, tạo **Static Site** từ `render.yaml` (hoặc nhập tay: Build `node tools/build.js demo && node tools/build.js config`, Publish `frontend`).
2. Đặt biến môi trường: `API_URL`, `GOOGLE_CLIENT_ID`, `DEMO_MODE=false`.
3. Thêm URL Render vào Authorized JavaScript origins (bước 2).

## 4. Nghiệm thu sau triển khai
- Mở `API_URL?` bằng GET → `status: ok`, `runtime: gas`.
- Đăng nhập bằng 4 tài khoản vai trò khác nhau; chạy luồng: CBTD gửi 100% → KSV duyệt → việc hoàn thành → Admin chạy "Kiểm tra toàn vẹn".
- **Không nạp dữ liệu thật** cho đến khi hoàn tất đánh giá an toàn thông tin (R13).
