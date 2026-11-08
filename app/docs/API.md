# QLCV_CBTD — Giao diện API

Một endpoint: `POST <API_URL>` (Apps Script Web App), `Content-Type: text/plain;charset=utf-8` (tránh CORS preflight).

Yêu cầu:
```json
{ "action": "task.create", "idToken": "<Google ID token>", "params": { }, "requestId": "web-1731000000-ab12cd" }
```
Thành công: `{ "ok": true, "data": ..., "meta": { ... } }`. Lỗi: `{ "ok": false, "error": { "code": "VALIDATION", "message": "...", "details": { "field": "msg" } } }`.

`requestId` bắt buộc với action ghi (cột "Ghi"); gửi lại cùng `requestId` không tạo bản ghi trùng. `GET` trả trạng thái sức khỏe.

## Mã lỗi
`UNAUTHENTICATED` (token sai/hết hạn, người dùng không hoạt động), `FORBIDDEN`, `NOT_FOUND`, `VALIDATION` (có `details` theo trường), `CONFLICT`, `SELF_REVIEW`, `BUSY` (đang bị khóa, thử lại), `TOO_MANY_REQUESTS`, `NOT_ENABLED`, `INTERNAL`.

## Ma trận quyền (từ dữ liệu RolePermissions)
| Quyền | Admin | BGD | KSV | CBTD |
|---|:-:|:-:|:-:|:-:|
| task.view, task.update*, task.start, customer.view, dashboard.view, notification.view | ✓ | ✓ | ✓ | ✓ (task.update: không) |
| task.create | ✓ | ✓ | ✓ | ✓ (chỉ làm người chính) |
| task.transfer | ✓ | giám đốc | ✓ | – |
| customer.maintain | ✓ | – | ✓ | – |
| customer.delete (lưu trữ) | ✓ | – | – | – |
| progress.submit | ✓ | ✓ | ✓ | ✓ |
| progress.review | ✓ | – | ✓ | – |
| audit.view, user.manage | ✓ | – | – | – |
| dashboard.view_director | ✓ | giám đốc | – | – |

\* Ma trận chính xác luôn theo `RolePermissions`; bảng trên phản ánh dữ liệu mẫu hiện tại. CBTD chỉ thấy dữ liệu thuộc phân công hiệu lực của mình.

## Danh sách action
| Action | Ghi | Quyền | Tham số chính |
|---|:-:|---|---|
| system.health | | không cần đăng nhập | – |
| auth.me | | đăng nhập | – (trả user, role, perms) |
| dashboard.get | | dashboard.view | – |
| dashboard.director | | dashboard.view_director | – |
| task.list | | task.view | q, status, priority, customerId, mine, overdue, includeArchived, sortBy, page, pageSize |
| task.get | | task.view | taskId |
| task.create | ✓ | task.create | customerId, title, description, priority, dueAt (YYYY-MM-DD), primaryUserId, collaboratorUserId |
| task.update | ✓ | task.update | taskId, title, description, priority, dueAt, status (not_started/in_progress) |
| task.start | ✓ | task.start | taskId |
| task.transfer | ✓ | task.transfer | taskId, newPrimaryUserId |
| task.setCollaborator | ✓ | task.update | taskId, collaboratorUserId |
| task.archive | ✓ | task.update | taskId, archived |
| progress.submit | ✓ | progress.submit | taskId, progressPct (0–100), narrative |
| progress.review | ✓ | progress.review | updateId, decision (approve/reject), comment (bắt buộc khi reject) |
| progress.pending | | progress.review | page, pageSize |
| customer.list | | customer.view | q, type, status, includeArchived, page, pageSize |
| customer.get | | customer.view | customerId |
| customer.create | ✓ | customer.maintain | name, type, phone, status, companyRepresentative (chỉ doanh nghiệp), customerCode |
| customer.update | ✓ | customer.maintain | customerId + các trường cần đổi |
| customer.archive | ✓ | customer.delete | customerId, archived |
| notification.list | | notification.view | unreadOnly, page, pageSize |
| notification.count | | notification.view | – |
| notification.markRead | ✓ | notification.view | ids (mảng, tối đa 100) |
| notification.markAllRead | ✓ | notification.view | – |
| user.options | | đăng nhập | roleCode (danh sách chọn người thực hiện) |
| user.list | | user.manage | q, roleId, status, page, pageSize |
| user.create | ✓ | user.manage | email, employeeCode, fullName, roleId, orgUnit |
| user.update | ✓ | user.manage | userId, fullName, orgUnit, employeeCode, roleId, status |
| audit.list | | audit.view | actorUserId, action, entityId, from, to, page, pageSize |
| admin.integrity | | user.manage | – |
| admin.reconcile | ✓ | user.manage | – |
| admin.backup | ✓ | user.manage | – |
| admin.restore | ✓ | user.manage | chưa bật → `NOT_ENABLED` |

Phân trang: `{ items, meta: { page, pageSize, total } }`, `pageSize` mặc định 20, tối đa 100.
Tên tham số chính xác theo mã nguồn trong `backend/src/4x_Svc_*.js`; bộ kiểm thử `tests/api.test.js` là ví dụ chạy được cho từng luồng.
