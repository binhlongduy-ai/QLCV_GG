import { h, mount, load, spinner, errorState, emptyState, pager, statusBadge, priorityBadge, fmtDate, fmtDateTime, todayYmd, formDialog, confirmDialog, toast, L, lbl } from '../ui.js';
import * as api from '../api.js';
import { opts, updateItem, progressBar } from './shared.js';

/* ---------- Danh sách ---------- */
export async function taskListView(app, root, _p, query, afterRender) {
  const scoped = app.me.role.code === 'CBTD';
  const f = { q: '', status: query.status || '', priority: query.priority || '', overdue: query.overdue === '1', mine: false, page: 1 };
  const results = h('div');
  let timer;

  const fetchPage = async () => {
    mount(results, spinner());
    try {
      const res = await api.call('task.list', { q: f.q, status: f.status, priority: f.priority, overdue: f.overdue, mine: f.mine, page: f.page, pageSize: 20 });
      mount(results, renderResults(res));
    } catch (e) { if (e.code !== 'UNAUTHENTICATED') mount(results, errorState(e, fetchPage)); }
  };
  const set = (k, v) => { f[k] = v; f.page = 1; fetchPage(); };

  function renderResults(res) {
    if (!res.total) {
      const filtered = f.q || f.status || f.priority || f.overdue || f.mine;
      return emptyState(filtered ? 'Không có công việc nào khớp bộ lọc.' : 'Không có công việc nào bạn được phép xem.',
        filtered ? 'Thử bỏ bớt bộ lọc.' : scoped ? 'Bạn chưa được phân công. Hãy liên hệ KSV, hoặc tạo công việc nếu bạn là người phụ trách chính.' : 'Hãy tạo công việc đầu tiên.',
        !filtered && app.can('task.create') && h('a', { class: 'btn primary', href: '#/tasks/new' }, 'Tạo công việc'));
    }
    return h('div', null,
      h('table', { class: 'tbl rwd' },
        h('thead', null, h('tr', null, ['Mã', 'Công việc', 'Khách hàng', 'Phụ trách', 'Ưu tiên', 'Trạng thái', 'Hạn', 'Tiến độ'].map((c) => h('th', null, c)))),
        h('tbody', null, res.items.map((t) => h('tr', { class: t.overdue ? 'late-row' : '' },
          h('td', { 'data-label': 'Mã' }, h('a', { href: '#/tasks/' + t.taskId }, t.taskCode)),
          h('td', { 'data-label': 'Công việc', class: 'wrap' }, h('a', { href: '#/tasks/' + t.taskId }, t.title), t.pendingUpdates ? h('span', { class: 'chip' }, t.pendingUpdates + ' chờ duyệt') : null),
          h('td', { 'data-label': 'Khách hàng' }, t.customer ? t.customer.name : '—'),
          h('td', { 'data-label': 'Phụ trách' }, t.primary ? t.primary.name : '—'),
          h('td', { 'data-label': 'Ưu tiên' }, priorityBadge(t.priority)),
          h('td', { 'data-label': 'Trạng thái' }, statusBadge(t.status)),
          h('td', { 'data-label': 'Hạn', class: t.overdue ? 'late' : '' }, fmtDate(t.dueAt) + (t.overdue ? ' · quá hạn' : '')),
          h('td', { 'data-label': 'Tiến độ' }, progressBar(t.approvedProgress)))))),
      pager(res, (p) => { f.page = p; fetchPage(); }));
  }

  const select = (name, label, o) => h('label', { class: 'filter' }, h('span', null, label),
    h('select', { onchange: (e) => set(name, e.target.value), value: f[name] }, o.map((x) => h('option', { value: x.value }, x.label))));

  mount(root, h('div', null,
    h('div', { class: 'page-h' }, h('h1', null, scoped ? 'Công việc của tôi' : 'Công việc'),
      app.can('task.create') && h('a', { class: 'btn primary', href: '#/tasks/new' }, '+ Tạo công việc')),
    h('div', { class: 'filters' },
      h('label', { class: 'filter grow' }, h('span', null, 'Tìm kiếm'), h('input', { type: 'search', placeholder: 'Mã, tiêu đề, khách hàng…', value: f.q, maxlength: 100,
        oninput: (e) => { clearTimeout(timer); const v = e.target.value; timer = setTimeout(() => set('q', v), 300); } })),
      select('status', 'Trạng thái', [{ value: '', label: 'Tất cả' }, ...Object.entries(L.status).map(([value, label]) => ({ value, label }))]),
      select('priority', 'Ưu tiên', [{ value: '', label: 'Tất cả' }, ...Object.entries(L.priority).map(([value, label]) => ({ value, label }))]),
      h('label', { class: 'filter check' }, h('input', { type: 'checkbox', checked: f.overdue, onchange: (e) => set('overdue', e.target.checked) }), h('span', null, 'Quá hạn')),
      !scoped && h('label', { class: 'filter check' }, h('input', { type: 'checkbox', onchange: (e) => set('mine', e.target.checked) }), h('span', null, 'Của tôi'))),
    results));
  await fetchPage();
  if (afterRender) afterRender();
}

/* ---------- Tạo mới (mở hộp thoại trên nền danh sách) ---------- */
export async function taskNewView(app, root, p, query) {
  await taskListView(app, root, p, query, async () => {
    try {
      const [cust, users] = await Promise.all([api.call('customer.list', { pageSize: 100 }), api.call('user.options')]);
      const scoped = app.me.role.code === 'CBTD';
      if (!cust.items.length) { toast('Chưa có khách hàng nào để gắn công việc. Hãy nhờ KSV tạo khách hàng trước.', 'error'); app.go('#/tasks'); return; }
      const d = formDialog({
        title: 'Tạo công việc', submitLabel: 'Tạo công việc',
        intro: scoped ? 'Bạn sẽ là người phụ trách chính của công việc này.' : null,
        fields: [
          { name: 'customerId', label: 'Khách hàng', type: 'select', required: true, options: opts(cust.items, 'customerId', (c) => `${c.name} (${c.customerCode})`, '— Chọn khách hàng —'),
            hint: cust.total > cust.items.length ? `Đang hiển thị ${cust.items.length}/${cust.total} khách hàng đầu theo tên.` : null },
          { name: 'title', label: 'Tiêu đề', type: 'text', required: true, maxlength: 200 },
          { name: 'description', label: 'Mô tả', type: 'textarea', maxlength: 2000 },
          { name: 'priority', label: 'Mức ưu tiên', type: 'select', value: 'normal', options: opts(Object.entries(L.priority).map(([k, v]) => ({ k, v })), 'k', 'v') },
          { name: 'dueAt', label: 'Hạn xử lý', type: 'date', required: true, min: todayYmd() },
          { name: 'primaryUserId', label: 'Cán bộ phụ trách chính', type: 'select', required: true, value: scoped ? app.me.user.userId : '',
            options: opts(users.items, 'userId', (u) => `${u.fullName} (${u.employeeCode})`, scoped ? undefined : '— Chọn cán bộ —') },
          !scoped && { name: 'collaboratorUserId', label: 'Cán bộ phối hợp (tùy chọn)', type: 'select', options: opts(users.items, 'userId', (u) => `${u.fullName} (${u.employeeCode})`, '— Không —') }
        ].filter(Boolean),
        onSubmit: async (v) => {
          const r = await api.call('task.create', { customerId: v.customerId, title: v.title, description: v.description, priority: v.priority,
            dueAt: v.dueAt, primaryUserId: v.primaryUserId || undefined, collaboratorUserId: v.collaboratorUserId || undefined });
          toast('Đã tạo công việc ' + r.task.taskCode, 'ok');
          app.go('#/tasks/' + r.task.taskId);
        }
      });
      d.el.addEventListener('close', () => { if (location.hash.startsWith('#/tasks/new')) app.go('#/tasks'); });
    } catch (e) { toast(e.message, 'error'); app.go('#/tasks'); }
  });
}

/* ---------- Chi tiết ---------- */
export async function taskDetailView(app, root, [taskId]) {
  await load(root, () => api.call('task.get', { taskId }), (d, reload) => {
    const t = d.task, can = d.can;
    const act = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg, 'ok'); } catch (e) { toast(e.message, 'error'); } reload(); };

    const buttons = [
      can.start && h('button', { class: 'btn primary', onclick: () => act(() => api.call('task.start', { taskId }), 'Đã chuyển sang Đang thực hiện') }, 'Bắt đầu thực hiện'),
      can.submitProgress && h('button', { class: 'btn primary', onclick: () => submitProgress(t, reload) }, 'Gửi tiến độ'),
      can.edit && h('button', { class: 'btn', onclick: () => editTask(t, reload) }, 'Sửa'),
      can.transfer && h('button', { class: 'btn', onclick: () => transfer(t, reload) }, 'Chuyển giao người chính'),
      can.edit && h('button', { class: 'btn', onclick: () => collaborator(t, reload) }, 'Người phối hợp'),
      can.archive && h('button', { class: 'btn', onclick: async () => { if (await confirmDialog(t.archived ? 'Khôi phục công việc' : 'Lưu trữ công việc',
        t.archived ? 'Khôi phục công việc này?' : 'Công việc sẽ ẩn khỏi danh sách mặc định nhưng lịch sử vẫn được giữ.', 'Đồng ý')) act(() => api.call('task.archive', { taskId, archived: !t.archived }), t.archived ? 'Đã khôi phục' : 'Đã lưu trữ'); } }, t.archived ? 'Khôi phục' : 'Lưu trữ')
    ].filter(Boolean);

    const meta = (k, v) => h('div', { class: 'meta' }, h('dt', null, k), h('dd', null, v));
    return h('div', null,
      h('a', { class: 'back', href: '#/tasks' }, '‹ Danh sách công việc'),
      h('div', { class: 'page-h' }, h('div', null, h('div', { class: 'muted' }, t.taskCode), h('h1', null, t.title)), h('div', { class: 'actions' }, buttons)),
      t.archived && h('div', { class: 'notice' }, 'Công việc này đã được lưu trữ.'),
      t.status === 'completed' && h('div', { class: 'notice ok' }, 'Đã hoàn thành lúc ' + fmtDateTime(t.completedAt) + '. Đây là trạng thái cuối, không thể mở lại.'),
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('h3', null, 'Thông tin'),
          h('dl', { class: 'metas' },
            meta('Trạng thái', statusBadge(t.status)), meta('Ưu tiên', priorityBadge(t.priority)),
            meta('Hạn xử lý', h('span', { class: t.overdue ? 'late' : '' }, fmtDate(t.dueAt) + (t.overdue ? ' · quá hạn' : ''))),
            meta('Khách hàng', t.customer ? (app.can('customer.view') ? h('a', { href: '#/customers/' + t.customer.customerId }, `${t.customer.name} (${t.customer.code})`) : t.customer.name) : '—'),
            meta('Người tạo', t.createdBy.name), meta('Tạo lúc', fmtDateTime(t.createdAt))),
          t.description && h('p', { class: 'desc' }, t.description),
          h('h4', null, 'Tiến độ đã được duyệt'), progressBar(t.approvedProgress)),
        h('div', { class: 'card' }, h('h3', null, 'Phân công'),
          h('ul', { class: 'plain' }, d.assignments.map((a) => h('li', { class: a.active ? '' : 'muted' },
            a.name + ' — ' + lbl(L.assign, a.role) + (a.active ? '' : ' (đã gỡ)') + ' · từ ' + fmtDateTime(a.assignedAt)))))),
      h('div', { class: 'card' }, h('h3', null, 'Lịch sử tiến độ'),
        d.updates.length ? h('ol', { class: 'timeline' }, d.updates.map((u) => updateItem(app, u, reload)))
          : emptyState('Chưa có báo cáo tiến độ.', can.submitProgress ? 'Bấm "Gửi tiến độ" để báo cáo kết quả.' : null)));
  });

  function submitProgress(t, reload) {
    formDialog({
      title: 'Gửi báo cáo tiến độ', submitLabel: 'Gửi báo cáo',
      intro: 'Tiến độ là phần trăm lũy kế (0–100). Báo cáo sau khi gửi không thể sửa; cần bổ sung thì gửi báo cáo mới.',
      fields: [
        { name: 'progressPct', label: 'Tiến độ lũy kế', type: 'range', min: 0, max: 100, step: 1, value: t.approvedProgress, required: true },
        { name: 'narrative', label: 'Diễn giải kết quả', type: 'textarea', required: true, maxlength: 2000 }
      ],
      onSubmit: async (v) => { await api.call('progress.submit', { taskId: t.taskId, progressPct: Number(v.progressPct), narrative: v.narrative }); toast('Đã gửi báo cáo, chờ KSV duyệt', 'ok'); reload(); }
    });
  }

  function editTask(t, reload) {
    formDialog({
      title: 'Sửa công việc',
      fields: [
        { name: 'title', label: 'Tiêu đề', type: 'text', required: true, value: t.title, maxlength: 200 },
        { name: 'description', label: 'Mô tả', type: 'textarea', value: t.description, maxlength: 2000 },
        { name: 'priority', label: 'Mức ưu tiên', type: 'select', value: t.priority, options: opts(Object.entries(L.priority).map(([k, v]) => ({ k, v })), 'k', 'v') },
        { name: 'dueAt', label: 'Hạn xử lý', type: 'date', required: true, value: t.dueAt },
        { name: 'status', label: 'Trạng thái', type: 'select', value: t.status, hint: 'Trạng thái "Đã hoàn thành" chỉ được đặt tự động khi duyệt tiến độ 100%.',
          options: opts([['not_started', 'Chưa làm'], ['in_progress', 'Đang thực hiện']].map(([k, v]) => ({ k, v })), 'k', 'v') }
      ],
      onSubmit: async (v) => { await api.call('task.update', { taskId: t.taskId, title: v.title, description: v.description, priority: v.priority, dueAt: v.dueAt, status: v.status }); toast('Đã lưu', 'ok'); reload(); }
    });
  }

  async function pickUsers() { return (await api.call('user.options')).items; }

  async function transfer(t, reload) {
    const users = (await pickUsers()).filter((u) => !t.primary || u.userId !== t.primary.userId);
    formDialog({
      title: 'Chuyển giao người phụ trách chính', submitLabel: 'Chuyển giao',
      intro: 'Người mới sẽ nhận thông báo. Nếu người đó đang phối hợp, họ sẽ chuyển thành người chính.',
      fields: [{ name: 'newPrimaryUserId', label: 'Cán bộ nhận việc', type: 'select', required: true, options: opts(users, 'userId', (u) => `${u.fullName} (${u.employeeCode})`, '— Chọn cán bộ —') }],
      onSubmit: async (v) => { await api.call('task.transfer', { taskId: t.taskId, newPrimaryUserId: v.newPrimaryUserId }); toast('Đã chuyển giao', 'ok'); reload(); }
    });
  }

  async function collaborator(t, reload) {
    const users = (await pickUsers()).filter((u) => !t.primary || u.userId !== t.primary.userId);
    formDialog({
      title: 'Người phối hợp',
      fields: [{ name: 'userId', label: 'Cán bộ phối hợp', type: 'select', value: t.collaborator ? t.collaborator.userId : '', options: opts(users, 'userId', (u) => `${u.fullName} (${u.employeeCode})`, '— Không có —') }],
      onSubmit: async (v) => { await api.call('task.setCollaborator', { taskId: t.taskId, userId: v.userId || null }); toast('Đã cập nhật', 'ok'); reload(); }
    });
  }
}
