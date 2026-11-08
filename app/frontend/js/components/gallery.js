// Trang ví dụ sử dụng thư viện thành phần (components.html). Mỗi khối là một ví dụ độc lập, sao chép được.
import {
  h, mount, Button, Spinner, Skeleton, EmptyState, ErrorState, AsyncView, Pagination, toast,
  Dialog, confirm, Field, FormDialog, DataList, Badge, ProgressBar, Kpi
} from './index.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let sid = 0;
const section = (title, note, ...body) => { const id = 'g-' + (++sid); return h('section', { class: 'card', 'aria-labelledby': id },
  h('h2', { id }, title), note && h('p', { class: 'muted sm' }, note), ...body); };
const row = (...kids) => h('div', { class: 'actions' }, ...kids);

/* ---------- Dữ liệu mẫu (tổng hợp) ---------- */
const TASKS = Array.from({ length: 23 }, (_, i) => ({
  id: 'TSK-' + String(i + 1).padStart(3, '0'), title: 'Thẩm định hồ sơ mẫu ' + (i + 1),
  status: ['not_started', 'in_progress', 'completed'][i % 3], pct: (i * 13) % 101, due: '2026-11-' + String((i % 28) + 1).padStart(2, '0')
}));
const ST = { not_started: 'Chưa làm', in_progress: 'Đang thực hiện', completed: 'Đã hoàn thành' };

/* ---------- 1. Nút ---------- */
const buttons = section('Nút (Button)', 'Biến thể, kích thước, trạng thái đang xử lý. onClick trả Promise thì nút tự khóa – bấm liên tục chỉ gửi một lần.',
  row(Button({ label: 'Mặc định' }), Button({ label: 'Chính', variant: 'primary' }), Button({ label: 'Nguy hiểm', variant: 'danger' }),
    Button({ label: 'Nhẹ', variant: 'ghost' }), Button({ label: 'Nhỏ', size: 'sm' }), Button({ label: 'Vô hiệu', disabled: true }),
    Button({ label: 'Đang xử lý', loading: true })),
  row(Button({ label: 'Gửi (2 giây)', variant: 'primary', loadingLabel: 'Đang gửi…', onClick: async () => { await wait(2000); toast('Đã gửi một lần.', 'ok'); } }),
    Button({ label: '×', ariaLabel: 'Đóng (nút chỉ có biểu tượng cần ariaLabel)', variant: 'ghost' })));

/* ---------- 2. Trạng thái ---------- */
const states = section('Trạng thái (Spinner, Skeleton, EmptyState, ErrorState)', 'Mỗi trạng thái có role phù hợp để trình đọc màn hình thông báo.',
  h('div', { class: 'grid2' },
    h('div', null, h('h3', null, 'Spinner'), Spinner()),
    h('div', null, h('h3', null, 'Skeleton danh sách'), Skeleton({ rows: 3 })),
    h('div', null, h('h3', null, 'Skeleton KPI'), Skeleton({ variant: 'kpis', rows: 3 })),
    h('div', null, h('h3', null, 'Rỗng'), EmptyState({ icon: '📭', title: 'Chưa có công việc nào.', hint: 'Công việc được giao cho bạn sẽ hiện ở đây.', action: Button({ label: 'Tạo công việc', variant: 'primary' }) })),
    h('div', null, h('h3', null, 'Lỗi có mã tham chiếu'), ErrorState({ error: { message: 'Lỗi hệ thống. Mã tham chiếu: 9f3a1c2b.' }, onRetry: () => toast('Thử lại…') }))));

/* ---------- 3. AsyncView ---------- */
const avBox = h('div', { class: 'card', style: 'min-height:140px' });
let mode = 'ok';
const av = AsyncView({
  container: avBox, keepPrevious: true, loading: { variant: 'list', rows: 3 },
  loader: async () => { await wait(900); if (mode === 'error') throw { message: 'Không kết nối được máy chủ.' }; return mode === 'empty' ? [] : TASKS.slice(0, 3); },
  isEmpty: (d) => !d.length, empty: { title: 'Không có kết quả.', hint: 'Thử bỏ bớt bộ lọc.' },
  render: (d) => h('ul', { class: 'plain' }, d.map((t) => h('li', { class: 'row-link' }, t.title, Badge({ label: ST[t.status], tone: 'st-' + t.status }))))
});
const asyncView = section('Vùng dữ liệu bất đồng bộ (AsyncView)', 'Bấm nhanh nhiều lần: chỉ kết quả của lần bấm cuối được vẽ. Có dữ liệu thì giữ nguyên và làm mờ khi tải lại.',
  row(...[['ok', 'Thành công'], ['empty', 'Rỗng'], ['error', 'Lỗi']].map(([m, l]) => Button({ label: l, size: 'sm', onClick: () => { mode = m; return av.reload(); } }))),
  avBox);
av.reload();

/* ---------- 4. DataList + Pagination ---------- */
const listBox = h('div');
const showPage = (page) => {
  const size = 8, items = TASKS.slice((page - 1) * size, page * size);
  mount(listBox,
    DataList({
      caption: 'Danh sách công việc mẫu', rows: items, rowKey: (t) => t.id,
      onRowClick: (t) => toast('Mở ' + t.id),
      columns: [
        { key: 'title', label: 'Công việc', primary: true },
        { key: 'id', label: 'Mã', hideOnMobile: true },
        { key: 'status', label: 'Trạng thái', render: (t) => Badge({ label: ST[t.status], tone: 'st-' + t.status }) },
        { key: 'pct', label: 'Tiến độ', render: (t) => ProgressBar({ value: t.pct, label: 'Tiến độ ' + t.id }) },
        { key: 'due', label: 'Hạn', align: 'end' }
      ]
    }),
    Pagination({ page, pageSize: size, total: TASKS.length, onPage: showPage }));
};
showPage(1);
const dataList = section('Danh sách dữ liệu (DataList) và phân trang', 'Thu hẹp cửa sổ dưới 600px: bảng thành thẻ. Hàng bấm được và dùng được bằng phím Tab + Enter.',
  listBox, h('h3', null, 'Danh sách rỗng'), DataList({ caption: 'Rỗng', rows: [], rowKey: (r) => r.id, columns: [], empty: { title: 'Không có công việc khớp bộ lọc.' } }));

/* ---------- 5. Hiển thị ---------- */
const display = section('Hiển thị (Badge, ProgressBar, Kpi)', 'Giá trị ngoài khoảng được kẹp lại (vd tiến độ 150% hiện 100%).',
  row(Badge({ label: 'Chờ duyệt', tone: 'rv-pending' }), Badge({ label: 'Đã duyệt', tone: 'rv-approved' }), Badge({ label: 'Bị từ chối', tone: 'rv-rejected' }), Badge({ label: 'Ưu tiên cao', tone: 'pr-high' })),
  h('div', { style: 'max-width:320px' }, ProgressBar({ value: 0 }), h('br'), ProgressBar({ value: 65 }), h('br'), ProgressBar({ value: 150 })),
  h('div', { class: 'kpis' }, Kpi({ label: 'Đang thực hiện', value: 12 }), Kpi({ label: 'Quá hạn', value: 3, tone: 'bad', href: '#g-6' }), Kpi({ label: 'Hoàn thành', value: '87%', tone: 'ok', hint: 'trong tháng' })));

/* ---------- 6. Hộp thoại & biểu mẫu ---------- */
const dialogs = section('Hộp thoại', 'Esc hoặc × để đóng; focus trở lại nút đã mở. Trên điện thoại hiện dạng bottom sheet.',
  row(
    Button({ label: 'Hộp thoại thường', onClick: () => { const d = Dialog({ title: 'Thông tin', body: h('p', null, 'Nội dung hộp thoại.'), actions: [Button({ label: 'Đóng', variant: 'primary', onClick: () => d.close() })] }); } }),
    Button({ label: 'Xác nhận nguy hiểm', variant: 'danger', onClick: async () => {
      const yes = await confirm({ title: 'Lưu trữ khách hàng?', message: 'Khách hàng sẽ bị ẩn khỏi danh sách.', okLabel: 'Lưu trữ', danger: true });
      toast(yes ? 'Đã lưu trữ.' : 'Đã hủy.', yes ? 'ok' : 'info');
    } }),
    Button({ label: 'Biểu mẫu', variant: 'primary', onClick: () => FormDialog({
      title: 'Gửi tiến độ', intro: 'Mẫu: nhập "loi" vào Diễn giải để xem lỗi máy chủ gắn vào đúng ô.', submitLabel: 'Gửi',
      fields: [
        { name: 'pct', label: 'Tiến độ lũy kế', type: 'range', min: 0, max: 100, step: 5, value: 40 },
        { name: 'narrative', label: 'Diễn giải', type: 'textarea', required: true, maxlength: 2000, hint: 'Tối thiểu 5 ký tự.', validate: (v) => (v.trim().length < 5 ? 'Diễn giải tối thiểu 5 ký tự.' : null) },
        { name: 'type', label: 'Loại khách hàng', type: 'select', options: [{ value: 'personal', label: 'Cá nhân' }, { value: 'business', label: 'Doanh nghiệp' }] },
        { name: 'rep', label: 'Người đại diện', showIf: (v) => v.type === 'business', required: true },
        { name: 'agree', label: 'Tôi xác nhận số liệu là đúng', type: 'checkbox' }
      ],
      onSubmit: async (v) => {
        await wait(1200);
        if (v.narrative.includes('loi')) throw { message: 'Nội dung chứa từ không hợp lệ.', details: { field: 'narrative' } };
        toast('Đã gửi ' + v.pct + '%.', 'ok');
      }
    }) })));

/* ---------- 7. Toast ---------- */
const toasts = section('Thông báo (toast)', 'Lỗi được đọc ngay (role=alert). Rê chuột hoặc focus vào toast để tạm dừng. Tối đa 4 toast cùng lúc.',
  row(Button({ label: 'Thông tin', onClick: () => toast('Đã lưu bản nháp.') }), Button({ label: 'Thành công', onClick: () => toast('Đã duyệt tiến độ.', 'ok') }),
    Button({ label: 'Lỗi', onClick: () => toast('Không lưu được. Kiểm tra kết nối.', 'error') }),
    Button({ label: 'Có hành động', onClick: () => toast('Đã lưu trữ công việc.', { kind: 'ok', duration: 6000, action: { label: 'Hoàn tác', onClick: () => toast('Đã khôi phục.') } }) })));

/* ---------- 8. Trường nhập liệu độc lập ---------- */
const email = Field({ name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', hint: 'Email Google Workspace.' });
const fields = section('Trường nhập liệu (Field)', 'Nhãn, gợi ý và lỗi được gắn bằng aria-describedby; lỗi đặt aria-invalid.',
  h('div', { style: 'max-width:420px' }, email.el,
    row(Button({ label: 'Kiểm tra', onClick: () => { const msg = email.check() || (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.getValue()) ? null : 'Email không hợp lệ.'); email.setError(msg); if (!msg) toast('Hợp lệ.', 'ok'); else email.input.focus(); } }))));

mount(document.getElementById('main'), h('h1', null, 'Thư viện thành phần'),
  h('p', { class: 'muted' }, 'Ví dụ sử dụng cho js/components. Dữ liệu là dữ liệu tổng hợp.'),
  buttons, states, asyncView, dataList, display, dialogs, toasts, fields);
