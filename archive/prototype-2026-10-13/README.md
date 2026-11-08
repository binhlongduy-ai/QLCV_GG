# Lưu trữ: Prototype React/Express (QLCV CBTD v2.0)

> **Trạng thái: ĐÃ LƯU TRỮ, không còn phát triển, không triển khai.**
> Ngày lưu trữ: 2026-10-13. Lý do: chốt hướng xây dựng hệ thống trên AppSheet + Google Sheets. Xem [quyết định chốt hướng](../../docs/decisions/2026-10-13-chot-huong-appsheet.md).

## Nội dung

File `_backup_prototype_20261013.zip` chứa thư mục `backend/` và `frontend/` của prototype tại thời điểm gỡ bỏ:

- `backend/`: Express API với dữ liệu trong bộ nhớ, đăng nhập mẫu, chưa có xác thực/phân quyền thật.
- `frontend/`: React 19 + Vite, dùng mock data cho phần lớn màn hình.

Thư mục `node_modules/` không được đưa vào zip vì có thể cài lại.

## Cách khôi phục để tham khảo

1. Giải nén zip vào một thư mục **mới, trống** (không ghi đè lên dự án).
2. Chạy `npm install` trong `backend/` và `frontend/` riêng biệt.

Khôi phục chỉ để tham khảo hoặc so sánh. Không dùng bản này làm nền tảng cho hệ thống chính thức nếu không có quyết định mới.

## Không nên làm

- Không deploy bản này lên môi trường thật. Nó chứa đăng nhập mẫu (`admin@domain.com` / `admin`), token cố định và API không có kiểm soát truy cập.
- Không dùng nó để chứa dữ liệu khách hàng hoặc tín dụng thật.
- Không đưa vào lại dự án chính nếu không có quyết định mới.
