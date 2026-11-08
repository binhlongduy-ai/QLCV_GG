# QLCV_CBTD — MVP

Hệ thống quản lý công việc cán bộ tín dụng: Google Apps Script API + Google Sheets (CSDL) + SPA tĩnh (Render).

- Kiến trúc, cấu trúc tệp, ERD, giao diện: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Endpoint: [docs/API.md](docs/API.md)
- Triển khai: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Chạy thử nhanh
```bash
npm test         # kiểm thử backend (Node >= 18)
npm run serve    # demo trình duyệt, chọn người dùng mẫu theo vai trò
```
Dữ liệu mẫu lấy từ `../data/appsheet-synthetic/*.csv` (sinh `96_Seed.js` bằng `npm run seed`).
