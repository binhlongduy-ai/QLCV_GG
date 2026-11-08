# Thư viện thành phần giao diện (`frontend/js/components`)

Thành phần dùng chung cho web và cho ứng dụng cài trên Android/iOS (PWA). Không framework, không bước build: ES module thuần, chạy được dưới CSP hiện tại. Ví dụ sử dụng chạy được: mở `components.html` (vd `http://localhost:8090/components.html` khi chạy máy chủ tĩnh).

## 1. Kiến trúc

```
js/components/
├─ dom.js          h(), mount(), uid(), cx(), focusables() – nền DOM, không phụ thuộc gì
├─ button.js       Button
├─ state.js        Spinner, Skeleton, EmptyState, ErrorState
├─ async-view.js   AsyncView  (dùng state.js)
├─ pagination.js   Pagination (dùng button.js)
├─ toast.js        toast
├─ dialog.js       Dialog, confirm (dùng button.js)
├─ field.js        Field
├─ form-dialog.js  FormDialog (dùng dialog.js, field.js, button.js)
├─ data-list.js    DataList   (dùng state.js)
├─ display.js      Badge, ProgressBar, Kpi
├─ index.js        điểm nhập duy nhất
└─ gallery.js      ví dụ sử dụng (components.html)
js/ui.js           lớp tương thích: giữ nguyên chữ ký hàm cũ cho các view, ủy quyền sang components
```

**Nguyên tắc:**
- **Một chiều phụ thuộc:** components không import `ui.js`, `api.js` hay view nào. Không biết gì về nghiệp vụ.
- **Hàm nhận props, trả phần tử DOM** (hoặc một đối tượng điều khiển nhỏ khi cần thao tác sau: `Field`, `Dialog`, `AsyncView`).
- **An toàn:** dữ liệu luôn vào DOM qua text node, không dùng `innerHTML`.
- **Tương thích:** 8 view hiện có không phải sửa; `ui.js` chuyển lời gọi cũ sang thư viện mới.
- **Một mã nguồn cho mọi thiết bị:** thích ứng bằng CSS (`@media (max-width:600px)`, `(pointer:coarse)`, `env(safe-area-inset-*)`), không có nhánh mã riêng cho di động.

## 2. Khả năng tiếp cận, trạng thái tải, thích ứng

| Hạng mục | Cách làm |
|---|---|
| Hộp thoại | `aria-labelledby` trỏ tiêu đề; focus vào trong khi mở; bẫy focus; Esc đóng; **trả focus về phần tử đã mở**; dự phòng `role=dialog` khi trình duyệt không có `<dialog>` (iOS Safari < 15.4) |
| Xác nhận nguy hiểm | Focus mặc định vào "Hủy" để Enter không vô tình xác nhận |
| Trường nhập | `label for`, `aria-describedby` (gợi ý + lỗi), `aria-invalid` khi lỗi, `aria-required` |
| Trạng thái | Đang tải: `role=status` + `aria-busy`; lỗi: `role=alert`; khung xương có nhãn ẩn cho trình đọc màn hình |
| Toast | Lỗi `role=alert` (đọc ngay), khác `role=status`; có nút đóng; tạm dừng khi rê chuột/focus |
| Danh sách | `<caption>` ẩn, `th scope=col`; hàng bấm được nhận Tab + Enter/Space, có nhãn ARIA |
| Chạm | Vùng chạm tối thiểu 44px trên thiết bị cảm ứng; ô nhập 16px để iOS không tự phóng to |
| Màn hình nhỏ | Hộp thoại thành bottom sheet; bảng `DataList` thành thẻ "Cột: giá trị" |
| PWA | Chừa vùng tai thỏ/thanh điều hướng bằng `safe-area-inset`; `viewport-fit=cover` |
| Chuyển động | Tôn trọng `prefers-reduced-motion` (tắt xoay, tắt hiệu ứng khung xương) |

## 3. Thiết kế props

### Button
| Prop | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `label` | string \| Node | — | |
| `variant` | `'default' \| 'primary' \| 'danger' \| 'ghost'` | `'default'` | |
| `size` | `'md' \| 'sm'` | `'md'` | |
| `type` | `'button' \| 'submit'` | `'button'` | |
| `disabled`, `loading` | boolean | false | `loading`: khóa nút, `aria-busy` |
| `loadingLabel` | string | "Đang xử lý…" | |
| `ariaLabel` | string | — | **Bắt buộc** khi nút chỉ có biểu tượng |
| `onClick` | `(e) => void \| Promise` | — | Trả Promise ⇒ nút tự khóa đến khi xong (chống gửi trùng) |

Trả về `HTMLButtonElement` có thêm `setLoading(on)`.

### Field
| Prop | Kiểu | Ghi chú |
|---|---|---|
| `name`, `label` | string | Bắt buộc |
| `type` | `text, email, tel, number, date, textarea, select, checkbox, range` | Mặc định `text` |
| `value`, `required`, `readonly`, `hint`, `placeholder` | | |
| `options` | `{ value, label }[]` | Cho `select` |
| `min`, `max`, `step`, `maxlength`, `inputmode`, `autocomplete` | | Chuyển thẳng xuống ô nhập |
| `validate` | `(value) => string \| null` | Kiểm tra riêng |
| `showIf` | `(values) => boolean` | Dùng trong `FormDialog` |
| `onChange` | `(value) => void` | |

Trả về `{ el, input, getValue, setValue, setError(msg|null), setHidden, isHidden, check }`.

### FormDialog
`{ title, fields: FieldProps[], onSubmit(values, { requestId }) => Promise, submitLabel?, intro?, requestId? }`

`onSubmit` ném lỗi có `details.field` ⇒ lỗi hiện dưới đúng ô; lỗi khác hiện ở băng lỗi đầu biểu mẫu. Trong lúc gửi: khóa nút, không cho đóng, bỏ qua lần gửi thứ hai.

### Dialog / confirm
- `Dialog({ title, body, actions?, size?: 'sm'|'md'|'lg', dismissible? = true, onClose?, initialFocus? })` → `{ el, close, setBusy }`. `onClose` gọi đúng một lần.
- `confirm({ title, message, okLabel?, cancelLabel?, danger? })` → `Promise<boolean>`. Esc/× = `false`.

### AsyncView
`AsyncView({ container, loader, render, isEmpty?, empty?, loading?: 'spinner' | { variant, rows }, keepPrevious?, ignoreError? })` → `{ reload }`

Trường hợp biên: nhiều lần tải chồng nhau (chỉ vẽ kết quả mới nhất), lỗi phiên hết hạn (không vẽ lỗi, để lớp API đưa về đăng nhập), mất mạng (thông báo riêng "Không có kết nối mạng").

### DataList
`DataList({ columns, rows, rowKey, caption, onRowClick?, rowLabel?, rowClass?, empty? })`

`Column = { key, label, render?, align?: 'start'|'end', primary?, hideOnMobile? }`. Không có hàng ⇒ hiện `EmptyState`.

### Pagination
`Pagination({ page, pageSize, total, onPage, label? })`. Trang ngoài khoảng được kẹp lại; 0 hoặc 1 trang chỉ hiện tổng số.

### toast
`toast(message, kind | { kind?, duration?, action?: { label, onClick } })` → `{ dismiss }`. `duration: 0` = không tự đóng. Tối đa 4 cùng lúc.

### Hiển thị
- `Badge({ label, tone })`
- `ProgressBar({ value, max? = 100, label? })`: giá trị ngoài khoảng được kẹp lại
- `Kpi({ label, value, hint?, tone?, href? })`: có `href` thì là liên kết `<a>` thật

### Trạng thái
`Spinner({ label? })`, `Skeleton({ rows?, variant?: 'list'|'cards'|'kpis' })`, `EmptyState({ title, hint?, action?, icon? })`, `ErrorState({ error, onRetry?, retryLabel? })`.

## 4. Ví dụ sử dụng

```js
import { AsyncView, DataList, Badge, Pagination, FormDialog, toast } from './components/index.js';

// Danh sách có trạng thái tải / rỗng / lỗi, tự thành thẻ trên điện thoại
const box = document.querySelector('#tasks');
const view = AsyncView({
  container: box, keepPrevious: true, loading: { variant: 'list', rows: 5 },
  loader: () => api.call('task.list', { page }),
  isEmpty: (res) => res.total === 0,
  empty: { title: 'Chưa có công việc nào.', hint: 'Công việc được giao sẽ hiện ở đây.' },
  render: (res) => [
    DataList({
      caption: 'Danh sách công việc', rows: res.items, rowKey: (t) => t.taskId,
      onRowClick: (t) => { location.hash = '#/tasks/' + t.taskId; },
      columns: [
        { key: 'title', label: 'Công việc', primary: true },
        { key: 'status', label: 'Trạng thái', render: (t) => Badge({ label: t.status, tone: 'st-' + t.status }) },
        { key: 'dueAt', label: 'Hạn', align: 'end' }
      ]
    }),
    Pagination({ page: res.page, pageSize: res.pageSize, total: res.total, onPage: (p) => { page = p; view.reload(); } })
  ]
});
view.reload();

// Biểu mẫu: lỗi máy chủ gắn vào đúng ô, chống gửi trùng
FormDialog({
  title: 'Gửi tiến độ', submitLabel: 'Gửi',
  fields: [
    { name: 'progressPct', label: 'Tiến độ lũy kế', type: 'range', min: 0, max: 100, step: 5, value: 50 },
    { name: 'narrative', label: 'Diễn giải', type: 'textarea', required: true, maxlength: 2000 }
  ],
  onSubmit: async (v, { requestId }) => {
    await api.call('progress.submit', { taskId, ...v }, requestId);   // ném { message, details: { field } } khi lỗi
    toast('Đã gửi tiến độ, chờ duyệt.', 'ok');
  }
});
```

Thêm ví dụ (mọi biến thể và trạng thái): `frontend/js/components/gallery.js`.

## 5. PWA (Android / iOS)

| Tệp | Vai trò |
|---|---|
| `manifest.webmanifest` | Tên, màu, biểu tượng (có bản maskable cho Android), `display: standalone` |
| `sw.js` | Cache vỏ ứng dụng. **Không cache dữ liệu nghiệp vụ**: request khác nguồn (API Apps Script, Google Sign-In) đi thẳng mạng; `config.js` và trang điều hướng lấy mạng trước |
| `icons/` | PNG 192, 512, `apple-touch-icon` 180 (sinh bằng `node tools/icons.js`) |
| `index.html` | `link rel=manifest`, `apple-touch-icon`, `viewport-fit=cover`, CSP thêm `manifest-src`/`worker-src 'self'` |
| `render.yaml` | `sw.js` gửi kèm `Cache-Control: no-cache` để bản mới có hiệu lực ngay |

Cài đặt: Android (Chrome) → menu → "Cài đặt ứng dụng"; iOS (Safari) → Chia sẻ → "Thêm vào MH chính". Đổi `VERSION` trong `sw.js` mỗi lần phát hành để xóa bản lưu cũ.

**Giới hạn đã biết:** đăng nhập Google trong PWA cài trên iOS dùng cửa sổ bật lên của Google Identity Services; chưa kiểm trên thiết bị iOS thật.
