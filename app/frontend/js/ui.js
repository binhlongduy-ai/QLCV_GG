// Thư viện UI nhỏ, không phụ thuộc framework. Quy ước an toàn: dữ liệu luôn vào DOM qua textContent
// (h() chuyển chuỗi thành text node) – không dùng innerHTML với dữ liệu để chặn XSS.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let pendingValue;
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') pendingValue = v;          // đặt sau khi có <option>
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  if (pendingValue !== undefined) el.value = pendingValue;
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...nodes) { clear(el); nodes.forEach((n) => n && el.appendChild(n)); return el; }

/* ---------- Nhãn tiếng Việt cho mã nghiệp vụ (mã lưu trữ là tiếng Anh snake_case) ---------- */
export const L = {
  status: { not_started: 'Chưa làm', in_progress: 'Đang thực hiện', completed: 'Đã hoàn thành' },
  priority: { high: 'Cao', normal: 'Bình thường', low: 'Thấp' },
  review: { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối' },
  ctype: { personal: 'Cá nhân', business: 'Doanh nghiệp' },
  cstatus: { new: 'Mới', managed: 'Đang quản lý' },
  ustatus: { active: 'Hoạt động', inactive: 'Vô hiệu hóa' },
  role: { Admin: 'Quản trị', BGD: 'Ban Giám đốc', KSV: 'Kiểm soát viên', CBTD: 'Cán bộ tín dụng' },
  assign: { primary: 'Phụ trách chính', collaborator: 'Phối hợp' },
  audit: {
    'user.create': 'Tạo người dùng', 'user.update': 'Sửa người dùng', 'customer.create': 'Tạo khách hàng',
    'customer.update': 'Sửa khách hàng', 'customer.archive': 'Lưu trữ khách hàng', 'customer.restore': 'Khôi phục khách hàng',
    'task.create': 'Tạo công việc', 'task.assign': 'Phân công', 'task.transfer': 'Chuyển giao', 'task.update': 'Sửa công việc',
    'task.start': 'Bắt đầu công việc', 'task.archive': 'Lưu trữ công việc', 'task.restore': 'Khôi phục công việc',
    'progress.submit': 'Gửi tiến độ', 'progress.approve': 'Duyệt tiến độ', 'progress.reject': 'Từ chối tiến độ',
    'task.auto_complete': 'Tự động hoàn thành', 'admin.backup': 'Sao lưu', 'admin.reconcile': 'Vá dữ liệu'
  }
};
export const lbl = (map, k) => (map && map[k]) || k || '';

/* ---------- Định dạng ---------- */
export function fmtDate(ymd) {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const todayYmd = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

/* ---------- Thành phần ---------- */
export function badge(text, kind) { return h('span', { class: 'badge ' + (kind || '') }, text); }
export const statusBadge = (s) => badge(lbl(L.status, s), 'st-' + s);
export const priorityBadge = (p) => badge(lbl(L.priority, p), 'pr-' + p);
export const reviewBadge = (s) => badge(lbl(L.review, s), 'rv-' + s);

export function kpi(label, value, opts = {}) {
  const el = h('div', { class: 'kpi' + (opts.tone ? ' ' + opts.tone : '') + (opts.href ? ' link' : '') },
    h('div', { class: 'kpi-v' }, value), h('div', { class: 'kpi-l' }, label), opts.hint && h('div', { class: 'kpi-h' }, opts.hint));
  if (opts.href) { el.tabIndex = 0; el.setAttribute('role', 'link'); const go = () => { location.hash = opts.href; }; el.onclick = go; el.onkeydown = (e) => { if (e.key === 'Enter') go(); }; }
  return el;
}

export function spinner(text) { return h('div', { class: 'state', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'spin' }), text || 'Đang tải…'); }

export function emptyState(title, hint, action) {
  return h('div', { class: 'state empty' }, h('div', { class: 'state-t' }, title), hint && h('div', { class: 'state-h' }, hint), action);
}

export function errorState(err, retry) {
  const ref = /Mã tham chiếu: (\w+)/.exec(err.message || '');
  return h('div', { class: 'state error', role: 'alert' },
    h('div', { class: 'state-t' }, err.message || 'Đã xảy ra lỗi.'),
    h('div', { class: 'state-h' }, 'Nếu sự cố tiếp diễn, hãy báo quản trị viên' + (ref ? ' kèm mã ' + ref[1] : '') + '.'),
    retry && h('button', { class: 'btn', onclick: retry }, 'Thử lại'));
}

/** Tải dữ liệu rồi vẽ; có trạng thái đang tải và lỗi + nút thử lại (R14). */
export async function load(root, loader, render) {
  const run = async () => {
    mount(root, spinner());
    try { const data = await loader(); mount(root, render(data, run)); }
    catch (e) { if (e.code === 'UNAUTHENTICATED') return; mount(root, errorState(e, run)); }
  };
  return run();
}

export function pager(res, onPage) {
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  if (pages <= 1) return h('div', { class: 'pager' }, h('span', { class: 'muted' }, `${res.total} bản ghi`));
  return h('div', { class: 'pager' },
    h('button', { class: 'btn sm', disabled: res.page <= 1, onclick: () => onPage(res.page - 1) }, '‹ Trước'),
    h('span', { class: 'muted' }, `Trang ${res.page}/${pages} · ${res.total} bản ghi`),
    h('button', { class: 'btn sm', disabled: res.page >= pages, onclick: () => onPage(res.page + 1) }, 'Sau ›'));
}

/* ---------- Toast ---------- */
export function toast(msg, kind) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(box); }
  const t = h('div', { class: 'toast ' + (kind || '') }, msg);
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}

/* ---------- Hộp thoại ---------- */
export function dialog({ title, body, actions }) {
  const dlg = h('dialog', { class: 'dlg', 'aria-label': title });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.appendChild(h('div', { class: 'dlg-h' }, h('h2', null, title), h('button', { class: 'icon', 'aria-label': 'Đóng', onclick: close }, '×')));
  dlg.appendChild(h('div', { class: 'dlg-b' }, body));
  if (actions && actions.length) dlg.appendChild(h('div', { class: 'dlg-f' }, actions));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

export function confirmDialog(title, message, okLabel, danger) {
  return new Promise((resolve) => {
    const d = dialog({
      title, body: h('p', null, message),
      actions: [h('button', { class: 'btn', onclick: () => { d.close(); resolve(false); } }, 'Hủy'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { d.close(); resolve(true); } }, okLabel || 'Đồng ý')]
    });
  });
}

/**
 * Hộp thoại biểu mẫu. fields: [{name,label,type,required,options,value,hint,min,max,maxlength,showIf(values)}]
 * onSubmit(values) trả Promise; ném ApiError có details.field để hiện lỗi ngay dưới ô nhập.
 */
export function formDialog({ title, fields, submitLabel, onSubmit, intro }) {
  const wraps = {}, inputs = {}, errs = {};
  const banner = h('div', { class: 'form-err', role: 'alert', hidden: true });
  const form = h('form', { novalidate: true, class: 'form' });

  const values = () => {
    const v = {};
    fields.forEach((f) => {
      const el = inputs[f.name];
      v[f.name] = f.type === 'checkbox' ? el.checked : el.value;
    });
    return v;
  };
  const refresh = () => {
    const v = values();
    fields.forEach((f) => { if (f.showIf) wraps[f.name].hidden = !f.showIf(v); });
    fields.forEach((f) => { if (f.type === 'range') errs[f.name + '__out'].textContent = inputs[f.name].value + '%'; });
  };

  fields.forEach((f) => {
    const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 7);
    let input;
    const common = { id, name: f.name, required: !!f.required && f.type !== 'checkbox', 'aria-describedby': id + '_e' };
    if (f.type === 'textarea') input = h('textarea', { ...common, rows: 4, maxlength: f.maxlength, value: f.value || '' });
    else if (f.type === 'select') {
      input = h('select', { ...common, value: f.value || '' }, (f.options || []).map((o) => h('option', { value: o.value }, o.label)));
    } else if (f.type === 'checkbox') input = h('input', { ...common, type: 'checkbox', checked: !!f.value });
    else input = h('input', { ...common, type: f.type || 'text', readonly: f.readonly, min: f.min, max: f.max, maxlength: f.maxlength, step: f.step, inputmode: f.inputmode, value: f.value !== undefined ? f.value : '' });
    input.addEventListener('input', refresh); input.addEventListener('change', refresh);
    inputs[f.name] = input;
    errs[f.name] = h('div', { class: 'field-err', id: id + '_e', hidden: true });
    const out = f.type === 'range' ? (errs[f.name + '__out'] = h('output', { class: 'range-out' }, '')) : null;
    wraps[f.name] = h('div', { class: 'field' + (f.type === 'checkbox' ? ' check' : '') },
      f.type === 'checkbox' ? [input, h('label', { for: id }, f.label)]
        : [h('label', { for: id }, f.label, f.required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')), out, input],
      f.hint && h('div', { class: 'hint' }, f.hint), errs[f.name]);
    form.appendChild(wraps[f.name]);
  });
  refresh();

  const submit = h('button', { class: 'btn primary', type: 'submit' }, submitLabel || 'Lưu');
  const d = dialog({ title, body: [intro && h('p', { class: 'muted' }, intro), banner, form],
    actions: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Hủy'), submit] });
  submit.onclick = (e) => { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    banner.hidden = true;
    Object.values(errs).forEach((x) => { x.hidden = true; });
    const v = values();
    for (const f of fields) {
      if (f.required && f.type !== 'checkbox' && !wraps[f.name].hidden && String(v[f.name]).trim() === '') {
        errs[f.name].textContent = f.label + ' là bắt buộc.'; errs[f.name].hidden = false; inputs[f.name].focus(); return;
      }
    }
    submit.disabled = true; submit.textContent = 'Đang lưu…';
    try { await onSubmit(v); d.close(); }
    catch (err) {
      const fld = err.details && err.details.field;
      if (fld && errs[fld]) { errs[fld].textContent = err.message; errs[fld].hidden = false; inputs[fld].focus(); }
      else { banner.textContent = err.message || 'Không lưu được.'; banner.hidden = false; }
      submit.disabled = false; submit.textContent = submitLabel || 'Lưu';
    }
  });
  setTimeout(() => { const first = fields.find((f) => f.type !== 'range' && !wraps[f.name].hidden); if (first) inputs[first.name].focus(); }, 30);
  return d;
}
