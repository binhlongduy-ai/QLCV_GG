# Hướng dẫn Xây dựng Cổng thông tin Google Sites cho Hệ thống QLCV CBTD (v2.0)

> **Mục tiêu**: Xây dựng một Cổng điều hành trung tâm (Portal) chuyên nghiệp trên **Google Sites** cho Ban Giám đốc và các Cán bộ chi nhánh truy cập dễ dàng chỉ qua **1 đường link duy nhất**, tự động nhận diện phân quyền Google Workspace.

> **Phiên bản áp dụng**: QLCV CBTD v2.0 — Bao gồm Dashboard BGĐ, Quản lý Công việc (CBTD1/CBTD2), Nhật ký Tiến độ, Quản lý Khách hàng, Quản lý Người dùng (Admin), Cơ sở dữ liệu (Admin).

---

## Mục lục

1. [Kiến trúc & Mô hình](#1-kiến-trúc-cổng-thông-tin-google-sites)
2. [Tạo Google Sites](#2-các-bước-thực-hiện-tạo-google-sites-dưới-30-phút)
3. [Lấy URL Web App](#3-lấy-url-web-app-và-gắn-vào-sites)
4. [Cấu hình Phân quyền & Publish](#4-cấu-hình-phân-quyền--xuất-bản-publish)
5. [Mẫu Email thông báo](#5-mẫu-email-thông-báo-triển-khai)
6. [Checklist hoàn tất](#6-checklist-kiểm-tra-hoàn-tất)
7. [Tùy chỉnh nâng cao](#7-tùy-chỉnh-nâng-cao)
8. [Troubleshooting](#8-xử-lý-sự-cố)

---

## 1. Kiến trúc Cổng thông tin Google Sites

Thay vì nhúng `<iframe>` (gây lỗi cuộn kép, xung đột cookie, giao diện thu nhỏ trên mobile), mô hình chuẩn sử dụng **Khối điều hướng trực tiếp (Direct Action Tiles)** — mỗi nút là 1 link sâu (deep-link) tới trang chức năng tương ứng trong Web App thông qua hash routing.

```
┌────────────────────────────────────────────────────────────────────────┐
│ GOOGLE SITES — CỔNG THÔNG TIN ĐIỀU HÀNH TÍN DỤNG CHI NHÁNH            │
│ https://sites.google.com/view/qlcv-cbtd-chinhanh                       │
│                                                                        │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      │
│  │ 📊 DASHBOARD BAN GIÁM ĐỐC │      │ 📝 QUẢN LÝ CÔNG VIỆC      │      │
│  │ Chỉ số tổng quan, tỷ lệ   │      │ Giao việc, hợp công       │      │
│  │ đúng hạn, nhóm nợ, loại  │      │ CBTD1 + CBTD2, diễn giải │      │
│  │ KH. Có filter bar.        │      │ và danh mục 13 CV mẫu... │      │
│  │ [ Mở Dashboard → ]        │      │ [ Vào Quản lý việc → ]    │      │
│  │  → WebApp_URL#dashboard   │      │  → WebApp_URL#congviec    │      │
│  └───────────────────────────┘      └───────────────────────────┘      │
│                                                                        │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      │
│  │ 📓 NHẬT KÝ TIẾN ĐỘ        │      │ 👥 QUẢN LÝ KHÁCH HÀNG     │      │
│  │ Cập nhật tiến độ hàng     │      │ Tra cứu nhóm nợ, phân    │      │
│  │ ngày & KSV phê duyệt.    │      │ loại KH, lịch sử quan hệ  │      │
│  │ Có import XLSX, lọc đa    │      │ tín dụng.                 │      │
│  │ tiêu chí.                 │      │ [ Danh mục KH → ]         │      │
│  │ [ Mở Nhật ký → ]          │      │  → WebApp_URL#khachhang   │      │
│  │  → WebApp_URL#nhatky      │      └───────────────────────────┘      │
│  └───────────────────────────┘                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Người dùng Admin còn thấy 2 nút bổ sung** (xem mục 2.4):

| Nút | Chức năng | Link |
|---|---|---|
| ⚙️ Người dùng | CRUD Users + phân quyền | `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#nguoidung` |
| 🗄️ Cơ sở dữ liệu | Đồng bộ, kiểm tra DB | `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#csdl` |

---

## 2. Các bước Thực hiện Tạo Google Sites (Dưới 30 phút)

### Bước 1 — Khởi tạo Trang Sites mới
1. Mở trình duyệt và truy cập: `https://sites.google.com/new`
2. Đăng nhập bằng tài khoản Google công vụ / Google Workspace của chi nhánh.
3. Bấm chọn mẫu **+ Trống (Blank)**.

### Bước 2 — 
'''
Tạo 1 trang web theo chi tiết :
1.Thiết lập Tên & Header
1. **Tên trang web (góc trên trái)**: `QLCV CBTD - Láng Hạ`
2. **Tiêu đề Banner chính** (thêm Text box hoặc Header):
   ```
   📋 HỆ THỐNG QUẢN LÝ CÔNG VIỆC CÁN BỘ TÍN DỤNG
   Chi nhánh LÁNG HẠ
   ```
3. **Chủ đề (Theme)**: Tab **Chủ đề (Themes)** bên phải → chọn kiểu **Aristotle** hoặc **Impression** với tone màu chủ đạo **Xanh dương (#1A73E8)** để đồng nhất với giao diện Web App.

### Bước 3 — Khối Giới thiệu & Hướng dẫn
1. Bấm **Chèn (Insert) → Hộp văn bản (Text box)**.
2. Nội dung gợi ý:
   > *Hệ thống quản lý, phân bổ tiến độ hồ sơ tín dụng khách hàng và giám sát rủi ro tín dụng real-time. Hệ thống tự động xác thực danh tính qua tài khoản Google của cán bộ, đảm bảo mỗi người chỉ thấy công việc mình phụ trách.*

### Bước 4 — Tạo các Nút Điều hướng Chuyên biệt (Deep-linking)

Chọn **Bố cục khối (Layouts)** dạng 2 cột hoặc 4 cột, thêm các nút bấm liên kết trực tiếp. **Mỗi nút**:
- Bấm chuột phải → **Link** (hoặc biểu tượng liên kết).
- Dán URL theo định dạng `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#[hash]`.
- Tick **Open in new tab** để mở trong tab mới.

#### Ô 1 — Dashboard Ban Giám Đốc
- **Tiêu đề**: `📊 DASHBOARD BAN GIÁM ĐỐC`
- **Mô tả**: `Theo dõi tiến độ tổng quan, tỷ lệ đúng hạn, phân bổ khách hàng theo nhóm nợ (1-5, XLRR) và loại KH. Có filter bar và xuất báo cáo Excel.`
- **Nút**: `Mở Dashboard BGĐ →`
- **Link**: `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#dashboard`

#### Ô 2 — Quản lý Công việc Tín dụng
- **Tiêu đề**: `📝 QUẢN LÝ CÔNG VIỆC TÍN DỤNG`
- **Mô tả**: `Giao việc, phối hợp giữa CBTD1 (chủ trì) và CBTD2 (hợp công), 13 danh mục công việc chuẩn CBTD, cập nhật diễn giải và bộ lọc đa tiêu chí.`
- **Nút**: `Mở Quản lý Công việc →`
- **Link**: `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#congviec`

#### Ô 3 — Nhật ký Tiến độ & Phê duyệt KSV
- **Tiêu đề**: `📓 NHẬT KÝ TIẾN ĐỘ`
- **Mô tả**: `Báo cáo kết quả xử lý hồ sơ từng ngày (chỉ thêm mới - append only) và Kiểm soát viên xét duyệt. Có lọc theo CBTD/KH/trạng thái duyệt.`
- **Nút**: `Mở Nhật ký Tiến độ →`
- **Link**: `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#nhatky`

#### Ô 4 — Danh mục Khách hàng
- **Tiêu đề**: `👥 QUẢN LÝ KHÁCH HÀNG`
- **Mô tả**: `Tra cứu danh mục khách hàng doanh nghiệp, cá nhân, phân nhóm nợ và lịch sử quan hệ tín dụng. Hỗ trợ import XLSX hàng loạt.`
- **Nút**: `Mở Khách hàng →`
- **Link**: `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#khachhang`

### Bước 4B — (Tuỳ chọn cho Admin) Thêm 2 nút bổ sung

Tạo thêm 1 layout 2 cột phía dưới cho Admin:

#### Ô 5 — Quản lý Người dùng (Admin)
- **Tiêu đề**: `⚙️ QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN`
- **Mô tả**: `Thêm/sửa/xóa tài khoản cán bộ, gán Role (Admin/BGD/KSV/CBTD).`
- **Nút**: `Mở Quản lý Người dùng →`
- **Link**: `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#nguoidung`

#### Ô 6 — Cơ sở dữ liệu (Admin)
- **Tiêu đề**: `🗄️ CƠ SỞ DỮ LIỆU`
- **Mô tả**: `Đồng bộ dữ liệu App → Sheet, tải lại toàn bộ, kiểm tra tính toàn vẹn.`
- **Nút**: `Mở Quản lý CSDL →`
- **Link**: `https://script.google.com/macros/s/AKfycbzOTWzIeD96vxu9f50WPrQAnnsOCxc3efcQskWeYVRd09oCN0ikglnC8ln0x8RwFUJsIg/exec#csdl`

> **Lưu ý bảo mật**: Trang Web App tự ẩn menu Người dùng / CSDL với non-Admin. Tuy nhiên nếu muốn ẩn hẳn nút trên Google Sites, có thể tạo 2 trang Sites riêng (1 cho Admin, 1 cho người dùng thường) và phân quyền xem ở bước 4.

### Bước 5 — Footer & Liên hệ hỗ trợ
Thêm Text box cuối trang:
```
📞 Hỗ trợ kỹ thuật: binhnguyen@agribank.com.vn
🔄 Phiên bản: QLCV CBTD v2.0
📅 Cập nhật: [Ngày triển khai]
```

---

## 3. Lấy URL Web App và Gắn vào Sites

### 3.1. Lấy URL
1. Mở dự án Google Apps Script chứa backend QLCV CBTD.
2. Bấm **Deploy → Manage deployments**.
3. Copy đường link tại mục **Web app URL** (dạng `https://script.google.com/macros/s/AKfycb.../exec`).

### 3.2. Gắn vào từng nút
URL đầy đủ cho từng nút:

| Nút | URL đầy đủ |
|---|---|
| Dashboard BGĐ | `https://script.google.com/macros/s/AKfycb.../exec#dashboard` |
| Quản lý Công việc | `https://script.google.com/macros/s/AKfycb.../exec#congviec` |
| Nhật ký Tiến độ | `https://script.google.com/macros/s/AKfycb.../exec#nhatky` |
| Quản lý Khách hàng | `https://script.google.com/macros/s/AKfycb.../exec#khachhang` |
| Quản lý Người dùng | `https://script.google.com/macros/s/AKfycb.../exec#nguoidung` |
| Cơ sở dữ liệu | `https://script.google.com/macros/s/AKfycb.../exec#csdl` |

> **Mẹo**: Khi thay đổi Apps Script (deploy New version), URL Web App KHÔNG đổi. Nên bạn chỉ cần copy 1 lần vào Google Sites.

---

## 4. Cấu hình Phân quyền & Xuất bản (Publish)

### 4.1. Phân quyền xem Sites
Bấm **Share with others 👤+** góc trên:
- **Quyền truy cập chung (General access)**: Đặt là **`Anyone within [Tên miền đơn vị] đều có thể xem`**.
- Điều này đảm bảo chỉ cán bộ có email công vụ mới mở được trang Sites.
- Nếu dùng Gmail cá nhân: đặt **`Anyone with the link can view`**.

### 4.2. Publish
Bấm **Publish** góc trên bên phải:
- **Web address**: `qlcv-cbtd-[tên-chi-nhánh]` (chữ thường, không dấu, gạch ngang).
- Bấm **Publish** lần nữa để xác nhận.

### 4.3. URL cuối cùng
Trang Sites có dạng: `https://sites.google.com/view/qlcv-cbtd-chinhanh`.

Đây là link duy nhất cần gửi cho toàn bộ cán bộ chi nhánh. Mọi thao tác đều thông qua link này.

---

## 5. Mẫu Email Thông báo Triển khai

```text
Kính gửi: Ban Giám đốc và Toàn thể Cán bộ Chi nhánh,

Hệ thống Quản lý Công việc Cán bộ Tín dụng (QLCV CBTD v2.0) đã chính thức
được triển khai trên Cổng thông tin nội bộ.

👉 Đường link truy cập duy nhất: https://sites.google.com/view/qlcv-cbtd-[tên-chi-nhánh]

🔹 Đối với Ban Giám đốc:
   Bấm "Mở Dashboard BGĐ" để theo dõi biểu đồ tỷ lệ đúng hạn, lọc số liệu
   theo từng CBTD và nhóm nợ khách hàng. Có thể xuất báo cáo Excel điều hành.

🔹 Đối với Kiểm soát viên:
   Bấm "Mở Quản lý Công việc" / "Nhật ký Tiến độ" để theo dõi và duyệt
   tiến độ. Có thể giao việc mới cho CBTD.

🔹 Đối với Cán bộ Tín dụng (CBTD):
   Bấm "Mở Quản lý Công việc" để cập nhật tiến độ công việc được giao
   (chủ trì hoặc hợp công). Hệ thống chỉ hiển thị công việc bạn phụ trách.

🔹 Đối với Admin:
   Truy cập thêm "Quản lý Người dùng" và "Cơ sở dữ liệu" để quản trị hệ thống.

Lưu ý quan trọng:
   - Đăng nhập bằng tài khoản email Google công vụ của chi nhánh.
   - Lần đầu truy cập có thể phải chấp nhận quyền truy cập (Allow).
   - Nếu quên mật khẩu Google, liên hệ bộ phận IT chi nhánh.

Trân trọng thông báo./
```

---

## 6. Checklist Kiểm tra Hoàn tất

### Trước khi công bố
- [ ] Trang Sites đã tạo với tiêu đề và nhận diện thương hiệu chi nhánh.
- [ ] 4 (hoặc 6) nút điều hướng đã gắn URL Web App kèm hash routing đúng.
- [ ] Tất cả nút được cấu hình **mở trong tab mới** (`Open in new tab`).
- [ ] Quyền xem Sites được thiết lập trong nội bộ miền Google Workspace.
- [ ] Tên file Apps Script khớp: `Code`, `Triggers`, `index`, `app_js`, `index_css`.

### Sau khi công bố — kiểm thử với 4 role
- [ ] **Admin**: Truy cập được cả 6 trang, thấy "Cơ sở dữ liệu".
- [ ] **BGD**: Truy cập Dashboard, không thấy menu Người dùng / CSDL.
- [ ] **KSV**: Truy cập Công việc + Nhật ký, có nút "Duyệt" trên NK chưa duyệt.
- [ ] **CBTD**: Truy cập Công việc — chỉ thấy CV mình là CBTD1/CBTD2.

### Kiểm tra logic nghiệp vụ
- [ ] CBTD1 không thấy CV của CBTD2 khác.
- [ ] CBTD2 có thể ghi nhật ký cho CV mình hợp công.
- [ ] BGD lọc Dashboard theo CBTD → chỉ số cập nhật ngay.
- [ ] KSV duyệt nhật ký → Email thông báo được gửi tới NOTIFY_EMAILS.
- [ ] Admin chạy "Kiểm tra toàn vẹn" → không có lỗi nghiêm trọng.

---

## 7. Tùy chỉnh nâng cao

### 7.1. Thêm favicon cho Sites
- **Insert → Image** → Upload logo chi nhánh.
- Sites tự dùng làm favicon.

### 7.2. Embed hình ảnh / biểu đồ demo
Có thể thêm khối hình ảnh minh họa giao diện Web App giúp cán bộ hình dung trước khi bấm nút. Chụp màn hình Dashboard BGĐ, lưu vào Google Drive, chèn link vào Sites.

### 7.3. Google Sites Analytics
- **Insert → Google Drive → Chart** để nhúng biểu đồ Google Sheet báo cáo tổng hợp.
- Hoặc dùng Google Data Studio embed.

### 7.4. Shortcut cho điện thoại (PWA)
- Nếu đã cấu hình PWA (xem HUONG_DAN_DEPLOY.md mục 7), thêm dòng:
  > *💡 Mẹo: Trên điện thoại, truy cập link trên bằng Chrome/Safari và chọn "Thêm vào màn hình chính" để dùng như ứng dụng.*

### 7.5. Thông báo đẩy (Push Notification)
Hiện tại hệ thống dùng **email notification** (qua `Triggers.gs`). Nếu muốn push notification trên trình duyệt, cần thêm:
1. Service Worker xử lý push event.
2. Cấu hình FCM / Web Push server.
3. Subscribe user khi đăng nhập.

(Đây là tính năng nâng cao, không bắt buộc.)

---

## 8. Xử lý sự cố

### Sites không hiển thị đúng trên mobile
- Một số theme có vấn đề responsive. Đổi theme **Impression** (tốt hơn cho mobile).
- Hoặc xuất bản dưới dạng **New Sites** (Google đã cập nhật) thay vì classic Sites.

### Bấm nút nhưng mở sai trang
- Kiểm tra URL có chứa đúng hash (`#dashboard`, `#congviec`...).
- Lưu ý: Apps Script có thể serve chậm lần đầu (cold start ~3-5s).

### Hash routing không hoạt động
- Mở URL thủ công: `https://script.google.com/macros/s/.../exec#congviec` → bấm Enter.
- Nếu vẫn ở trang Login → kiểm tra session đã expire chưa, đăng nhập lại.

### Trang Sites không khả dụng cho một số user
- Kiểm tra General access đã đặt `Anyone within [Domain]` chưa.
- Nếu dùng Gmail cá nhân, đặt `Anyone with the link can view`.

### Thay đổi giao diện Sites mà vẫn giữ URL
- Sites cho phép edit thoải mái mà URL không đổi. An toàn để cập nhật nội dung bất kỳ lúc nào.

### URL Web App bị đổi sau khi Deploy New version?
- **KHÔNG NÊN** xảy ra. Nếu bị đổi, có thể bạn đã tạo **New deployment** thay vì edit deployment hiện tại. Xem lại `HUONG_DAN_DEPLOY.md` mục 4.

---

## Phụ lục — Liên kết hữu ích

- Tài liệu Google Sites chính thức: https://support.google.com/sites
- Quản lý Apps Script deployment: https://developers.google.com/apps-script/concepts/deployments
- Hệ thống QLCV CBTD docs: `HUONG_DAN_DEPLOY.md` (trong workspace)