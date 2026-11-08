# QLCV_CBTD — Kiến trúc hệ thống (MVP)

Phạm vi: quản lý công việc của cán bộ tín dụng (CBTD) theo bộ quy tắc R1–R17 trong kế hoạch dự án. Lựa chọn nền tảng cho nhánh này (do chủ dự án chọn 08/11/2026): **Google Apps Script API + Google Sheets + SPA**, triển khai giao diện trên **Render (static site)**. Nhánh AppSheet theo quyết định 13/10/2026 không bị thay đổi; hai nhánh dùng chung mô hình dữ liệu.

## 1. Kiến trúc tổng thể

```
Trình duyệt (SPA, ES modules)
   │  Google Identity Services → ID token
   │  POST text/plain {action, idToken, params, requestId}
   ▼
Apps Script Web App  (doPost)             ← 1 endpoint duy nhất
   Pipeline → Router (bảng ACTIONS) → Use case → Policy (RBAC + phạm vi dòng) / Repository → Store → Driver
                                                                 │
                                                       Google Sheets (10 tab)
```

- **Xác thực**: web app chạy "execute as me, access anyone"; danh tính chỉ lấy từ ID token Google, được máy chủ kiểm tra (aud = GOOGLE_CLIENT_ID, iss, email_verified, exp, tùy chọn hd = ALLOWED_DOMAIN). Email phải khớp một người dùng `active` trong tab Users. Token được cache ≤300 giây.
- **Phân quyền**: RBAC đọc từ dữ liệu `RolePermissions` (15 quyền, 4 vai trò). CBTD chỉ thấy công việc/khách hàng thuộc phân công đang hiệu lực. Giám đốc xác định qua `DIRECTOR_EMAILS` (cấp thêm `task.transfer`, `dashboard.view_director`).
- **Ghi dữ liệu**: mọi action ghi bắt buộc `requestId` (8–64 ký tự `[A-Za-z0-9_-]`), chạy trong `LockService` và xác thực lại trong khóa; `requestId` đảm bảo idempotent (gửi lại không tạo bản ghi trùng).
- **Một mã nguồn cho ba môi trường**: cùng lõi chạy trên GAS (SheetDriver), trong trình duyệt ở chế độ demo (MemoryDriver, lưu localStorage) và trong test Node. Muốn chuyển sang PostgreSQL chỉ cần thay Driver, giữ nguyên Services/Policy.

## 2. Kiến trúc theo lớp (Clean Architecture)

Lõi backend được tổ chức theo các lớp. Quy tắc phụ thuộc: **lớp ngoài gọi lớp trong, không ngược lại**.

```
Giao tiếp (80, 90)  ──►  Ứng dụng / use case (40–48)  ──►  Miền nghiệp vụ (20)
                              │                                   ▲ (thuần, không I/O)
                              ▼                                   │
                    Adapter: repository (22), presenter (23),     │
                    hoạt động & phân công (24, 25), quyền (21) ───┘
                              │
                              ▼
                    Hạ tầng: Store (02), Driver Sheet (11), Env GAS (10),
                    Google token (12), sao lưu (98), khởi tạo (95)
```

| Lớp | Tệp | Trách nhiệm | Được phụ thuộc vào |
|---|---|---|---|
| Dùng chung | `00_Namespace`, `01_Util` | Config, enum, lược đồ 10 bảng; lỗi nghiệp vụ, kiểm tra đầu vào, ngày giờ | — |
| Miền | `20_Domain` | Quy tắc thuần: trễ hạn, khóa sửa công việc, R6/R8/R10, chống tự khóa Admin, mã hiển thị | Dùng chung |
| Adapter dữ liệu | `22_Repositories` | Điểm DUY NHẤT chạm `Q.Store`; truy vấn theo nghiệp vụ (`Repo.assignments.activeForTask`…) | Store |
| Quyền | `21_Access` | Xác thực người dùng (`Q.Auth`), RBAC và phạm vi bản ghi (`Q.Policy`) | Repo, Google token |
| Adapter ra ngoài | `23_Presenters` | Bản ghi → DTO camelCase (hợp đồng API giữ nguyên) | Repo, Domain |
| Ứng dụng | `24_Activity`, `25_Assignments` | Nhật ký kiểm toán, thông báo (khử trùng lặp), phân công | Repo, Domain |
| Use case | `40–48_Svc_*` | Công việc, tiến độ, khách hàng, người dùng, dashboard, thông báo, nhật ký, toàn vẹn, bảo trì | Tất cả lớp trên |
| Giao tiếp | `80_Pipeline` | Kiểm tra request, xác thực, giới hạn tần suất, khóa khi ghi, envelope `{ok, data|error, meta}` | Use case qua bảng action |
| Composition root | `90_Router` | Bảng ACTIONS (nối tên action với use case), `doPost`/`doGet` | Mọi lớp |
| Hạ tầng | `02_Store`, `10_Env_Gas`, `11_Driver_Sheet`, `12_Google_Auth`, `95_Setup`, `98_Backup` | Lưu trữ, khóa/bộ nhớ đệm/Properties, Sheets, xác minh Google, khởi tạo, sao lưu | Dùng chung |

Các tệp được nạp theo thứ tự tên trong cả Apps Script và kiểm thử (`tests/harness.js`), nên tiền tố số giữ đúng thứ tự phụ thuộc lúc nạp. Quy tắc phụ thuộc được kiểm chứng bằng kiểm thử: `tests/characterization.test.js` chạy 140 bước qua mọi action và so khớp từng kết quả với `tests/golden/characterization.json`.

## 2a. Cấu trúc tệp

```
app/
├─ backend/
│  ├─ src/            Mã đẩy lên Apps Script (nạp theo thứ tự tên; xem bảng lớp ở mục 2)
│  │  ├─ 00_Namespace.js     Config, Enums, Schema (10 bảng)
│  │  ├─ 01_Util.js          AppError, kiểm tra dữ liệu, ngày giờ, phân trang
│  │  ├─ 02_Store.js         Lớp lưu trữ chung: chỉ mục, bất biến, append-only, sinh mã
│  │  ├─ 10_Env_Gas.js       Hạ tầng GAS: Lock, Cache, Properties, UrlFetch
│  │  ├─ 11_Driver_Sheet.js  Driver Google Sheets
│  │  ├─ 12_Google_Auth.js   Xác minh Google ID token
│  │  ├─ 20_Domain.js        Quy tắc nghiệp vụ thuần
│  │  ├─ 21_Access.js        Xác thực người dùng, RBAC, phạm vi bản ghi
│  │  ├─ 22_Repositories.js  Repository (điểm duy nhất chạm Store)
│  │  ├─ 23_Presenters.js    DTO trả về giao diện
│  │  ├─ 24_Activity.js      Nhật ký kiểm toán, thông báo
│  │  ├─ 25_Assignments.js   Phân công, người nhận thông báo duyệt
│  │  ├─ 40_Svc_Tasks.js     Use case: công việc & phân công
│  │  ├─ 41_Svc_Progress.js  Use case: tiến độ & duyệt
│  │  ├─ 42_Svc_Customers.js Use case: khách hàng
│  │  ├─ 43_Svc_Users.js     Use case: người dùng
│  │  ├─ 44_Svc_Dashboard.js Use case: bảng điều khiển, phiên làm việc
│  │  ├─ 45_Svc_Notifications.js Use case: thông báo trong ứng dụng
│  │  ├─ 46_Svc_Audit.js     Use case: tra cứu nhật ký kiểm toán
│  │  ├─ 47_Svc_Integrity.js Use case: kiểm tra toàn vẹn, vá hệ quả duyệt
│  │  ├─ 48_Svc_Maintenance.js Use case: sao lưu, khôi phục
│  │  ├─ 80_Pipeline.js      Đường xử lý request chung
│  │  ├─ 90_Router.js        Bảng ACTIONS, doPost/doGet
│  │  ├─ 95_Setup.js         Khởi tạo DB, trigger, menu QLCV
│  │  ├─ 96_Seed.js          (sinh tự động từ CSV)
│  │  ├─ 97_Bench.js         Đo hiệu năng trên Apps Script (chỉ đọc)
│  │  ├─ 98_Backup.js        Sao lưu Drive
│  │  └─ appsscript.json
│  └─ dev/Env_Memory.js   Môi trường bộ nhớ (KHÔNG đẩy lên GAS)
├─ frontend/          SPA tĩnh (index.html, config.js, css/, js/, demo/)
├─ tools/build.js     seed | demo | config
├─ tests/             node:test (api, gas-runtime với Google giả lập)
├─ docs/              ARCHITECTURE, API, DEPLOYMENT
└─ render.yaml, package.json, .env.example
```

## 3. Sơ đồ cơ sở dữ liệu (Google Sheets, 10 tab)

```mermaid
erDiagram
  Roles ||--o{ RolePermissions : has
  Permissions ||--o{ RolePermissions : grants
  Roles ||--o{ Users : assigned
  Users ||--o{ TaskAssignees : works_on
  Tasks ||--o{ TaskAssignees : has
  Customers ||--o{ Tasks : for
  Tasks ||--o{ TaskUpdates : reported
  Users ||--o{ Notifications : receives
  Users ||--o{ AuditLogs : acts
  Roles { string role_id PK
          string code
          string name
          string description }
  Permissions { string permission_id PK
                string code
                string name
                string description }
  RolePermissions { string role_id FK
                    string permission_id FK
                    string created_at }
  Users { string user_id PK
          string email
          string employee_code
          string full_name
          string role_id FK
          string org_unit
          string status
          string created_at
          string updated_at }
  Customers { string customer_id PK
              string customer_code
              string name
              string type
              string phone
              string status
              string company_representative
              string archived_at
              string created_at
              string updated_at }
  Tasks { string task_id PK
          string task_code
          string customer_id FK
          string title
          string description
          string status
          string priority
          string due_at
          string created_by_user_id FK
          string completed_at
          string archived_at
          string created_at
          string updated_at }
  TaskAssignees { string assignment_id PK
                  string task_id FK
                  string user_id FK
                  string assignee_email_snapshot
                  string assignment_role
                  string assigned_at
                  string active }
  TaskUpdates { string update_id PK
                string task_id FK
                int progress_pct
                string narrative
                string submitted_by_user_id FK
                string submitted_at
                string review_status
                string reviewed_by_user_id FK
                string reviewed_at
                string review_comment }
  Notifications { string notification_id PK
                  string recipient_user_id FK
                  string event_type
                  string source_record_id
                  string request_or_event_key
                  string message
                  string created_at
                  string read_at }
  AuditLogs { string audit_id PK
              string actor_user_id FK
              string action
              string entity_type
              string entity_id
              string request_or_event_key
              string created_at }
```

Quy ước: tiền tố mã `USR/CUS/TSK/ASG/UPD/NTF/AUD`; mọi cột là text (`@`) để Sheets không tự đổi kiểu; cột bất biến (immutable) bị Store chặn sửa; `AuditLogs` chỉ ghi thêm. Cột bổ sung ngoài 2 danh mục gốc: `company_representative`, `archived_at` (Customers), `archived_at` (Tasks), `active`, `assignee_email_snapshot`.

### Quy tắc nghiệp vụ đã hiện thực
| Mã | Nội dung | Nơi thực thi |
|---|---|---|
| R1/R3 | Vai trò, quyền theo dữ liệu; CBTD theo phạm vi phân công | `20_Auth_Policy.js` |
| R6 | CBTD chỉ tạo việc mà mình là người chính | `40_Svc_Tasks.js` |
| R7 | Tiến độ số nguyên 0–100 kèm diễn giải (≥5 ký tự) | `41_Svc_Progress.js` |
| R8 | Duyệt 100% ⇒ tự động hoàn thành; hoàn thành là trạng thái cuối | `41_Svc_Progress.js` |
| R10 | Maker–checker: không tự duyệt báo cáo của mình (`SELF_REVIEW`) | `41_Svc_Progress.js` |
| R11 | Thông báo trong ứng dụng (khóa sự kiện chống trùng) | `30_Core.js` |
| R12 | Nhật ký kiểm toán chỉ ghi thêm | `02_Store.js`, `30_Core.js` |
| R15 | Bảng điều khiển Giám đốc | `44_Svc_Dashboard.js` |
| R16 | Kiểm tra toàn vẹn, đối soát, sao lưu hằng ngày | `43_Svc_Admin.js`, `95_Setup.js` |
| R17 | Chuyển giao người chính; người đại diện chỉ cho khách doanh nghiệp | `40`, `42` |

## 4. Kiến trúc giao diện

- SPA thuần ES modules, router theo hash (`#/tasks/TSK-001`), không phụ thuộc thư viện.
- `ui.js`: hàm dựng DOM an toàn `h()` (không dùng innerHTML với dữ liệu người dùng), nhãn tiếng Việt, thành phần KPI/badge/trạng thái, `formDialog` (hiện lỗi từng ô từ API, `showIf`, `range`), `confirmDialog`, toast.
- `api.js`: `call(action, params)`; tái sử dụng `requestId` khi thử lại; chế độ demo nạp backend gói sẵn trong trình duyệt.
- `auth.js`: Google Identity Services (live) hoặc chọn người dùng mẫu (demo).
- Trang vào theo vai trò: CBTD → Công việc; KSV → Duyệt tiến độ; BGD → Bảng điều khiển; Admin → Quản trị. Menu ẩn/hiện theo quyền trả về từ `auth.me`.
- Bố cục thích ứng: bảng chuyển thành thẻ ở màn hình hẹp (đã kiểm tra 390 px, không tràn ngang). CSP khai báo trong `index.html`.

## 5. Bảo mật
- Không có bí mật phía trình duyệt; Client ID là thông tin công khai.
- Kiểm tra mọi tham số ở máy chủ (độ dài, kiểu, danh mục); giới hạn thân yêu cầu 64 KB và 240 yêu cầu/phút/người.
- Lỗi nội bộ trả mã `INTERNAL`, không lộ chi tiết; chi tiết lỗi chỉ nằm trong nhật ký của Apps Script.
- Dữ liệu thật bị chặn theo R13 cho đến khi được phê duyệt an toàn thông tin: `seedDemoData` cần `ALLOW_SEED=true` và từ chối chạy khi đã có dữ liệu.

## 6. Giới hạn đã biết và lộ trình mở rộng
- Google Sheets phù hợp quy mô nhỏ–vừa (hàng chục nghìn dòng, vài chục người dùng đồng thời); ghi tuần tự dưới khóa script nên có thể trả `BUSY` khi tải cao — giao diện cho phép thử lại với cùng `requestId`.
- Chưa kiểm thử với dịch vụ Google thật (chỉ giả lập và chế độ demo). Cần thử nghiệm UAT sau khi triển khai.
- `admin.restore` chưa bật (`NOT_ENABLED`); bản sao lưu hằng ngày có sẵn, khôi phục thực hiện thủ công.
- Giám đốc xác định bằng `DIRECTOR_EMAILS` do thông số kỹ thuật còn chờ xác nhận quyền BGD.
- Lộ trình: (1) thay `SheetDriver` bằng driver PostgreSQL/Cloud SQL, đưa Router vào Cloud Run; (2) thêm email/Chat cho thông báo; (3) tệp đính kèm bằng Drive; (4) báo cáo xuất Excel.
