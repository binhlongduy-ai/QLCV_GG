import { h, mount, load, spinner, errorState, emptyState, pager, statusBadge, priorityBadge, fmtDate, formDialog, confirmDialog, badge, toast, L, lbl } from '../ui.js';
import * as api from '../api.js';
import { opts } from './shared.js';

function customerForm(app, c, onDone) {
  const edit = !!c;
  formDialog({
    title: edit ? 'Sửa khách hàng' : 'Thêm khách hàng', submitLabel: edit ? 'Lưu' : 'Thêm',
    intro: 'Không nhập dư nợ hay thông tin tín dụng chi tiết vào hệ thống này.',
    fields: [
      { name: 'name', label: 'Tên khách hàng', type: 'text', required: true, maxlength: 200, value: c && c.name },
      { name: 'type', label: 'Loại khách hàng', type: 'select', required: true, value: c ? c.type : 'personal', options: opts(Object.entries(L.ctype).map(([k, v]) => ({ k, v })), 'k', 'v') },
      // R17: chỉ hiện khi là doanh nghiệp
      { name: 'companyRepresentative', label: 'Người đại diện công ty', type: 'text', maxlength: 200, value: c && c.companyRepresentative, showIf: (v) => v.type === 'business' },
      { name: 'phone', label: 'Số điện thoại', type: 'tel', required: true, maxlength: 20, value: c && c.phone, inputmode: 'tel' },
      { name: 'status', label: 'Nhóm khách hàng', type: 'select', value: c ? c.status : 'new', options: opts(Object.entries(L.cstatus).map(([k, v]) => ({ k, v })), 'k', 'v') },
      !edit && { name: 'customerCode', label: 'Mã khách hàng (để trống để tự sinh)', type: 'text', maxlength: 30 }
    ].filter(Boolean),
    onSubmit: async (v) => {
      const p = { name: v.name, type: v.type, phone: v.phone, status: v.status, companyRepresentative: v.type === 'business' ? v.companyRepresentative : '' };
      if (edit) await api.call('customer.update', { customerId: c.customerId, ...p });
      else await api.call('customer.create', { ...p, customerCode: v.customerCode || undefined });
      toast(edit ? 'Đã lưu' : 'Đã thêm khách hàng', 'ok'); onDone();
    }
  });
}

export async function customerListView(app, root) {
  const f = { q: '', type: '', page: 1 };
  const results = h('div');
  let timer;
  const fetchPage = async () => {
    mount(results, spinner());
    try {
      const res = await api.call('customer.list', { q: f.q, type: f.type, page: f.page, pageSize: 20 });
      mount(results, res.total ? h('div', null,
        h('table', { class: 'tbl rwd' }, h('thead', null, h('tr', null, ['Mã', 'Tên', 'Loại', 'Điện thoại', 'Nhóm'].map((x) => h('th', null, x)))),
          h('tbody', null, res.items.map((c) => h('tr', null,
            h('td', { 'data-label': 'Mã' }, h('a', { href: '#/customers/' + c.customerId }, c.customerCode)),
            h('td', { 'data-label': 'Tên', class: 'wrap' }, h('a', { href: '#/customers/' + c.customerId }, c.name)),
            h('td', { 'data-label': 'Loại' }, lbl(L.ctype, c.type)), h('td', { 'data-label': 'Điện thoại' }, c.phone),
            h('td', { 'data-label': 'Nhóm' }, lbl(L.cstatus, c.status)))))),
        pager(res, (p) => { f.page = p; fetchPage(); }))
        : emptyState(f.q || f.type ? 'Không có khách hàng nào khớp.' : 'Không có khách hàng nào bạn được phép xem.',
          app.me.role.code === 'CBTD' ? 'Bạn chỉ thấy khách hàng gắn với công việc được giao cho mình.' : app.can('customer.maintain') ? 'Hãy thêm khách hàng đầu tiên.' : null));
    } catch (e) { if (e.code !== 'UNAUTHENTICATED') mount(results, errorState(e, fetchPage)); }
  };
  mount(root, h('div', null,
    h('div', { class: 'page-h' }, h('h1', null, 'Khách hàng'),
      app.can('customer.maintain') && h('button', { class: 'btn primary', onclick: () => customerForm(app, null, fetchPage) }, '+ Thêm khách hàng')),
    h('div', { class: 'filters' },
      h('label', { class: 'filter grow' }, h('span', null, 'Tìm kiếm'), h('input', { type: 'search', placeholder: 'Tên, mã, điện thoại…', maxlength: 100,
        oninput: (e) => { clearTimeout(timer); const v = e.target.value; timer = setTimeout(() => { f.q = v; f.page = 1; fetchPage(); }, 300); } })),
      h('label', { class: 'filter' }, h('span', null, 'Loại'), h('select', { onchange: (e) => { f.type = e.target.value; f.page = 1; fetchPage(); } },
        [{ value: '', label: 'Tất cả' }, ...Object.entries(L.ctype).map(([value, label]) => ({ value, label }))].map((o) => h('option', { value: o.value }, o.label))))),
    results));
  await fetchPage();
}

export async function customerDetailView(app, root, [customerId]) {
  await load(root, () => api.call('customer.get', { customerId }), ({ customer: c, tasks }, reload) => h('div', null,
    h('a', { class: 'back', href: '#/customers' }, '‹ Khách hàng'),
    h('div', { class: 'page-h' }, h('div', null, h('div', { class: 'muted' }, c.customerCode), h('h1', null, c.name)),
      h('div', { class: 'actions' },
        app.can('customer.maintain') && !c.archived && h('button', { class: 'btn', onclick: () => customerForm(app, c, reload) }, 'Sửa'),
        app.can('customer.delete') && h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirmDialog(c.archived ? 'Khôi phục khách hàng' : 'Lưu trữ khách hàng', c.archived ? 'Khôi phục khách hàng này?' : 'Khách hàng sẽ ẩn khỏi danh sách (không xóa cứng). Chỉ thực hiện được khi không còn công việc chưa hoàn thành.', 'Đồng ý', !c.archived))) return;
          try { await api.call('customer.archive', { customerId, archived: !c.archived }); toast('Đã cập nhật', 'ok'); } catch (e) { toast(e.message, 'error'); }
          reload();
        } }, c.archived ? 'Khôi phục' : 'Lưu trữ'))),
    c.archived && h('div', { class: 'notice' }, 'Khách hàng này đã được lưu trữ.'),
    h('div', { class: 'card' }, h('dl', { class: 'metas' },
      h('div', { class: 'meta' }, h('dt', null, 'Loại'), h('dd', null, lbl(L.ctype, c.type))),
      c.type === 'business' && h('div', { class: 'meta' }, h('dt', null, 'Người đại diện'), h('dd', null, c.companyRepresentative || '—')),
      h('div', { class: 'meta' }, h('dt', null, 'Điện thoại'), h('dd', null, c.phone)),
      h('div', { class: 'meta' }, h('dt', null, 'Nhóm'), h('dd', null, lbl(L.cstatus, c.status))))),
    h('div', { class: 'card' }, h('h3', null, 'Công việc liên quan'),
      tasks.length ? h('div', { class: 'list' }, tasks.map((t) => h('a', { class: 'row-link', href: '#/tasks/' + t.taskId },
        h('div', { class: 'rl-main' }, h('div', { class: 'rl-t' }, t.taskCode + ' · ' + t.title), h('div', { class: 'muted sm' }, t.primary ? t.primary.name : '')),
        h('div', { class: 'rl-side' }, priorityBadge(t.priority), statusBadge(t.status), h('span', { class: t.overdue ? 'due late' : 'due' }, 'Hạn ' + fmtDate(t.dueAt))))))
        : emptyState('Chưa có công việc nào gắn với khách hàng này.'))));
}
