import { h, cx } from './dom.js';

/**
 * Nút bấm.
 * @typedef {Object} ButtonProps
 * @property {string|Node} label              Nội dung hiển thị.
 * @property {'default'|'primary'|'danger'|'ghost'} [variant='default']
 * @property {'md'|'sm'} [size='md']
 * @property {'button'|'submit'} [type='button']
 * @property {boolean} [disabled]
 * @property {boolean} [loading]              Hiện vòng xoay, khóa nút, đặt aria-busy.
 * @property {string} [loadingLabel]          Nhãn khi đang xử lý (mặc định "Đang xử lý…").
 * @property {string} [ariaLabel]             Bắt buộc khi label chỉ là biểu tượng.
 * @property {string} [className]
 * @property {(e: Event) => (void|Promise<unknown>)} [onClick]
 *   Nếu trả về Promise, nút tự chuyển sang trạng thái đang xử lý cho tới khi Promise kết thúc
 *   (chống bấm hai lần gửi trùng).
 * @returns {HTMLButtonElement & { setLoading(on: boolean): void }}
 */
export function Button(props) {
  const p = props || {};
  const label = h('span', { class: 'btn-l' }, p.label);
  const btn = h('button', {
    type: p.type || 'button',
    class: cx('btn', p.variant && p.variant !== 'default' && p.variant, p.size === 'sm' && 'sm', p.className),
    'aria-label': p.ariaLabel,
    disabled: !!p.disabled
  }, label);

  let busy = false;
  btn.setLoading = (on) => {
    busy = !!on;
    btn.classList.toggle('loading', busy);
    btn.disabled = busy || !!p.disabled;
    if (busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    label.textContent = '';
    label.append(busy ? (p.loadingLabel || 'Đang xử lý…') : p.label);
  };
  if (p.loading) btn.setLoading(true);

  if (p.onClick) {
    btn.addEventListener('click', async (e) => {
      if (busy) { e.preventDefault(); return; }
      const r = p.onClick(e);
      if (r && typeof r.then === 'function') {
        btn.setLoading(true);
        try { await r; } finally { if (btn.isConnected) btn.setLoading(false); }
      }
    });
  }
  return btn;
}
