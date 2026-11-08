# Ma trận nghiệm thu sổ AppSheet (U1)

Ma trận này gồm các tình huống của U1 và các ca chấp nhận AE1–AE5 của plan. Tất cả chạy trên dữ liệu tổng hợp trong [data/appsheet-synthetic](../../data/appsheet-synthetic/README.md).

Trạng thái: **Đã kiểm tra** nghĩa là chạy được trên repo (không cần AppSheet). **Chờ AppSheet** nghĩa là cần sổ và ứng dụng AppSheet thật để kiểm thử.

## A. Kiểm tra toàn vẹn sổ (đã kiểm tra)

Lệnh: `node tools/appsheet/check-integrity.js`

| Mã | Tình huống | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| U1-T1 | Các khóa và tham chiếu trong dữ liệu tổng hợp | Không trùng khóa, không tham chiếu mồ côi | Đã kiểm tra: ĐẠT |
| U1-T2 | Công việc có CBTD chính và phối hợp | Đúng một `primary` đang hoạt động; tối đa một `collaborator` đang hoạt động | Đã kiểm tra: ĐẠT |
| U1-T3 | Mã khách hàng trùng | Phát hiện trùng, báo `customer_code`, không coi là nạp thành công | Đã kiểm tra: PASS (ca lỗi cố ý) |
| U1-T4 | Hai CBTD chính trên một công việc | Phát hiện lỗi | Đã kiểm tra: PASS (ca lỗi cố ý) |
| U1-T5 | CBTD tạo việc cho người khác | Phát hiện lỗi R6 | Đã kiểm tra: PASS (ca lỗi cố ý) |
| U1-T6 | Hoàn thành khi chưa có tiến độ 100% được duyệt | Phát hiện lỗi R8 | Đã kiểm tra: PASS (ca lỗi cố ý) |
| U1-T7 | Tham chiếu tới công việc không tồn tại | Phát hiện lỗi | Đã kiểm tra: PASS (ca lỗi cố ý) |
| U1-T8 | Thiếu email snapshot của tác nhân | Phát hiện lỗi | Đã kiểm tra: PASS (ca lỗi cố ý) |
| U1-T9a | Tiến độ vượt 100 (ví dụ: `150`) | Phát hiện lỗi `progress_pct` | Đã kiểm tra: PASS (ca lỗi cố ý — 2026-11-08) |
| U1-T9b | Tiến độ là chuỗi tự do (ví dụ: `50%`) | Phát hiện lỗi `progress_pct` | Đã kiểm tra: PASS (ca lỗi cố ý — 2026-11-08) |
| U1-T9c | Tiến độ là số âm (ví dụ: `-1`) | Phát hiện lỗi `progress_pct` | Đã kiểm tra: PASS (ca lỗi cố ý — 2026-11-08) |

## B. Phân quyền và truy cập (chờ AppSheet)

| Mã | Tình huống | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| AE1 | Người không có `Users` hoặc chưa được chia sẻ mở ứng dụng (`cbtd-inactive@example.com` hoặc tài khoản ngoài danh sách) | Bị từ chối; không có dữ liệu sổ | Chờ AppSheet |
| AE2 | CBTD `cbtd01` xem công việc | Chỉ thấy `CV-TEST-001`, `CV-TEST-002`, `CV-TEST-003` (vai trò chính) và không thấy `CV-TEST-004` | Chờ AppSheet |
| AE2b | CBTD `cbtd02` (phối hợp `CV-TEST-001`) | Thấy `CV-TEST-001`, không thấy công việc khác | Chờ AppSheet |
| AE2c | CBTD `cbtd03` (gỡ phối hợp `CV-TEST-001`, lịch sử `active = FALSE`) | Không thấy `CV-TEST-001`; thấy `CV-TEST-004` | Chờ AppSheet |
| AE2d | CBTD tạo công việc mới cho người khác | Bị chặn: người chính phải là chính mình | Chờ AppSheet |
| AE2e | CBTD `cbtd01` xem khách hàng | Chỉ thấy khách hàng liên kết công việc được giao | Chờ AppSheet |
| AE5 | Người không có quyền sổ truy cập trực tiếp Google Sheets | Bị từ chối | Chờ AppSheet (cấu hình Workspace) |
| R3-admin | Admin xem | Thấy tất cả | Chờ AppSheet |
| R3-bgd | BGD xem và cố sửa công việc | Xem được; không duyệt được tiến độ | Chờ AppSheet |
| R3-ksv | KSV xem nhật ký kiểm toán | Không thấy (mặc định không) | Chờ AppSheet |

## C. Quy trình tiến độ và hoàn thành (chờ AppSheet)

| Mã | Tình huống | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| AE3a | CBTD gửi tiến độ 100% và KSV duyệt | Công việc chuyển `completed`; `completed_at` có giá trị; có thông báo và nhật ký | Chờ AppSheet |
| AE3b | KSV từ chối tiến độ | Công việc không hoàn thành; lý do còn nhìn thấy với người có thẩm quyền | Chờ AppSheet |
| AE3c | Gửi lại sau khi bị từ chối | Tạo dòng mới; dòng cũ không đổi | Chờ AppSheet |
| AE3d | CBTD cố tự duyệt tiến độ | Bị chặn | Chờ AppSheet |
| AE3e | Chạy lại cùng một sự kiện (retry) | Không tạo thêm thông báo hay nhật ký (kiểm tra `request_or_event_key`) | Chờ AppSheet |
| U1-S1 | Admin xóa người dùng có phân công và tiến độ | Bản ghi cũ không bị xóa dây chuyền; email snapshot vẫn xác định được người gửi/người duyệt | Chờ AppSheet |

## D. Thông báo và nhật ký (chờ AppSheet)

| Mã | Tình huống | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| AE4a | Giao việc mới | Chỉ người được giao nhận thông báo; có dòng `AuditLogs` `task.assign` | Chờ AppSheet |
| AE4b | Gửi tiến độ | Chỉ KSV nhận thông báo `progress_submitted`; có nhật ký `progress.submit` | Chờ AppSheet |
| AE4c | Nội dung thông báo và nhật ký | Không chứa dữ liệu khách hàng nhạy cảm, không có token hay mật khẩu | Chờ AppSheet |
| R12 | Hành động không được phép sửa/xóa nhật ký | `AuditLogs` không sửa được từ giao diện người dùng | Chờ AppSheet |

## E. Dữ liệu và đối soát

| Mã | Tình huống | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| U7-R1 | Đếm dòng sau khi nạp | Số dòng nguồn và đích khớp; sai lệch có lý do | Chờ dữ liệu thật |
| U7-R2 | Ngoại lệ ánh xạ | Dòng không khớp nằm trong danh sách ngoại lệ, không nạp | Chờ dữ liệu thật |
| U7-R3 | Bản xuất sổ thật chạy kiểm tra toàn vẹn | ĐẠT trước khi bật ứng dụng | Chờ dữ liệu thật |

## Điều kiện để một ca được coi là đạt

- Ca chạy trên tài khoản đăng nhập Workspace riêng cho từng vai trò, không dùng chung tài khoản.
- Kiểm tra quyền bằng đồng bộ ứng dụng, không chỉ bằng việc ẩn nút trên màn hình.
- Ghi lại người thực hiện, ngày giờ và kết quả trong bằng chứng nghiệm thu.

---

## Tổng quan trạng thái (cập nhật 2026-11-08)

| Nhóm | Số ca | Đạt | Chờ AppSheet |
|---|---|---|---|
| A. Toàn vẹn sổ | 11 | 11 ✅ | 0 |
| B. Phân quyền và truy cập | 10 | 0 | 10 |
| C. Quy trình tiến độ và hoàn thành | 6 | 0 | 6 |
| D. Thông báo và nhật ký | 4 | 0 | 4 |
| E. Dữ liệu và đối soát | 3 | 0 | 3 (chờ dữ liệu thật) |
| **Tổng** | **34** | **11** | **23** |

**Tài liệu liên quan:**
- [u2-appsheet-setup-guide.md](./u2-appsheet-setup-guide.md) — hướng dẫn thiết lập sổ và AppSheet U2
- [u3-views-actions-spec.md](./u3-views-actions-spec.md) — đặc tả màn hình, form và hành động nghiệp vụ công việc/khách hàng
- [u4-progress-approval-spec.md](./u4-progress-approval-spec.md) — đặc tả quy trình nộp/duyệt tiến độ và tự động hoàn thành R8
- [u5-dashboard-kpi-spec.md](./u5-dashboard-kpi-spec.md) — đặc tả Dashboard, Slices và KPI blocks theo vai trò (R15)
- [u6-notification-audit-spec.md](./u6-notification-audit-spec.md) — đặc tả thông báo in-app và nhật ký kiểm toán (R11, R12)
- [u3-u6-implementation-summary.md](./u3-u6-implementation-summary.md) — bảng ma trận cấu hình tổng hợp Views, Slices, Forms, Actions và Bots
- [role-permission-matrix.md](./role-permission-matrix.md) — ma trận vai trò và quyền, biểu thức R15–R17
- [operations-runbook.md](./operations-runbook.md) — sổ tay vận hành, vòng đời tài khoản, sao lưu, báo cáo sự cố
- [data-dictionary.md](./data-dictionary.md) — từ điển dữ liệu các tab
