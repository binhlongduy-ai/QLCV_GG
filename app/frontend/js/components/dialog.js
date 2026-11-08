import { h, uid, cx, focusables } from './dom.js';
import { Button } from './button.js';

/**
 * Hộp thoại modal. Trên màn hình hẹp (điện thoại) hiển thị dạng bottom sheet (xem CSS .dlg).
 *
 * @typedef {Object} DialogProps
 * @property {string} title
 * @property {Node|Node[]} body
 * @property {Node[]} [actions]             Nút ở chân hộp thoại.
 * @property {'sm'|'md'|'lg'} [size='md']
 * @property {boolean} [dismissible=true]   Cho phép đóng bằng Esc, nút ×, bấm ra nền.
 * @property {() => void} [onClose]         Gọi đúng một lần khi đóng (bằng bất kỳ cách nào).
 * @property {HTMLElement|(() => HTMLElement)} [initialFocus]  Mặc định: phần tử nhận focus đầu tiên trong thân.
 * @returns {{ el: HTMLElement, close: () => void, setBusy: (on: boolean) => void }}
 *
 * Khả năng tiếp cận: aria-labelledby trỏ tới tiêu đề; focus vào trong khi mở, bẫy focus,
 * trả focus về phần tử đã mở hộp thoại khi đóng. setBusy(true) chặn đóng khi đang lưu.
 * Trình duyệt không có showModal (iOS Safari < 15.4): dùng role=dialog + aria-modal và bẫy focus thủ công.
 */
export function Dialog(props) {
  const p = props, titleId = uid('dlg-t'), dismissible = p.dismissible !== false;
  const opener = document.activeElement;
  const native = typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype;
  const dlg = h(native ? 'dialog' : 'div', {
    class: cx('dlg', 'dlg-' + (p.size || 'md'), !native && 'dlg-fallback'),
    'aria-labelledby': titleId, role: native ? null : 'dialog', 'aria-modal': native ? null : 'true'
  });
  let closed = false, busy = false;

  const close = () => {
    if (closed) return;
    closed = true;
    if (native && dlg.open) dlg.close();
    dlg.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    if (p.onClose) p.onClose();
  };
  const tryDismiss = () => { if (dismissible && !busy) close(); };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); tryDismiss(); return; }
    if (e.key === 'Tab' && !native) {       // bẫy focus thủ công khi không có <dialog> modal
      const f = focusables(dlg);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };

  const closeBtn = dismissible && h('button', { class: 'icon dlg-x', type: 'button', 'aria-label': 'Đóng', onclick: tryDismiss }, '×');
  dlg.append(h('div', { class: 'dlg-h' }, h('h2', { id: titleId }, p.title), closeBtn), h('div', { class: 'dlg-b' }, p.body));
  if (p.actions && p.actions.length) dlg.append(h('div', { class: 'dlg-f' }, p.actions));

  if (native) {
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); tryDismiss(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) tryDismiss(); });   // bấm ra nền
  }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(dlg);
  if (native) dlg.showModal(); else dlg.classList.add('open');

  // Chọn focus sau một nhịp: người gọi đã nhận được đối tượng trả về, và phần tử đã hiển thị.
  setTimeout(() => {
    if (closed) return;
    const target = typeof p.initialFocus === 'function' ? p.initialFocus() : p.initialFocus;
    const first = target || focusables(dlg.querySelector('.dlg-b'))[0] || focusables(dlg)[0];
    if (first) first.focus();
  }, 0);

  return {
    el: dlg, close,
    setBusy: (on) => { busy = !!on; dlg.setAttribute('aria-busy', busy ? 'true' : 'false'); if (closeBtn) closeBtn.disabled = busy; }
  };
}

/**
 * Hộp thoại xác nhận. Trả về Promise<boolean>; đóng bằng Esc/× được tính là "không đồng ý".
 * @param {{ title: string, message: string|Node, okLabel?: string, cancelLabel?: string, danger?: boolean }} p
 */
export function confirm(p) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (!answered) { answered = true; resolve(v); } d.close(); };
    const ok = Button({ label: p.okLabel || 'Đồng ý', variant: p.danger ? 'danger' : 'primary', onClick: () => answer(true) });
    const d = Dialog({
      title: p.title, size: 'sm',
      body: typeof p.message === 'string' ? h('p', null, p.message) : p.message,
      actions: [Button({ label: p.cancelLabel || 'Hủy', onClick: () => answer(false) }), ok],
      // Hành động nguy hiểm: focus mặc định vào "Hủy" để Enter không vô tình xác nhận.
      initialFocus: () => (p.danger ? d.el.querySelector('.dlg-f .btn') : ok),
      onClose: () => { if (!answered) { answered = true; resolve(false); } }
    });
  });
}
