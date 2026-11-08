# 📋 SPECIFICATION v2.0 — QLCV CBTD
**Quản Lý Công Việc Cán Bộ Tín Dụng**
**Cập nhật:** 2026-10-09 | **Trạng thái:** ⛔ Đã thay thế (xem bên dưới)

> **Đã thay thế ngày 2026-10-13.** Hệ thống mới được xây dựng trên AppSheet + Google Sheets, theo [quyết định chốt hướng](../decisions/2026-10-13-chot-huong-appsheet.md) và [plan AppSheet](../plans/2026-10-09-0202-feat-appsheet-work-management-plan-vi.md).
> - Prototype `backend/` và `frontend/` đã gỡ khỏi dự án và lưu trữ tại [archive/prototype-2026-10-13](../../archive/prototype-2026-10-13/README.md).
> - Lộ trình PostgreSQL/JWT, RBAC middleware và React Query trong mục 10 **tạm hoãn**, không còn là kế hoạch hiện hành.
> - Nội dung dưới đây giữ làm tham khảo lịch sử; cây thư mục ở mục 4 và các API ở mục 5 không còn khớp với dự án.

---

## 1. Bối Cảnh & Mục Tiêu Rebuild

### Hệ thống cũ (GAS v1)
| Thành phần | Công nghệ | Hạn chế |
|-----------|-----------|---------|
| Frontend | HTML/CSS/JS (inline trong GAS) | Bị cache, không module hóa, dùng `sync_wrappers.ps1` |
| Backend/Data | Google Apps Script + Google Sheets | LockService, trigger spam, không scale |
| Auth | `Session.getActiveUser()` | Chỉ dùng được trong Google Workspace |
| Deploy | `clasp push` | Phụ thuộc Google Cloud, không CI/CD |

### Mục tiêu v2.0
- Kiến trúc **SPA + REST API** tách biệt hoàn toàn
- Tương thích môi trường Antigravity (module rõ ràng, dễ AI assist)
- Giao diện **Emerald Light Theme** — sáng, tươi, premium
- Build production được — không còn wrapper thủ công

---

## 2. Kiến Trúc Hệ Thống (Đã Triển Khai)

```
┌─────────────────────────────────────────────────────┐
│                    NGƯỜI DÙNG                        │
│           (Chrome / Edge / Firefox)                  │
└─────────────────┬───────────────────────────────────┘
                  │  HTTPS
┌─────────────────▼───────────────────────────────────┐
│            FRONTEND — React + Vite SPA               │
│         http://localhost:5173 (dev)                  │
│         https://your-domain.com (prod)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ Sidebar  │ │  Header  │ │  Pages               │ │
│  │ (nav)    │ │ (API     │ │  Dashboard/Tasks/    │ │
│  │          │ │  badge)  │ │  Customers           │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│  ┌────────────────────────────────────────────────┐  │
│  │ services/api.js  (Axios + Bearer Token)        │  │
│  │ services/mockApi.js  (fallback nếu offline)    │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────┘
                  │  /api/*  (proxy hoặc CORS)
┌─────────────────▼───────────────────────────────────┐
│            BACKEND — Node.js + Express               │
│         http://localhost:5000 (dev)                  │
│  ┌──────────────────────────────────────────────┐   │
│  │  routes/         controllers/                │   │
│  │  authRoutes   ←→ authController (login/JWT)  │   │
│  │  taskRoutes   ←→ taskController (CRUD)       │   │
│  │  customerRoutes ←→ customerController        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────┘
                  │  (Next Step: kết nối DB thật)
┌─────────────────▼───────────────────────────────────┐
│          DATABASE (Kế hoạch — chưa kết nối)          │
│   PostgreSQL (RDBMS) hoặc Firebase Firestore         │
└─────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack Chi Tiết

### 3.1 Frontend
| Thành phần | Công nghệ | Phiên bản |
|-----------|-----------|-----------|
| Framework | React | 19.x |
| Build tool | Vite | 8.x (rolldown) |
| HTTP Client | Axios | 1.x |
| Styling | Vanilla CSS + Variables | — |
| Font | Inter (Google Fonts) | Variable |
| State | useState / useEffect | React built-in |

### 3.2 Backend
| Thành phần | Công nghệ | Phiên bản |
|-----------|-----------|-----------|
| Runtime | Node.js | ≥ 18 |
| Framework | Express | 5.x |
| CORS | cors | 2.x |
| Config | dotenv | 18.x |
| Dev server | nodemon | 3.x |

### 3.3 Triển Khai
| Môi trường | Frontend | Backend |
|-----------|----------|---------|
| Development | Vite dev server :5173 | nodemon :5000 |
| Production | Vercel / Nginx (dist/) | Railway / PM2 |
| Config | vercel.json, .env.production | Procfile, .env |

---

## 4. Cấu Trúc Thư Mục Dự Án

```
qlcv-cbtd-20260815/
│
├── frontend/
│   ├── public/
│   │   └── favicon.svg              # SVG xanh lá
│   ├── src/
│   │   ├── components/
│   │   │   └── layout/
│   │   │       ├── Sidebar.jsx      # Navigation chính
│   │   │       └── Header.jsx       # Thanh trên (badge API mode)
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        # Tổng quan & thống kê
│   │   │   ├── Tasks.jsx            # Danh sách công việc CBTD
│   │   │   └── Customers.jsx        # Danh mục khách hàng
│   │   ├── services/
│   │   │   ├── api.js               # Axios client → backend thật
│   │   │   └── mockApi.js           # Fallback mock data
│   │   ├── App.jsx                  # Root: routing + API detection
│   │   ├── main.jsx                 # Entry point React
│   │   └── index.css                # Design system (CSS Variables)
│   ├── dist/                        # ✅ Production build output
│   ├── index.html                   # SEO đầy đủ, lang=vi
│   ├── vite.config.js               # Build tối ưu, chunk splitting
│   ├── vercel.json                  # SPA routing + cache headers
│   ├── .env                         # VITE_API_URL local
│   └── .env.production              # VITE_API_URL production
│
├── backend/
│   ├── routes/
│   │   ├── authRoutes.js            # POST /api/auth/login
│   │   ├── taskRoutes.js            # GET/POST/PUT/DELETE /api/tasks
│   │   └── customerRoutes.js        # GET /api/customers
│   ├── controllers/
│   │   ├── authController.js        # Login logic (mock JWT)
│   │   ├── taskController.js        # CRUD công việc (in-memory)
│   │   └── customerController.js   # Read khách hàng (in-memory)
│   ├── server.js                    # Entry: Express + CORS + dotenv
│   ├── Procfile                     # web: node server.js
│   └── .env                         # PORT=5000
│
├── docs/
│   └── solutions/                   # Tri thức từ GAS cũ
│       ├── business_logic.md
│       ├── deployment_config.md
│       └── fixed_bugs.md
│
└── legacy/                          # Code GAS gốc (tham khảo)
```

---

## 5. API Contracts (Đã Triển Khai)

### Auth
```
POST /api/auth/login
Body:  { email: string, password: string }
200:   { success: true, token: string, user: { id, name, email } }
401:   { success: false, message: string }
```

### Tasks
```
GET    /api/tasks           → { success: true, data: Task[] }
POST   /api/tasks           → { success: true, data: Task }
PUT    /api/tasks/:id       → { success: true, data: Task }
DELETE /api/tasks/:id       → { success: true, message: string }
```

### Customers
```
GET    /api/customers       → { success: true, data: Customer[] }
```

### Task Object Schema
```json
{
  "id":        "T001",
  "title":     "Thẩm định hồ sơ vay vốn...",
  "status":    "pending | in-progress | completed",
  "priority":  "high | medium | low",
  "assignee":  "CB01",
  "dueDate":   "2026-10-15"
}
```

---

## 6. Logic Nghiệp Vụ Đã Migrate (từ GAS)

### 6.1 RBAC — Role-Based Access Control
Hệ thống cũ dùng `Session.getActiveUser()`. Thiết kế mới:

| Role | Quyền hạn | Middleware (kế hoạch) |
|------|-----------|----------------------|
| Admin | Toàn bộ | `requireRole(['admin'])` |
| BGD | Xem báo cáo, giao việc | `requireRole(['admin','bgd'])` |
| KSV | Duyệt tiến độ, giao việc, cập nhật KH | `requireRole(['admin','bgd','ksv'])` |
| CBTD | Chỉ xem việc được giao, thêm nhật ký | `requireRole(['cbtd'])` + filter theo email |

### 6.2 Quy Trình Công Việc
```
Tạo CV (Admin/KSV/BGD)
    └─→ Gán CBTD1 (chính) + CBTD2 (hợp tác, tùy chọn)
           └─→ CBTD thêm Nhật Ký tiến độ
                  └─→ KSV duyệt / từ chối
                         └─→ Đạt 100% → Hoàn thành
```

### 6.3 Bugs Đã Fix Từ GAS (được giải quyết kiến trúc mới)

| Bug GAS cũ | Giải pháp v2.0 |
|-----------|----------------|
| Race condition → dùng LockService | PostgreSQL ACID transactions |
| onEdit trigger spam email | Event-driven (emit `NhatKyCreated`) |
| Email binding CBTD1/CBTD2 dạng string | Join table `task_assignees` |
| Asset cache cứng → sync_wrappers.ps1 | Vite hash filenames tự động |

---

## 7. Design System — Emerald Light Theme

### CSS Variables cốt lõi
```css
:root {
  --primary:         #10b981;   /* Emerald 500 */
  --primary-dark:    #059669;   /* Emerald 600 */
  --primary-light:   #34d399;   /* Emerald 400 */
  --primary-glow:    rgba(16, 185, 129, 0.2);

  --bg-base:         #f0fdf4;   /* Green 50 */
  --bg-card:         rgba(255, 255, 255, 0.85);
  --bg-sidebar:      rgba(240, 253, 244, 0.95);

  --text:            #111827;   /* Gray 900 */
  --text-secondary:  #6b7280;   /* Gray 500 */
  --text-sidebar:    #1f2937;   /* Gray 800 */

  --border:          rgba(16, 185, 129, 0.15);
  --radius:          16px;
}
```

---

## 8. Tối Ưu Cho Môi Trường Antigravity

| Tiêu chí | Cách triển khai |
|---------|----------------|
| **Ranh giới rõ ràng** | Mỗi file = 1 nhiệm vụ (routes / controllers / pages / services) |
| **Biến CSS tập trung** | Toàn bộ theme trong `index.css` `:root` — AI chỉ cần sửa 1 chỗ |
| **API mode detection** | App tự phát hiện backend online/offline, hiện badge trực quan |
| **Fallback graceful** | mockApi.js → frontend hoạt động độc lập khi backend offline |
| **No magic scripts** | Không còn sync_wrappers.ps1, clasp, hay build bước trung gian |
| **Env files chuẩn** | `.env` / `.env.production` — AI thay URL 1 dòng là deploy được |

---

## 9. Trạng Thái Các Pha

| Pha | Nội dung | Trạng thái |
|-----|----------|-----------|
| 1 | Khởi tạo Vite + di chuyển legacy code | ✅ Hoàn tất |
| 2 | UI Component Library (Sidebar, Header, Cards) | ✅ Hoàn tất |
| 3 | Smart Components + Mock API | ✅ Hoàn tất |
| 4 | Express Backend + Axios integration | ✅ Hoàn tất |
| 5 | SEO, Production Build, Deploy Config | ✅ Hoàn tất |

---

## 10. Next Steps — Roadmap Tiếp Theo

### Ưu tiên nền tảng — hoàn thành trước các module khác

1. **Cơ sở dữ liệu**
   - [ ] **Kết nối database thật** — Thay in-memory bằng PostgreSQL (`pg` / `prisma`)
2. **Xác thực và phân quyền (Auth)**
   - [ ] **JWT thật** — Dùng `jsonwebtoken` + bcrypt, thay mock login
   - [ ] **RBAC Middleware** — `requireRole()` trước mỗi route cần phân quyền
   - [ ] **Màn hình Đăng nhập** — Trang Login React với form + gọi `/api/auth/login`

Hoàn tất Cơ sở dữ liệu và Auth trước khi bắt đầu các hạng mục bên dưới.

### Ưu tiên tiếp theo — module chức năng và tích hợp
- [ ] **Nhật Ký Tiến Độ** — CRUD NhatKy, gắn với Task (table riêng)
- [ ] **Email Notifications** — Nodemailer hoặc SendGrid khi tạo nhật ký mới
- [ ] **Dashboard thống kê thật** — Tổng hợp từ DB thay mock data
- [ ] **React Query** — Caching & auto-refetch thay useState thủ công

### Ưu tiên sau — polish
- [ ] **Màn hình chi tiết Task** — Modal hoặc trang riêng
- [ ] **Tìm kiếm & lọc** — Filter theo trạng thái, người phụ trách, thời hạn
- [ ] **Dark mode toggle** — CSS variables đã sẵn sàng, chỉ cần thêm toggle
- [ ] **PWA** — Thêm service worker cho khả năng offline
