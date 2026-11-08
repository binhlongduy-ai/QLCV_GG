# Quyết định 2026-10-13: Chốt hướng AppSheet cho QLCV CBTD

## Quyết định

- Hệ thống mới xây dựng trên **AppSheet + Google Sheets**, theo [plan AppSheet](./../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md) và [migration-spec.md](./../../migration-spec.md).
- Hướng PostgreSQL + JWT + React/Express trong [SPECIFICATION_v2.md](./../solutions/SPECIFICATION_v2.md) **không còn là lộ trình** và được tạm hoãn.
- Prototype React/Express đã được gỡ khỏi dự án theo lựa chọn của người dùng.

## Đã thực hiện

- Lưu trữ `backend/` và `frontend/` (không gồm `node_modules`) tại [archive/prototype-2026-10-13](../../archive/prototype-2026-10-13/README.md). Đã lưu trữ, không còn phát triển.
- Xóa `backend/`, `frontend/`, `.venv/` (chỉ chứa pip/setuptools).
- Xóa `notes/DeXuat_extracted.xml`, `notes/extract_docx.ps1` (script trỏ tới đường dẫn không tồn tại).
- Xóa `docs/solutions/SPECIFICATION.md` (bản v1, đã có v2 thay thế).
- Xóa bản plan tiếng Anh, giữ bản tiếng Việt.

Giữ lại: `legacy/` (hệ thống GAS đang tham chiếu), `migration-spec.md`, `docs/solutions/` (business logic, bug đã fix, cấu hình triển khai), `notes/` (bản .docx gốc và .txt), `Hep_compound-engineering-plugin_QLCV.docx` (chưa rõ nguồn, chưa xóa).

## Việc còn chặn trước khi nạp dữ liệu thật

Theo mục Open Questions và R13 của plan:

1. Đơn vị pilot và danh sách tài khoản người dùng.
2. KSV phê duyệt cho từng công việc.
3. Phiên bản Workspace/AppSheet và quyền licence; chế độ truy cập nguồn dữ liệu.
4. Thời gian lưu audit, chính sách thiết bị và cache cục bộ.
5. Có được mở lại hoặc sửa công việc đã hoàn thành không, và vai trò nào được làm việc đó.
6. Phạm vi hiển thị có giới hạn trong một đơn vị tổ chức hay không.

Không đưa dữ liệu khách hàng hoặc tín dụng thật vào cho đến khi có phê duyệt bảo mật và chủ dữ liệu (R13).
