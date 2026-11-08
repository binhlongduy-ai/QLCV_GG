import { h } from './dom.js';

/**
 * Thông báo ngắn (toast).
 * @typedef {Object} ToastOptions
 * @property {'info'|'ok'|'error'} [kind='info']
 * @property {number} [duration]   ms; mặc định 3,5 giây (lỗi: 7 giây). 0 = không tự đóng.
 * @property {{ label: string, onClick: () => unknown }} [action]  Một hành động (ví dụ "Hoàn tác").
 * @returns {{ dismiss: () => void }}
 *
 * Khả năng tiếp cận: lỗi đọc ngay (role=alert), thông báo khác đọc lịch sự (role=status).
 * Tạm dừng đếm giờ khi rê chuột hoặc focus vào toast. Tối đa MAX toast cùng lúc (cũ nhất bị bỏ).
 */
const MAX = 4;

function region() {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', class: 'toasts' }); document.body.appendChild(box); }
  return box;
}

export function toast(message, opts) {
  const o = typeof opts === 'string' ? { kind: opts } : (opts || {});
  const kind = o.kind || 'info';
  const box = region();
  while (box.children.length >= MAX) box.firstChild.remove();

  let timer = null, left = o.duration !== undefined ? o.duration : (kind === 'error' ? 7000 : 3500), started = 0;
  const dismiss = () => { clearTimeout(timer); t.remove(); };
  const start = () => { if (left > 0) { started = Date.now(); timer = setTimeout(dismiss, left); } };
  const pause = () => { if (timer) { clearTimeout(timer); timer = null; left -= Date.now() - started; } };

  const t = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-m' }, message),
    o.action && h('button', { class: 'toast-a', type: 'button', onclick: () => { dismiss(); o.action.onClick(); } }, o.action.label),
    h('button', { class: 'toast-x', type: 'button', 'aria-label': 'Đóng thông báo', onclick: dismiss }, '×'));
  t.addEventListener('mouseenter', pause); t.addEventListener('mouseleave', start);
  t.addEventListener('focusin', pause); t.addEventListener('focusout', start);
  box.appendChild(t);
  start();
  return { dismiss };
}
