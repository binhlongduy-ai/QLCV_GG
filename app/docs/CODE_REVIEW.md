# Đánh giá và tái cấu trúc mã QLCV_CBTD (app/)

Ngày: 2026-11-09. Phạm vi: `app/backend` (Apps Script + lõi chạy chung), `app/frontend` (SPA), `app/tests`, `app/tools`.
Nguyên tắc: **giữ nguyên chức năng**. Mọi thay đổi có kiểm thử đi kèm; các hành vi đáng ngờ được ghi nhận, không tự đổi.

## 1. Tóm tắt kiến trúc

```
Trình duyệt (SPA, ES modules)                       Apps Script Web App (doPost)
  auth.js  ── Google Identity Services ─► ID token
  api.js   ── POST text/plain {action, idToken, params, requestId}
                 │  (chế độ demo: cùng lõi backend chạy trong trình duyệt)
                 ▼
  90_Router.js  Q.handle: kiểm tra body → ACTIONS → xác thực (20_Auth_Policy)
                 → giới hạn tốc độ (240/phút/người) → [ghi: LockService + dựng lại ngữ cảnh]
                 ▼
  40–44_Svc_*.js  Task / Progress / Customer / Admin / Dashboard+Notification
                 │  Policy (RBAC từ RolePermissions + phạm vi CBTD), DTO, Audit, Notify
                 ▼
  02_Store.js   bộ nhớ đệm theo request, khóa chính, chỉ mục theo cột, bất biến, append-only
                 ▼
  11_Driver_Sheet.js (Google Sheets, 10 tab)   |   dev/Env_Memory.js (test Node + demo trình duyệt)
```

- Một endpoint, một bộ định tuyến, mọi lỗi nghiệp vụ trả mã có cấu trúc; lỗi nội bộ trả `INTERNAL` kèm mã tham chiếu.
- Ghi dữ liệu: bắt buộc `requestId`; chống ghi trùng bằng khóa `evt-<hành động>-<requestId>` trong `AuditLogs`.
- Phân quyền: quyền đọc từ tab `RolePermissions`; CBTD bị giới hạn theo phân công (`TaskAssignees`).
- Frontend: router theo hash, không framework; `ui.js` dựng DOM an toàn (không `innerHTML`); view theo vai trò.
- Build (`tools/build.js`): sinh `96_Seed.js`, `frontend/demo/backend.bundle.js`, `frontend/config.js`.

Luồng dữ liệu của một request đọc: nạp **toàn bộ** các tab cần dùng vào bộ nhớ đệm (mỗi request một lần), dựng chỉ mục khi cần, rồi lọc/ghép DTO trong bộ nhớ. Luồng ghi: xác thực → khóa → nạp lại dữ liệu mới nhất trong khóa → kiểm tra → ghi dòng → ghi nhật ký/thông báo → trả DTO.

## 2. Các vấn đề được phát hiện

Trạng thái: **Đã sửa** (có kiểm thử), **Đã ghi nhận** (cần quyết định hoặc nằm ngoài phạm vi refactor).

### 2.1 Rủi ro đúng đắn dữ liệu

| # | Vấn đề | Vị trí | Trạng thái |
|---|---|---|---|
| R1 | **Ghi trùng khi gửi lại biểu mẫu.** Mỗi lần bấm "Gửi" tạo `requestId` mới. Nếu lần đầu đã ghi thành công nhưng phản hồi bị mất (sau 3 lần tự thử trong `httpCall`), người dùng gửi lại sẽ tạo bản ghi thứ hai (công việc, báo cáo tiến độ, khách hàng, người dùng). Tài liệu cũ ghi "tái sử dụng requestId khi thử lại" nhưng chỉ đúng trong một lời gọi. | `frontend/js/api.js`, `ui.js` (`formDialog`) | **Đã sửa**: một `requestId` cho mỗi lần mở biểu mẫu (`ids.js`), truyền qua `onSubmit(v, {requestId})`. |
| R2 | **KPI "Người dùng hoạt động" đếm sai khi > 100 người**: trang quản trị lấy `user.list` với `pageSize: 100` và đếm trên trang đó. | `views/admin.js` | **Đã sửa**: `user.list` trả `counts` tính trên toàn bảng; trang chỉ tải 1 dòng. |
| R3 | Email Giám đốc ghi cứng trong giao diện demo, lệch với quy tắc `DIRECTOR_EMAILS` của máy chủ. | `main.js` | **Đã sửa**: `demoUsers()` tính `isDirector` theo cùng quy tắc. |
| R4 | Không nhất quán: `task.create` từ chối hạn trong quá khứ, `task.update` thì cho phép. | `40_Svc_Tasks.js` | **Đã ghi nhận** (cần quyết định nghiệp vụ; không đổi hành vi). |
| R5 | Không nhất quán "trễ hạn" khi `includeArchived=1`: lọc `overdue` của danh sách đếm cả việc đã lưu trữ, còn cờ `overdue` trong DTO thì không. | `40` (`T.list`) so với `30_Core` (`DTO.tasks`) | **Đã ghi nhận**. Đã gom hai định nghĩa thành `Q.Rules.isLate` / `Q.Rules.isOpen` và giữ nguyên hành vi. |
| R6 | `GOOGLE_CLIENT_ID` có giá trị dự phòng trong code (theo yêu cầu). Nếu quên đặt Script Property, máy chủ vẫn chấp nhận token của client mặc định. Client ID là công khai nên rủi ro thấp, nhưng lệch với quy trình trong `DEPLOYMENT.md`. | `20_Auth_Policy.js:23` | **Đã ghi nhận**. Kiểm thử đã đổi kỳ vọng: token demo bị từ chối khi tắt demo. |
| R7 | Nhật ký ứng dụng (`Env.log`) ghi email người dùng cho mọi request. Đây là dữ liệu cá nhân trong log Apps Script. | `90_Router.js`, `10_Env_Gas.js` | **Đã ghi nhận**. |
| R8 | Phiên lưu `idToken` trong `sessionStorage`. Chấp nhận được khi có CSP chặt; nếu có XSS thì token bị lộ. | `auth.js`, `index.html` | **Đã ghi nhận**. |

### 2.2 Cấu trúc

| # | Vấn đề | Trạng thái |
|---|---|---|
| S1 | Thứ tự nạp tệp theo số là ràng buộc ngầm: `90_Router.js` tham chiếu `Q.*Service` ngay khi nạp; `10`/`11` tự thoát theo kiểu của `SpreadsheetApp`. | Đã ghi nhận. Đề xuất: khai báo rõ phụ thuộc trong tệp `00_Namespace`. |
| S2 | Dữ liệu mẫu (`96_Seed.js`, ~20 KB) nằm trong mã đẩy lên Apps Script thật. Cần cho `seedDemoData` ở môi trường thử, nhưng vẫn là rủi ro theo R13 và làm mã lớn hơn. | Đã ghi nhận. Đề xuất: tách bằng `.claspignore`/hai cấu hình build. |
| S3 | Hai định nghĩa `Store` (GAS và bộ nhớ) và hai nơi tạo `Q.Env`, chọn theo kiểm tra kiểu toàn cục. Dễ hiểu sai khi đọc. | Đã ghi nhận. |
| S4 | Hai nhánh (AppSheet và GAS) dùng chung mô hình dữ liệu nhưng không có nguồn lược đồ chung (`00_Namespace` so với `docs/appsheet/data-dictionary.md`). Rủi ro lệch dần. | Đã ghi nhận. |
| S5 | `notifications.js` suy ra đích điều hướng từ tiền tố mã (`TSK-`, `UPD-`): phụ thuộc định dạng ID. | Đã ghi nhận. Đề xuất: máy chủ trả `targetHash`. |
| S6 | `main.js` gộp định tuyến, khung ứng dụng, đăng nhập demo và chuông thông báo (~170 dòng). | Đã ghi nhận. |
| S7 | Cấu hình Client ID nằm ở 4 nơi: Script Property, giá trị dự phòng trong code, biến môi trường Render, `frontend/config.js`. Không rõ nguồn chuẩn. | Đã ghi nhận. |
| S8 | Không có kiểm thử cho frontend (`api.js`, `auth.js`, view). Toàn bộ 33 ca ban đầu là backend. | Đã ghi nhận. Đã kiểm thử thủ công bằng trình duyệt (xem mục 5). |

### 2.3 Mã trùng lặp

| # | Trùng lặp | Trạng thái |
|---|---|---|
| D1 | Chống ghi trùng: 5 nơi tự tra `AuditLogs` theo khóa rồi tự trả `replayed`. | **Đã sửa**: `Q.Audit.find(key)`. |
| D2 | Dựng map người dùng/vai trò bằng tay ở 4 nơi (`userMap`, `T.get`, `D.get`, `roleMap`). | **Đã sửa** ở các nơi công việc/phân công: dùng `S.find('Users', id)`. |
| D3 | `isoNoMs` được định nghĩa hai lần (`00_Namespace.js`, `01_Util.js`). | Đã ghi nhận (ít quan trọng). |
| D4 | Định nghĩa "đang mở" và "trễ hạn" viết lặp ở 4 chỗ. | **Đã sửa**: `Q.Rules`. |
| D5 | Frontend: 4 danh sách lặp cùng mẫu `try/catch` + spinner + bỏ qua `UNAUTHENTICATED`. | **Đã sửa**: `listLoader()` trong `ui.js`. |
| D6 | Frontend: lựa chọn từ bảng nhãn `opts(Object.entries(L.x).map(...))` lặp 6 lần; nhãn cán bộ `${fullName} (${employeeCode})` lặp 4 lần. | **Đã sửa**: `mapOptions()`, `userLabel()` trong `views/shared.js`. |
| D7 | Bộ giả lập Apps Script được viết trong một file test. | **Đã sửa**: tách thành `tests/fake-gas.js` dùng chung. |
| D8 | Hai nhánh xử lý `Q.handle` (đọc và ghi) có phần xác thực giống nhau. | Một phần: đã bỏ đặt lại bộ đệm thừa ở nhánh đọc. Nhánh ghi giữ nguyên vì phải đọc lại dữ liệu trong khóa. |

### 2.4 Điểm nghẽn

| # | Điểm nghẽn | Số đo | Trạng thái |
|---|---|---|---|
| B1 | Mỗi request đọc lại `Users` hai lần (`Store.reset` trong nhánh đọc). | `task.list`: 9 → 8 lần đọc driver | **Đã sửa**. |
| B2 | `Store.insert`/`update` xóa toàn bộ chỉ mục, nên lần truy cập sau dựng lại O(N). Vòng lặp ghi trong một request thành O(N²). | Trong một request: `Notify.send` ×300: **737 → 36 ms**; `insert` ×1000: **271 → 37 ms**; `markAllRead` (~670 dòng): **119 → 37 ms** | **Đã sửa**: chỉ mục tăng dần, không xóa toàn bộ. |
| B3 | `nextId` quét toàn bảng mỗi lần (7 nơi gọi); `AuditLogs` tăng vô hạn. | Gộp vào B2 | **Đã sửa**: bộ đếm `seq` theo bảng. |
| B4 | Ghi nhiều dòng (bootstrap, seed) gọi `appendRow` từng dòng. | Chưa đo trên Apps Script thật | **Đã sửa**: `SheetDriver.appendMany` (một `setValues`), `Store.insertMany` kiểm tra trùng khóa trước khi ghi dòng nào. |
| B5 | `DTO.tasks` quét toàn bộ `Customers`, `TaskAssignees`, `TaskUpdates`, `Users` ở **mỗi** lần gọi, kể cả khi chỉ có một công việc (`dtoOf`). | Ở 3000 công việc: `task.get` và `task.create` đều ~75–135 ms (trước và sau) | **Đã sửa một phần**: tra theo chỉ mục khóa, không tạo map toàn bảng. Chi phí nạp bảng vẫn còn (xem B6). |
| B6 | **Giới hạn cấu trúc:** mỗi request vẫn nạp toàn bộ tab cần dùng (`getValues` cả tab). Chi phí tuyến tính theo số dòng. Các tab tham chiếu (`Roles`, `Permissions`, `RolePermissions`) được đọc lại ở mọi request. | Đo trên bộ nhớ: `task.list` ~80 ms ở 3000 công việc (đã gồm sao chép JSON). Trên Sheets sẽ lớn hơn nhiều. | **Đã ghi nhận**. Refactor không khắc phục được. Xem mục 3 (P3). |
| B7 | Form tạo công việc tải 100 khách hàng và 100 cán bộ mỗi lần mở; khách hàng thứ 101 trở đi không chọn được (giao diện có gợi ý). | — | **Đã ghi nhận**. |

## 3. Chiến lược tái cấu trúc

Ưu tiên theo rủi ro dữ liệu, rồi hiệu năng, rồi cấu trúc. Mỗi bước chạy bộ kiểm thử trước khi sang bước sau.

- **P0 – Đúng đắn dữ liệu (đã làm):** `requestId` theo biểu mẫu (R1); số đếm người dùng trên toàn bảng (R2); cờ Giám đốc trong demo (R3).
- **P1 – Hiệu năng trong một request (đã làm):** chỉ mục tăng dần, bộ đếm ID, `insertMany`/`appendMany`, bỏ đọc lại `Users`, DTO theo chỉ mục (B1–B5). Kiểm chứng bằng kiểm thử ngẫu nhiên so với oracle (xem mục 5).
- **P2 – Cấu trúc và trùng lặp (đã làm một phần):** `Q.Audit.find`, `Q.Rules`, `userRef`, `listLoader`, `mapOptions`, `userLabel`, `fake-gas.js` (D1, D2, D4–D7).
- **P3 – Đề xuất, chưa làm (cần quyết định hoặc công việc lớn):**
  1. Chọn nguồn sự thật cho Client ID (S7) và bỏ giá trị dự phòng trong code, hoặc chấp nhận và ghi rõ trong DEPLOYMENT.md (R6).
  2. Tách dữ liệu mẫu khỏi mã production (S2) bằng `.claspignore` và hai bản build.
  3. Cache tham chiếu `Roles`/`Permissions`/`RolePermissions` theo phiên bản để bớt 3 lần đọc tab mỗi request (B6).
  4. Máy chủ trả `targetHash` cho thông báo (S5).
  5. Quyết định R4 và R5, rồi thống nhất quy tắc ở một chỗ.
  6. Thêm kiểm thử frontend (Node + jsdom hoặc trình duyệt tự động) cho `api.js`, `listLoader`, và luồng biểu mẫu (S8).
  7. Khi số dòng vượt vài nghìn mỗi tab, chuyển `SheetDriver` sang cơ sở dữ liệu theo lộ trình đã nêu trong `ARCHITECTURE.md` §6. Đây là giới hạn của Sheets (B6), refactor không thay thế được.

## 4. Mã đã cải thiện

| Tệp | Thay đổi |
|---|---|
| `backend/src/02_Store.js` | Viết lại: chỉ mục khóa và cột cập nhật tăng dần (`addRow`, `reindexChanged`, `insertSorted`); bộ đếm `seq` cho `nextId`; `insertMany` kiểm tra trùng khóa trước khi ghi; `Object.create(null)` cho map. |
| `backend/src/11_Driver_Sheet.js` | Thêm `appendMany` (một lượt `setValues`), giữ ánh xạ vị trí dòng `rowNums`. |
| `backend/dev/Env_Memory.js` | Thêm `appendMany` cho driver bộ nhớ. |
| `backend/src/90_Router.js` | Nhánh đọc không đặt lại bộ đệm (bỏ đọc lại `Users`, `Roles`...). |
| `backend/src/30_Core.js` | `Q.Rules` (đang mở / trễ hạn); `Q.Audit.find`; `userRef(id)` tra theo khóa; `DTO.tasks` và `DTO.updates` theo chỉ mục; bỏ `userMap`. |
| `backend/src/40_Svc_Tasks.js` | `Q.Audit.find`; `T.list` dùng `Q.Rules.isLate`; `T.get` tra người dùng theo khóa. |
| `backend/src/41–43_Svc_*.js` | `Q.Audit.find` thay cho tra thủ công; `A.userList` trả `counts` (`userCounts`) trên toàn bảng. |
| `backend/src/44_Svc_Dashboard.js` | Tra người dùng theo khóa; `D.director` dùng `Q.Rules`. |
| `backend/src/95_Setup.js` | `insertAll` gọi `insertMany`. |
| `frontend/js/ids.js` (mới) | `newRequestId()`. |
| `frontend/js/api.js` | `call(action, params, {requestId})`; `demoUsers()` trả `isDirector`; bỏ `rid()` trùng. |
| `frontend/js/ui.js` | `formDialog` dùng một `requestId` cho mỗi lần mở và truyền vào `onSubmit`; thêm `listLoader()`. |
| `frontend/js/views/shared.js` | Thêm `mapOptions()`, `userLabel()`; `reject` truyền `requestId`. |
| `frontend/js/views/tasks.js`, `customers.js`, `admin.js` | Dùng `listLoader`, `mapOptions`, `userLabel`; mọi biểu mẫu ghi truyền `requestId`; trang quản trị đọc `counts` từ máy chủ. |
| `frontend/js/main.js` | Nhãn Giám đốc trong demo dựa trên `isDirector`. |
| `frontend/demo/backend.bundle.js` | Build lại từ backend mới (`node tools/build.js demo`). |
| `tests/fake-gas.js` (mới) | Bộ giả lập Apps Script dùng chung; `gas-runtime.test.js` nhập từ đây. |
| `tests/store.test.js` (mới) | 600 thao tác ngẫu nhiên × 3 seed so với oracle quét tuyến tính; đổi khóa chính; `nextId`; `insertMany` nguyên tử; cập nhật giữ đúng thứ tự chỉ mục. |
| `tests/driver-sheet.test.js` (mới) | Driver Sheets qua bộ giả lập: dòng trống ở giữa tab, ghi sau khi đọc lại, `appendMany`, `nextId` sau dòng trống. |
| `tests/refactor.test.js` (mới) | `user.list` trả `counts` toàn bảng; mỗi bảng chỉ đọc tối đa một lần trong một request đọc. |
| `package.json` | `npm test` chạy thêm ba tệp mới. |

## 5. Kiểm chứng

- **Kiểm thử tự động:** `npm test` → **44/44 đạt** (33 ca cũ, 11 ca mới). Ca "Store có chỉ mục khớp với oracle" chạy 600 thao tác ngẫu nhiên trên 3 seed; lần chạy đầu tiên đã phát hiện một khác biệt thật về thứ tự kết quả khi chỉ mục được cập nhật, đã sửa.
- **Số lần đọc driver** (script đo bằng driver bộ nhớ, dữ liệu mẫu): `task.list` 9 → 8; các thao tác đọc khác giảm tương tự (bớt một lần đọc `Users`).
- **Hiệu năng trong một request** (đo bằng cùng script, bản cũ là commit `efc9153`):

  | Thao tác | Trước | Sau |
  |---|---|---|
  | `Notify.send` ×300 | 737 ms | 36 ms |
  | `insert` ×1000 (vòng lặp) | 271 ms | 37 ms |
  | `markAllRead` (~670 thông báo) | 119 ms | 37 ms |
  | `task.list` (3000 công việc) | ~76–80 ms | ~80 ms (không đổi đáng kể; chi phí nạp bảng, xem B6) |
  | `task.create` (3000 công việc) | ~134 ms | ~134 ms (không đổi đáng kể; xem B6) |

- **Smoke test trên trình duyệt** (chế độ demo, `http://localhost:8080`): đăng nhập bằng 3 vai trò; danh sách công việc và phân trang; trang Quản trị (KPI 6 người dùng, phân bố 1/1/1/3 lấy từ máy chủ); danh sách người dùng và nhật ký kiểm toán; CBTD gửi báo cáo tiến độ (ghi nhận `evt-progress.submit-r…`); KSV từ chối báo cáo bằng biểu mẫu có lý do; tạo công việc mới (nhãn cán bộ đúng, `evt-task.create-r…`). Không có lỗi trong console.
- **Chưa kiểm chứng:**
  - Đường chạy thật trên Apps Script: `appendMany` và toàn bộ `SheetDriver` mới chỉ kiểm thử bằng bộ giả lập. Cần `clasp push` và thử trên bản sao của Sheet.
  - Frontend không có kiểm thử tự động; chỉ kiểm tra thủ công.
  - Thời gian thật trên Sheets (quota, độ trễ API) không đo được ở đây.

## 6. Ảnh hưởng đến triển khai

- Các thay đổi nằm trong thư mục làm việc, **chưa commit**. Apps Script (`@2`) đang chạy phiên bản trước refactor. Nếu Render đã được tạo, nó build từ commit `efc9153` trên nhánh `deploy/gas-render-pilot`.
- Để đưa thay đổi lên: commit `app/`, `clasp push -f` trong `app/backend`, rồi cập nhật deployment `@2` (cùng URL `/exec`), và Render sẽ build lại khi có commit mới.
- Dữ liệu đã có trên Sheets không cần chuyển đổi: lược đồ không đổi, chỉ thêm `appendMany`/`insertMany` và `counts` trong phản hồi.
