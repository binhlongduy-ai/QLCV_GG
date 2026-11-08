# Cấu Hình Triển Khai (Deployment Configuration)

Tài liệu này ghi chú luồng triển khai cũ. Nó cung cấp góc nhìn về cách hệ thống được đóng gói và vận hành trước khi chúng ta rebuild sang Framework mới.

## 1. Môi trường Thực thi
- **Nền tảng:** Google Apps Script (GAS) gắn với một Google Spreadsheet.
- **Execute as:** `User accessing the web app` (Tài khoản Google của người dùng đang truy cập). Điều này rất quan trọng để xác thực danh tính (`Session.getActiveUser().getEmail()`) mà không cần hệ thống đăng nhập riêng.
- **Who has access:** `Anyone within your organization` (Hoặc tuỳ chỉnh theo policy của tổ chức).

## 2. Quy trình Đóng gói (Build Process)
Do GAS không hỗ trợ trực tiếp việc import/export JS module hay thẻ `<link>` CSS bên ngoài một cách hiệu quả cho Web App, một build script PowerShell đã được thiết lập:

- **Script:** `sync_wrappers.ps1`
- **Hoạt động:** 
  - Đọc nội dung `app.js` và `index.css`.
  - Wrap (Bọc) nội dung đó trong thẻ `<script>` và `<style>`.
  - Sinh ra các file `app_js.html` và `index_css.html`.
- **Sử dụng:** Trong file template gốc (`index.html`), các file này được gọi bằng hàm include phía server: `<?!= include('app_js'); ?>`.

## 3. Quản lý Phiên bản và Sync với GAS
- Mã nguồn được viết trên local editor (VS Code).
- Sau khi chạy `sync_wrappers.ps1`, dùng công cụ như **clasp** (Command Line Apps Script Projects) để push code lên Google Cloud.
- Lệnh: `clasp push`.
- Nếu có lỗi Syntax (chẳng hạn ở `app.js`), Clasp sẽ từ chối push. Do đó dự án có thêm `verify_syntax.js` để kiểm tra trước khi build.

## 4. Định hướng cho Rebuild (Framework Mới)
Khi hệ thống được rebuild bằng Vite/React/Vue:
- **Tách bạch Frontend và Backend:**
  - **Frontend:** Build qua Vite thành các file static (`index.html`, CSS, JS) và có thể host trên Vercel, Firebase Hosting, hoặc Netlify.
  - **Backend:** Xây dựng API riêng (Node.js/Express hoặc Serverless Functions) và giao tiếp với CSDL (PostgreSQL/MongoDB).
- **Authentication:** Không còn phụ thuộc vào `Session.getActiveUser()` của GAS. Cần setup JWT hoặc Firebase Authentication để xác thực.
- **Loại bỏ hoàn toàn build script:** Các wrapper (`app_js.html`, `index_css.html`) sẽ bị xoá bỏ hoàn toàn, thay thế bằng module bundler chuẩn của Webpack/Vite.
