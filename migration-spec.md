# Tài liệu thiết kế hệ thống và đặc tả migration

## 1. Mục tiêu và phạm vi

Tài liệu này tổng hợp hiện trạng ứng dụng trong `backend/` và `frontend/src/`, sau đó đề xuất mô hình dữ liệu và các luồng backend tối thiểu để thay prototype bằng hệ thống có lưu trữ bền vững.

- **Đã xác minh trong mã nguồn:** API Express hiện cung cấp đăng nhập mẫu, đọc danh sách khách hàng và CRUD công việc; dữ liệu được lưu trong các biến mảng trong bộ nhớ.
- **Đề xuất thiết kế:** các bảng, khóa ngoại, xác thực/phân quyền, audit và thông báo ở phần dưới là thiết kế cho giai đoạn migration, không phải tính năng đã có.
- **Ngoài phạm vi:** chọn hệ quản trị cơ sở dữ liệu, thiết kế chi tiết các khoản vay/hồ sơ tín dụng, tích hợp dịch vụ email/SMS và chính sách lưu trữ hồ sơ. Chưa có căn cứ trong các thư mục được rà soát để quyết định các nội dung này.
- Không rà soát `node_modules/`, `frontend/dist/` hoặc thư mục `legacy/`; đây không phải mã nguồn ứng dụng hiện hành thuộc phạm vi yêu cầu.

## 2. Hiện trạng được xác minh

> **Lưu ý (2026-10-13):** prototype `backend/` và `frontend/` đã được lưu trữ tại [archive/prototype-2026-10-13](archive/prototype-2026-10-13/README.md) và không còn trong thư mục gốc. Các liên kết `./backend/...` và `./frontend/...` trong bảng dưới đây không còn hoạt động; nội dung mô tả vẫn đúng với bản lưu trữ.

| Khu vực | Hiện trạng |
|---|---|
| Backend | Express khởi tạo tại [`backend/server.js`](./backend/server.js); mount `/api/tasks`, `/api/customers`, `/api/auth`. Không thấy lớp kết nối DB, model/migration DB hoặc cấu hình ORM trong mã ứng dụng đã rà soát. |
| Đăng nhập | [`backend/controllers/authController.js`](./backend/controllers/authController.js) so khớp email/mật khẩu cố định và trả token mẫu; đây không phải xác thực production. |
| Công việc | [`backend/controllers/taskController.js`](./backend/controllers/taskController.js) dùng mảng trong bộ nhớ; hỗ trợ list/create/update/delete. |
| Khách hàng | [`backend/controllers/customerController.js`](./backend/controllers/customerController.js) dùng mảng mẫu trong bộ nhớ và chỉ hỗ trợ đọc danh sách. |
| Giao diện | [`frontend/src/services/mockApi.js`](./frontend/src/services/mockApi.js) chứa fixture người dùng, thống kê, công việc và khách hàng. [`frontend/src/services/api.js`](./frontend/src/services/api.js) có client cho login, CRUD task và đọc khách hàng. |
| Tích hợp UI | [`frontend/src/App.jsx`](./frontend/src/App.jsx) chọn chế độ mock/live theo khả năng gọi backend; trang công việc có nhánh gọi API thật. Dashboard vẫn đọc mock; trang khách hàng cũng đọc `mockApi`, dù backend có endpoint GET khách hàng. |
| Bảo mật và vận hành | Route hiện tại không gắn middleware xác thực/phân quyền; không thấy luồng ghi audit log hoặc gửi thông báo. Việc frontend lưu/đính kèm token không thay thế kiểm tra token ở backend. |

### 2.1 API đang có

| Phương thức | Endpoint | Hành vi hiện tại | Nguồn |
|---|---|---|---|
| `POST` | `/api/auth/login` | Đăng nhập mẫu; trả user và token cố định khi khớp thông tin hard-coded. | [`backend/routes/authRoutes.js`](./backend/routes/authRoutes.js), [`backend/controllers/authController.js`](./backend/controllers/authController.js) |
| `GET` | `/api/tasks` | Trả danh sách task trong bộ nhớ. | [`backend/routes/taskRoutes.js`](./backend/routes/taskRoutes.js), [`backend/controllers/taskController.js`](./backend/controllers/taskController.js) |
| `POST` | `/api/tasks` | Thêm task vào mảng; mặc định status `pending`. | Như trên |
| `PUT` | `/api/tasks/:id` | Gộp request body vào task; trả `404` nếu không tìm thấy. | Như trên |
| `DELETE` | `/api/tasks/:id` | Lọc task khỏi mảng; hiện vẫn trả thành công nếu ID không tồn tại. | Như trên |
| `GET` | `/api/customers` | Trả danh sách khách hàng mẫu trong bộ nhớ. | [`backend/routes/customerRoutes.js`](./backend/routes/customerRoutes.js), [`backend/controllers/customerController.js`](./backend/controllers/customerController.js) |
| `GET` | `/` | Trả thông báo server đang chạy. | [`backend/server.js`](./backend/server.js) |

Không có endpoint khách hàng create/update/delete, endpoint thống kê dashboard, API quản trị user/role, hoặc endpoint thông báo trong backend hiện tại.

## 3. Mô hình dữ liệu đề xuất

Kiểu dữ liệu dưới đây mang tính trung lập với hệ quản trị DB. Chuyển các kiểu như `UUID`, `JSON`, `TIMESTAMP` sang kiểu tương ứng của DB được chọn. `PK`, `FK`, `UNIQUE` và `NOT NULL` biểu thị ràng buộc đề xuất. Ngoại trừ các trường ghi rõ “hiện có”, phần lớn trường là đề xuất nhằm hỗ trợ lưu trữ bền vững, quản trị và kiểm soát.

### 3.1 Bảng lõi

#### `Users` — người dùng hệ thống

| Trường | Kiểu đề xuất | Ràng buộc | Căn cứ / mục đích |
|---|---|---|---|
| `id` | UUID hoặc BIGINT | PK | Định danh ổn định; thay ID mẫu cố định. |
| `employee_code` | VARCHAR(50) | UNIQUE, NULL nếu chưa có mã | Mã cán bộ; hiện task đang lưu assignee dạng chuỗi như `CB01`, `CB02`. Cần xác nhận quy ước mã thực tế. |
| `full_name` | VARCHAR(200) | NOT NULL | Tên người dùng; đang có trong dữ liệu mock và phản hồi login mẫu. |
| `email` | VARCHAR(254) | UNIQUE, NOT NULL | Địa chỉ đăng nhập; đang có trong dữ liệu user/login mẫu. |
| `password_hash` | VARCHAR(255) | NOT NULL | Chỉ lưu hash mật khẩu; tuyệt đối không lưu mật khẩu thuần. Đây là trường cần cho thiết kế production, chưa tồn tại trong prototype. |
| `role_id` | UUID hoặc BIGINT | FK → `Roles.id` | Vai trò đơn hiện được thể hiện bằng chuỗi `role` trong mock user. |
| `status` | VARCHAR(20) | NOT NULL, mặc định `active` | Quản lý tài khoản hoạt động/khóa; đề xuất. |
| `avatar_url` | VARCHAR(500) | NULL | Tùy chọn nếu cần ảnh đại diện; giao diện hiện chỉ dùng ký tự avatar mẫu. |
| `last_login_at` | TIMESTAMP | NULL | Theo dõi lần đăng nhập gần nhất; đề xuất. |
| `created_at`, `updated_at` | TIMESTAMP | NOT NULL | Thời điểm tạo/cập nhật; đề xuất. |

#### `Roles` — vai trò

| Trường | Kiểu đề xuất | Ràng buộc | Mục đích |
|---|---|---|---|
| `id` | UUID hoặc BIGINT | PK | Định danh vai trò. |
| `code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã ổn định, ví dụ `ADMIN`; tên vai trò thực tế cần được nghiệp vụ xác nhận. |
| `name` | VARCHAR(100) | NOT NULL | Tên hiển thị. |
| `description` | VARCHAR(500) | NULL | Mô tả phạm vi vai trò. |
| `created_at`, `updated_at` | TIMESTAMP | NOT NULL | Thời điểm tạo/cập nhật. |

#### `Permissions` — quyền thao tác

| Trường | Kiểu đề xuất | Ràng buộc | Mục đích |
|---|---|---|---|
| `id` | UUID hoặc BIGINT | PK | Định danh quyền. |
| `code` | VARCHAR(100) | UNIQUE, NOT NULL | Mã quyền, ví dụ `tasks.read`, `tasks.create`, `customers.read`; danh mục phải được chốt theo nghiệp vụ. |
| `name` | VARCHAR(150) | NOT NULL | Tên hiển thị của quyền. |
| `description` | VARCHAR(500) | NULL | Diễn giải quyền. |

#### `RolePermissions` — ánh xạ vai trò và quyền

| Trường | Kiểu đề xuất | Ràng buộc | Mục đích |
|---|---|---|---|
| `role_id` | UUID hoặc BIGINT | PK, FK → `Roles.id` | Vai trò. |
| `permission_id` | UUID hoặc BIGINT | PK, FK → `Permissions.id` | Quyền được cấp cho vai trò. |
| `created_at` | TIMESTAMP | NOT NULL | Thời điểm cấp quyền. |

`Users.role_id` thể hiện mô hình một vai trò/người dùng, phù hợp với dữ liệu hiện có. Nếu nghiệp vụ xác nhận một người có nhiều vai trò, thay bằng bảng nối `UserRoles(user_id, role_id, created_at)`; không tạo đồng thời hai cách gán vai trò nếu chưa có yêu cầu.

#### `Customers` — khách hàng

| Trường | Kiểu đề xuất | Ràng buộc | Căn cứ / mục đích |
|---|---|---|---|
| `id` | UUID hoặc BIGINT | PK | Khóa nội bộ ổn định. |
| `customer_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã khách hàng; hiện có ID dạng `C001` trong backend, `KH001` trong mock, cần quy định cách chuẩn hóa. |
| `name` | VARCHAR(250) | NOT NULL | Tên cá nhân/doanh nghiệp; hiện có. |
| `type` | VARCHAR(30) | NOT NULL | Loại khách hàng; hiện có giá trị mẫu cá nhân/doanh nghiệp. Nên chuẩn hóa thành tập giá trị do nghiệp vụ duyệt. |
| `phone` | VARCHAR(30) | NULL | Số điện thoại; hiện có. Không dùng kiểu số vì có thể có mã quốc gia/ký tự định dạng. |
| `status` | VARCHAR(30) | NULL | Trạng thái khách hàng; backend mẫu hiện có `active`/`warning`, UI mock không thể hiện trường này. |
| `loan_amount` | DECIMAL(18,2) | NULL | Dư nợ/khoản vay hiển thị trong dữ liệu backend mẫu; cần xác nhận ý nghĩa nghiệp vụ, tiền tệ và thời điểm ghi nhận trước khi đưa vào DB. |
| `created_at`, `updated_at` | TIMESTAMP | NOT NULL | Thời điểm tạo/cập nhật; đề xuất. |

Không có căn cứ hiện tại để đặc tả chi tiết hồ sơ khoản vay, tài sản bảo đảm hoặc lịch sử dư nợ thành các bảng riêng. Chỉ bổ sung các bảng này khi yêu cầu nghiệp vụ và nguồn dữ liệu được xác nhận.

#### `Tasks` — công việc

| Trường | Kiểu đề xuất | Ràng buộc | Căn cứ / mục đích |
|---|---|---|---|
| `id` | UUID hoặc BIGINT | PK | Khóa nội bộ ổn định. |
| `task_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã hiển thị; hiện có ID dạng `T001`/`CV001`, hai nguồn mẫu chưa thống nhất. |
| `title` | VARCHAR(300) | NOT NULL | Tiêu đề; hiện có. |
| `description` | TEXT | NULL | Nội dung chi tiết; đề xuất vì hiện dữ liệu task chỉ có tiêu đề. |
| `status` | VARCHAR(30) | NOT NULL | Hiện có `pending`, `in-progress`, `completed` và nhãn tiếng Việt ở mock; cần một bộ mã chuẩn, không lưu nhãn giao diện. |
| `priority` | VARCHAR(20) | NOT NULL | Hiện có `high`, `medium`, `low` và nhãn mẫu khác; chuẩn hóa thành mã. |
| `assignee_user_id` | UUID hoặc BIGINT | FK → `Users.id`, NULL nếu chưa giao | Thay chuỗi cán bộ trong `assignee`; cho phép liên kết task với user. |
| `customer_id` | UUID hoặc BIGINT | FK → `Customers.id`, NULL | Liên kết khách hàng liên quan nếu có; tiêu đề mẫu có nhắc khách hàng nhưng chưa có trường liên kết. |
| `due_at` | DATE hoặc TIMESTAMP | NULL | Thời hạn; backend dùng `dueDate`, mock dùng `deadline`; xác nhận có cần giờ hay chỉ ngày. |
| `created_by_user_id` | UUID hoặc BIGINT | FK → `Users.id`, NULL | Người tạo task; hiện chưa được lưu, đề xuất cho truy vết. |
| `completed_at` | TIMESTAMP | NULL | Thời điểm hoàn thành; đề xuất để báo cáo tiến độ. |
| `created_at`, `updated_at` | TIMESTAMP | NOT NULL | Thời điểm tạo/cập nhật; đề xuất. |

> **Cập nhật cho pilot AppSheet (2026-10-13):** cột `assignee_user_id` ở trên được thay bằng tab `TaskAssignees` (một CBTD chính và tối đa một CBTD phối hợp), theo KTD3 của [plan AppSheet](docs/plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md). Hai tab bổ sung dưới đây. Từ điển đầy đủ nằm ở [docs/appsheet/data-dictionary.md](docs/appsheet/data-dictionary.md).

#### `TaskAssignees` — phân công công việc (bổ sung cho pilot)

| Trường | Kiểu đề xuất | Ràng buộc | Mục đích |
|---|---|---|---|
| `assignment_id` | VARCHAR(50) | PK | Khóa ổn định của dòng phân công. |
| `task_id` | VARCHAR(50) | FK → `Tasks`, NOT NULL | Công việc được phân công. |
| `user_id` | VARCHAR(50) | FK → `Users`, NOT NULL | CBTD được phân công. |
| `assignee_email_snapshot` | VARCHAR(255) | NOT NULL | Email tại thời điểm phân công, để truy xuất sau khi xóa người dùng. |
| `assignment_role` | VARCHAR(20) | NOT NULL | `primary` hoặc `collaborator`. |
| `assigned_at` | TIMESTAMP | NOT NULL | Thời điểm phân công. |
| `active` | BOOLEAN | NOT NULL | Gỡ phân công đặt `FALSE`, không xóa dòng. |

Quy tắc: mỗi công việc có đúng một người chính đang hoạt động và tối đa một người phối hợp đang hoạt động.

#### `TaskUpdates` — cập nhật tiến độ (bổ sung cho pilot)

| Trường | Kiểu đề xuất | Ràng buộc | Mục đích |
|---|---|---|---|
| `update_id` | VARCHAR(50) | PK | Khóa ổn định. |
| `task_id` | VARCHAR(50) | FK → `Tasks`, NOT NULL | Công việc được báo cáo. |
| `progress_pct` | SMALLINT | NOT NULL, 0–100 | Tiến độ lũy kế. |
| `narrative` | TEXT | NOT NULL | Nội dung diễn giải. |
| `submitted_by_user_id`, `submitted_by_email_snapshot`, `submitted_at` | — | NOT NULL | Người gửi và thời điểm gửi. |
| `review_status` | VARCHAR(20) | NOT NULL | `pending`, `approved` hoặc `rejected`. Báo cáo bị từ chối vẫn được giữ. |
| `reviewed_by_user_id`, `reviewed_by_email_snapshot`, `reviewed_at` | — | NULL khi `pending` | Người duyệt và thời điểm duyệt. |
| `review_comment` | TEXT | NULL | Lý do từ chối hoặc ghi chú duyệt. |

Chỉ thêm dòng mới; gửi lại sau khi bị từ chối là một dòng mới. Duyệt 100% sẽ chuyển công việc sang `completed` (R8).

#### `Notifications` — thông báo

Đây là bảng **đề xuất nếu cần triển khai gửi thông báo**; hiện không có chức năng gửi hoặc endpoint thông báo.

| Trường | Kiểu đề xuất | Ràng buộc | Mục đích |
|---|---|---|---|
| `id` | UUID hoặc BIGINT | PK | Định danh thông báo. |
| `recipient_user_id` | UUID hoặc BIGINT | FK → `Users.id`, NOT NULL | Người nhận. |
| `task_id` | UUID hoặc BIGINT | FK → `Tasks.id`, NULL | Task liên quan, nếu có. |
| `channel` | VARCHAR(20) | NOT NULL | Kênh như `in_app`, `email`, `sms`; chỉ bật kênh đã được phê duyệt/cấu hình. |
| `title` | VARCHAR(200) | NOT NULL | Tiêu đề. |
| `body` | TEXT | NOT NULL | Nội dung. |
| `status` | VARCHAR(20) | NOT NULL | Trạng thái xử lý, ví dụ `queued`, `sent`, `failed`, `read`. |
| `created_at` | TIMESTAMP | NOT NULL | Thời điểm tạo. |
| `sent_at`, `read_at` | TIMESTAMP | NULL | Thời điểm gửi/đọc. |
| `provider_message_id` | VARCHAR(200) | NULL | Mã từ nhà cung cấp nếu dùng email/SMS. |

#### `AuditLogs` — nhật ký kiểm toán

Đây là bảng **đề xuất** để ghi nhận thao tác cần truy vết; hiện backend không ghi audit log.

| Trường | Kiểu đề xuất | Ràng buộc | Mục đích |
|---|---|---|---|
| `id` | UUID hoặc BIGINT | PK | Định danh sự kiện. |
| `actor_user_id` | UUID hoặc BIGINT | FK → `Users.id`, NULL cho tác vụ hệ thống | Người thực hiện. |
| `action` | VARCHAR(100) | NOT NULL | Mã thao tác, ví dụ `task.created`, `task.updated`, `customer.read`. |
| `entity_type` | VARCHAR(50) | NOT NULL | Loại đối tượng. |
| `entity_id` | VARCHAR(100) | NULL | ID đối tượng để hỗ trợ nhiều loại khóa. |
| `before_data`, `after_data` | JSON | NULL | Dữ liệu trước/sau đã loại trừ thông tin nhạy cảm. |
| `request_id` | VARCHAR(100) | NULL | Liên kết các log của cùng request. |
| `created_at` | TIMESTAMP | NOT NULL | Thời điểm phát sinh. |

Không ghi mật khẩu, token, khóa bí mật hoặc toàn bộ dữ liệu nhạy cảm của khách hàng vào log.

### 3.2 Quan hệ chính

- `Roles` 1—N `Users`.
- `Roles` N—N `Permissions` qua `RolePermissions`.
- `Users` 1—N `Tasks` qua `assignee_user_id`; một user có thể tạo nhiều task qua `created_by_user_id`.
- `Customers` 1—N `Tasks` tùy chọn qua `customer_id`.
- `Users` 1—N `Notifications` qua `recipient_user_id`.
- `Users` 1—N `AuditLogs` qua `actor_user_id`.

### 3.3 Chỉ mục và ràng buộc cần xem xét

- Unique: `Users.email`, `Users.employee_code` (nếu mã bắt buộc), `Customers.customer_code`, `Tasks.task_code`, `Roles.code`, `Permissions.code`.
- FK có kiểm soát: không xóa cứng user/customer/task đang được tham chiếu nếu cần giữ lịch sử; cân nhắc soft delete hoặc trạng thái vô hiệu hóa theo chính sách lưu trữ.
- Index tra cứu: `Tasks(status, due_at)`, `Tasks(assignee_user_id, status)`, `Tasks(customer_id)`, `Notifications(recipient_user_id, status, created_at)`, `AuditLogs(entity_type, entity_id, created_at)`.
- Chuẩn hóa thời gian lưu theo UTC ở tầng dữ liệu; cách hiển thị múi giờ cần thống nhất với ứng dụng.
- Giá trị enum và quy tắc xóa/lưu lịch sử phải được nghiệp vụ phê duyệt trước khi áp dụng migration.

## 4. Luồng logic backend

### 4.1 Luồng đang tồn tại

1. **Khởi động API:** Express nạp biến môi trường, bật CORS và JSON body parser, mount router ở `/api/tasks`, `/api/customers`, `/api/auth`.
2. **Đăng nhập mẫu:** client gửi email/mật khẩu tới `POST /api/auth/login`; controller so sánh với thông tin cố định và trả token mẫu hoặc `401`. Token này không phải JWT/session được backend xác minh.
3. **Đọc công việc:** `GET /api/tasks` trả nguyên mảng task hiện tại.
4. **Tạo công việc:** `POST /api/tasks` thêm object từ body vào mảng, gán ID dựa trên độ dài mảng và mặc định status. Chưa có validate/schema hoặc kiểm tra quyền.
5. **Cập nhật công việc:** `PUT /api/tasks/:id` tìm ID, gộp body vào object hiện tại; không có kết quả thì trả `404`.
6. **Xóa công việc:** `DELETE /api/tasks/:id` lọc mảng; hiện không phân biệt ID không tồn tại với xóa thành công.
7. **Đọc khách hàng:** `GET /api/customers` trả nguyên mảng mẫu; chưa có các thao tác ghi khách hàng.

Các luồng này không bền vững: khởi động lại backend sẽ mất các thay đổi runtime. Tạo mã theo độ dài mảng cũng không đảm bảo duy nhất khi có xóa hoặc nhiều request đồng thời; migration không nên giữ cách sinh mã này.

### 4.2 Luồng đề xuất sau migration

#### Xác thực

1. Nhận email/mật khẩu, validate đầu vào và tìm user đang hoạt động.
2. So sánh mật khẩu với hash bằng thư viện phù hợp; không hard-code credential.
3. Phát hành token/session có hạn sử dụng và cơ chế thu hồi phù hợp với lựa chọn bảo mật.
4. Middleware backend xác minh token ở mọi route cần đăng nhập; không dựa vào token do frontend tự lưu.
5. Trả thông tin user tối thiểu; không trả `password_hash`.

#### Phân quyền

1. Middleware xác thực xác lập `actor_user_id`.
2. Middleware authorization kiểm tra permission code tương ứng thao tác (ví dụ quyền đọc/tạo/cập nhật/xóa task).
3. Kiểm tra phạm vi dữ liệu riêng theo nghiệp vụ, ví dụ user chỉ thấy task được giao hay quản lý được xem toàn đơn vị; phạm vi này chưa được xác định trong mã hiện tại.
4. Trả `401` khi chưa xác thực, `403` khi không đủ quyền; ghi audit các thao tác nhạy cảm.
5. Giao diện có thể ẩn thao tác không phù hợp vai trò, nhưng backend vẫn là nơi thực thi kiểm soát quyền.

#### CRUD task/customer

1. Validate payload và chuẩn hóa status/priority trước khi gọi tầng nghiệp vụ.
2. Kiểm tra quyền và quan hệ FK (người nhận việc, khách hàng liên quan).
3. Ghi DB bằng transaction, sinh ID ổn định từ DB/UUID; không dùng độ dài mảng.
4. Trả mã HTTP nhất quán: `201` khi tạo, `200` khi đọc/cập nhật/xóa theo quy ước API, `404` khi không tồn tại, `400/422` khi dữ liệu không hợp lệ.
5. Ghi audit cho thay đổi; không coi xóa không tồn tại là thành công trừ khi API chủ đích áp dụng idempotent delete.
6. Khách hàng hiện chỉ có GET. Trước khi bổ sung create/update/delete phải chốt quyền và quy trình duyệt/sửa dữ liệu khách hàng.

#### Gửi thông báo (đề xuất, chưa có trong mã)

1. Khi một sự kiện nghiệp vụ đã commit, tạo bản ghi `Notifications` ở trạng thái `queued` trong cùng transaction hoặc transactional outbox.
2. Worker gửi qua kênh được cấu hình; cập nhật `sent`/`failed`, thời điểm gửi và mã nhà cung cấp.
3. Retry có giới hạn và idempotency để tránh gửi trùng; lỗi gửi không được làm sai trạng thái giao dịch nghiệp vụ đã commit.
4. Với thông báo trong ứng dụng, hỗ trợ đọc/chưa đọc; với email/SMS cần phê duyệt nội dung, người nhận và nhà cung cấp riêng.

## 5. Đối chiếu dữ liệu và các điểm cần chốt

| Khác biệt / thiếu hụt | Bằng chứng | Việc cần làm trước khi migration |
|---|---|---|
| Mã khách hàng khác nhau (`C001` và `KH001`) | Backend controller và `mockApi.js` | Chốt nguồn mã chuẩn; lập mapping có kiểm tra trùng, không tự ghép hồ sơ chỉ theo tên/số điện thoại. |
| Mã task khác nhau (`T001` và `CV001`) | Backend controller và `mockApi.js` | Chốt định dạng mã hiển thị và quy tắc sinh mã; giữ khóa nội bộ riêng. |
| Tên trường hạn chót khác (`dueDate`, `deadline`) | Backend controller, `mockApi.js`, `Tasks.jsx` | Chuẩn hóa thành `due_at`; xác nhận kiểu ngày hay ngày-giờ và chuyển đổi timezone. |
| Trạng thái/ưu tiên khác tiếng Anh/tiếng Việt | Backend controller và `Tasks.jsx` | Tạo bảng mapping được nghiệp vụ xác nhận; lưu mã chuẩn, chỉ dịch nhãn tại UI. |
| Assignee là chuỗi mã cán bộ | Backend controller | Đối chiếu với danh mục user/employee; các mã không ghép được phải đưa vào báo cáo ngoại lệ, không tự tạo user. |
| Dữ liệu khách hàng có trường không đồng nhất | Backend có `status`, `loanAmount`; mock chủ yếu có `id`, `name`, `type`, `phone` | Xác nhận ý nghĩa `loan_amount`, đơn vị tiền, thời điểm chụp và nguồn dữ liệu có thẩm quyền. |
| UI chỉ kết nối một phần với API thật | `App.jsx`, `Dashboard.jsx`, `Customers.jsx`, `Tasks.jsx` | Chốt endpoint/response contract rồi chuyển dashboard/customer sang API thật; không xem dữ liệu fixture là dữ liệu production. |
| Không có user directory/quyền/audit/thông báo backend | Các route/controller hiện tại | Chốt role, quyền theo chức năng/phạm vi, sự kiện audit, kênh thông báo và yêu cầu lưu trữ. |

## 6. Kế hoạch triển khai và tiêu chí nghiệm thu

Các vai trò/ngày dưới đây chưa có trong nguồn; cần phân công và ấn định trước khi triển khai. Không coi migration hoàn tất chỉ vì API trả thành công.

| Mục tiêu | KPI / tiêu chí đo được | Người chịu trách nhiệm | Hành động / deadline | Bằng chứng | Kiểm tra | Đánh giá |
|---|---|---|---|---|---|---|
| Chốt mô hình dữ liệu và mã mapping | 100% trường và enum có chủ sở hữu nghiệp vụ; 0 mã trùng sau mapping; mọi ngoại lệ được liệt kê | Chủ nghiệp vụ + BA + DBA (cần phân công) | Xác nhận bảng ở mục 3 và mapping ở mục 5; deadline TBD | Biên bản duyệt schema, mapping file và danh sách ngoại lệ | Kiểm tra PK/FK/unique, số lượng bản ghi và đối chiếu mẫu với nguồn | Chưa đạt nếu còn quy tắc/mapping chưa được duyệt |
| Xây nền dữ liệu bền vững | 100% CRUD API dùng persistence; restart không làm mất thay đổi đã commit | Backend + DBA (cần phân công) | Chọn DB, viết migration/repository và chuyển endpoint; deadline TBD | Migration scripts, test integration, log triển khai | Tạo/đọc/cập nhật/xóa, rollback/backup-restore theo môi trường | Đạt khi test lưu bền vững và ràng buộc DB đều qua |
| Áp dụng xác thực và phân quyền | 100% route được phân loại public/authenticated; test 401/403 cho từng permission | Backend + Security/IT (cần phân công) | Bỏ credential/token mẫu, thêm middleware; deadline TBD | Ma trận quyền, test API và cấu hình môi trường | Kiểm thử user đủ quyền/thiếu quyền/không đăng nhập | Không phát hành nếu có route nhạy cảm chưa được kiểm soát |
| Triển khai audit và thông báo nếu được duyệt | 100% thao tác cần audit có log; thông báo không gửi trùng trong test retry | Backend + vận hành/đơn vị thông báo (cần phân công) | Chốt sự kiện/kênh rồi triển khai outbox/worker; deadline TBD | Audit sample, trạng thái outbox, kết quả test retry | Đối chiếu sự kiện DB-log; mô phỏng provider lỗi và retry | Chỉ đánh giá phần thông báo nếu nghiệp vụ duyệt phạm vi |
| Chuyển giao UI sang API thống nhất | Dashboard/customer/task đọc từ API theo contract; không rò rỉ fixture trong chế độ production | Frontend + Backend (cần phân công) | Cập nhật service/API và trang tương ứng; deadline TBD | Test UI/API, response contract | So sánh dữ liệu hiển thị với API; test lỗi mạng/quyền truy cập | Đạt khi luồng live không phụ thuộc mock API |

## 7. Nguồn trong workspace

- Backend server và mount route: [`backend/server.js`](./backend/server.js).
- Định nghĩa route: [`backend/routes/authRoutes.js`](./backend/routes/authRoutes.js), [`backend/routes/taskRoutes.js`](./backend/routes/taskRoutes.js), [`backend/routes/customerRoutes.js`](./backend/routes/customerRoutes.js).
- Logic controller: [`backend/controllers/authController.js`](./backend/controllers/authController.js), [`backend/controllers/taskController.js`](./backend/controllers/taskController.js), [`backend/controllers/customerController.js`](./backend/controllers/customerController.js).
- API client và fixture giao diện: [`frontend/src/services/api.js`](./frontend/src/services/api.js), [`frontend/src/services/mockApi.js`](./frontend/src/services/mockApi.js).
- Điều hướng/tích hợp chế độ API: [`frontend/src/App.jsx`](./frontend/src/App.jsx), [`frontend/src/pages/Tasks.jsx`](./frontend/src/pages/Tasks.jsx), [`frontend/src/pages/Customers.jsx`](./frontend/src/pages/Customers.jsx), [`frontend/src/pages/Dashboard.jsx`](./frontend/src/pages/Dashboard.jsx).
