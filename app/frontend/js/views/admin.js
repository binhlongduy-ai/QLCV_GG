import { h, mount, load, listLoader, emptyState, pager, kpi, badge, fmtDateTime, formDialog, confirmDialog, toast, L, lbl } from '../ui.js';
import * as api from '../api.js';
import { opts, mapOptions } from './shared.js';

const tabs = (active) => h('div', { class: 'tabs' }, [['#/admin', 'Tổng quan', 'home'], ['#/admin/users', 'Người dùng', 'users'], ['#/admin/audit', 'Nhật ký kiểm toán', 'audit'], ['#/admin/system', 'Hệ thống', 'system']]
  .map(([href, text, k]) => h('a', { href, class: k === active ? 'on' : '' }, text)));

export async function adminHomeView(app, root) {
  await load(root, async () => {
    // Số đếm do máy chủ tính trên toàn bộ người dùng; trang chỉ cần 1 dòng.
    const [users, integ] = await Promise.all([api.call('user.list', { pageSize: 1 }), api.call('admin.integrity')]);
    return { users, integ };
  }, ({ users, integ }) => {
    const c = users.counts;
    return h('div', null, h('h1', null, 'Quản trị'), tabs('home'),
      h('div', { class: 'kpis' }, kpi('Người dùng hoạt động', c.active, { href: '#/admin/users' }),
        ...['Admin', 'BGD', 'KSV', 'CBTD'].map((r) => kpi(lbl(L.role, r), c.byRole[r] || 0)),
        kpi('Kiểm tra toàn vẹn', integ.ok ? 'Đạt' : integ.issueCount + ' lỗi', { tone: integ.ok ? 'ok' : 'bad', href: '#/admin/system' })));
  });
}

export async function adminUsersView(app, root) {
  let page = 1, q = '', timer;
  const results = h('div');
  let roles = [];
  const form = (u, done) => formDialog({
    title: u ? 'Sửa người dùng' : 'Thêm người dùng', submitLabel: u ? 'Lưu' : 'Thêm',
    intro: u ? 'Email không đổi được vì được lưu làm bằng chứng trong lịch sử. Không xóa người dùng; chỉ vô hiệu hóa.' : 'Email phải là tài khoản Google đăng nhập của cán bộ.',
    fields: [
      { name: 'email', label: 'Email Google', type: 'email', required: true, value: u && u.email, maxlength: 254, ...(u ? { readonly: true } : {}) },
      { name: 'employeeCode', label: 'Mã cán bộ', type: 'text', required: true, value: u && u.employeeCode, maxlength: 30 },
      { name: 'fullName', label: 'Họ tên', type: 'text', required: true, value: u && u.fullName, maxlength: 200 },
      { name: 'orgUnit', label: 'Đơn vị', type: 'text', required: true, value: u && u.orgUnit, maxlength: 100 },
      { name: 'roleId', label: 'Vai trò', type: 'select', required: true, value: u && u.roleId, options: opts(roles, 'roleId', (r) => lbl(L.role, r.code), '— Chọn vai trò —') },
      u && { name: 'status', label: 'Trạng thái', type: 'select', value: u.status, options: mapOptions(L.ustatus) }
    ].filter(Boolean),
    onSubmit: async (v, { requestId }) => {
      if (u) await api.call('user.update', { userId: u.userId, employeeCode: v.employeeCode, fullName: v.fullName, orgUnit: v.orgUnit, roleId: v.roleId, status: v.status }, { requestId });
      else await api.call('user.create', { email: v.email, employeeCode: v.employeeCode, fullName: v.fullName, orgUnit: v.orgUnit, roleId: v.roleId }, { requestId });
      toast('Đã lưu', 'ok'); done();
    }
  });
  const fetchPage = listLoader(results, () => api.call('user.list', { q, page, pageSize: 20 }), (res) => {
    roles = res.roles;
    return res.total ? h('div', null,
        h('table', { class: 'tbl rwd' }, h('thead', null, h('tr', null, ['Mã', 'Họ tên', 'Email', 'Vai trò', 'Đơn vị', 'Trạng thái', ''].map((x) => h('th', null, x)))),
          h('tbody', null, res.items.map((u) => h('tr', { class: u.status === 'inactive' ? 'muted' : '' },
            h('td', { 'data-label': 'Mã' }, u.employeeCode), h('td', { 'data-label': 'Họ tên' }, u.fullName), h('td', { 'data-label': 'Email', class: 'wrap' }, u.email),
            h('td', { 'data-label': 'Vai trò' }, lbl(L.role, u.roleCode)), h('td', { 'data-label': 'Đơn vị' }, u.orgUnit),
            h('td', { 'data-label': 'Trạng thái' }, badge(lbl(L.ustatus, u.status), u.status === 'active' ? 'st-in_progress' : 'st-not_started')),
            h('td', null, h('button', { class: 'btn sm', onclick: () => form(u, fetchPage) }, 'Sửa')))))),
        pager(res, (p) => { page = p; fetchPage(); })) : emptyState('Không có người dùng nào khớp.');
  });
  mount(root, h('div', null, h('div', { class: 'page-h' }, h('h1', null, 'Quản trị'), h('button', { class: 'btn primary', onclick: () => form(null, fetchPage) }, '+ Thêm người dùng')),
    tabs('users'),
    h('div', { class: 'filters' }, h('label', { class: 'filter grow' }, h('span', null, 'Tìm kiếm'), h('input', { type: 'search', placeholder: 'Tên, email, mã cán bộ…', maxlength: 100,
      oninput: (e) => { clearTimeout(timer); const v = e.target.value; timer = setTimeout(() => { q = v; page = 1; fetchPage(); }, 300); } }))),
    results));
  await fetchPage();
}

export async function adminAuditView(app, root) {
  const f = { action: '', from: '', to: '', page: 1 };
  const results = h('div');
  const fetchPage = listLoader(results, () => api.call('audit.list', { action: f.action, from: f.from, to: f.to, page: f.page, pageSize: 50 }), (res) =>
      res.total ? h('div', null,
        h('table', { class: 'tbl rwd' }, h('thead', null, h('tr', null, ['Thời điểm', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Mã'].map((x) => h('th', null, x)))),
          h('tbody', null, res.items.map((a) => h('tr', null, h('td', { 'data-label': 'Thời điểm' }, fmtDateTime(a.createdAt)), h('td', { 'data-label': 'Người thực hiện', class: 'wrap' }, a.actorEmail),
            h('td', { 'data-label': 'Hành động' }, lbl(L.audit, a.action)), h('td', { 'data-label': 'Đối tượng' }, a.entityType), h('td', { 'data-label': 'Mã' }, a.entityId))))),
        pager(res, (p) => { f.page = p; fetchPage(); })) : emptyState('Không có bản ghi nhật ký nào khớp.'));
  const set = (k) => (e) => { f[k] = e.target.value; f.page = 1; fetchPage(); };
  mount(root, h('div', null, h('h1', null, 'Quản trị'), tabs('audit'),
    h('p', { class: 'muted sm' }, 'Nhật ký chỉ được ghi thêm; không có thao tác sửa hay xóa. Không chứa dữ liệu khách hàng, token hay mật khẩu.'),
    h('div', { class: 'filters' },
      h('label', { class: 'filter' }, h('span', null, 'Hành động'), h('select', { onchange: set('action') }, [h('option', { value: '' }, 'Tất cả'), ...Object.entries(L.audit).map(([k, v]) => h('option', { value: k }, v))])),
      h('label', { class: 'filter' }, h('span', null, 'Từ ngày'), h('input', { type: 'date', onchange: set('from') })),
      h('label', { class: 'filter' }, h('span', null, 'Đến ngày'), h('input', { type: 'date', onchange: set('to') }))),
    results));
  await fetchPage();
}

export async function adminSystemView(app, root) {
  await load(root, () => api.call('admin.integrity'), (integ, reload) => {
    const run = async (action, okMsg, confirm) => {
      if (confirm && !(await confirmDialog(confirm.title, confirm.text, 'Thực hiện'))) return;
      try { const r = await api.call(action); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok'); } catch (e) { toast(e.message, 'error'); }
      reload();
    };
    return h('div', null, h('h1', null, 'Quản trị'), tabs('system'),
      h('div', { class: 'card' }, h('h3', null, 'Kiểm tra toàn vẹn dữ liệu'),
        h('p', { class: integ.ok ? 'notice ok' : 'notice bad' }, integ.ok ? 'Không phát hiện lỗi toàn vẹn.' : integ.issueCount + ' vấn đề cần xử lý.'),
        !integ.ok && h('ul', { class: 'plain' }, integ.issues.map((i) => h('li', null, `${i.table} ${i.id}: ${i.message}`))),
        h('p', { class: 'muted sm' }, 'Kiểm tra lúc ' + fmtDateTime(integ.checkedAt)),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: reload }, 'Kiểm tra lại'),
          !integ.ok && h('button', { class: 'btn', onclick: () => run('admin.reconcile', (r) => `Đã vá ${r.fixed.length} báo cáo`, { title: 'Vá hệ quả duyệt', text: 'Hoàn tất các công việc đã được duyệt 100% nhưng chưa chuyển sang hoàn thành. An toàn khi chạy lại.' }) }, 'Vá hệ quả duyệt dở'))),
      h('div', { class: 'card' }, h('h3', null, 'Sao lưu & khôi phục'),
        h('p', { class: 'muted' }, 'Hệ thống tự sao lưu hằng ngày (nếu đã cài trigger). Bạn có thể sao lưu thủ công ngay bây giờ.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => run('admin.backup', (r) => r.enabled === false ? r.message : 'Đã tạo bản sao lưu ' + r.name) }, 'Sao lưu ngay'),
          h('button', { class: 'btn', onclick: () => run('admin.restore', 'Đã khôi phục') }, 'Khôi phục…')),
        h('p', { class: 'muted sm' }, 'Khôi phục đang bị khóa trên môi trường sản xuất cho tới khi hoàn tất kiểm thử U7 (xem operations-runbook).')),
      h('div', { class: 'card' }, h('h3', null, 'Phiên bản'), h('p', null, `Máy chủ ${app.me.version} · ngày hệ thống ${app.me.today}`)));
  });
}
