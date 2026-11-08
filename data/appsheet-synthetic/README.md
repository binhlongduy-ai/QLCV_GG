# Dữ liệu tổng hợp cho sổ AppSheet (U1)

Toàn bộ dữ liệu trong thư mục này là **dữ liệu tổng hợp**, không phải dữ liệu thật. Không đưa dữ liệu khách hàng hoặc tín dụng thật vào đây (R13).

- Email dùng miền `example.com`; số điện thoại và mã khách hàng đều là giá trị mẫu.
- Mỗi file CSV là một tab của sổ. Tiêu đề cột phải khớp [từ điển dữ liệu](../../docs/appsheet/data-dictionary.md).
- Giá trị không được chứa dấu phẩy, vì bộ kiểm tra tách cột theo dấu phẩy.
- Kiểm tra toàn vẹn: `node tools/appsheet/check-integrity.js`
