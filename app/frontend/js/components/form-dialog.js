import { h } from './dom.js';
import { Dialog } from './dialog.js';
import { Field } from './field.js';
import { Button } from './button.js';

/**
 * Hộp thoại biểu mẫu: kiểm tra phía trình duyệt, gửi, và hiện lỗi máy chủ ngay dưới đúng ô.
 *
 * @typedef {Object} FormDialogProps
 * @property {string} title
 * @property {import('./field.js').FieldProps[]} fields
 * @property {(values: Object, meta: { requestId?: string }) => Promise<unknown>} onSubmit
 *   Ném lỗi có `details.field` để gắn lỗi vào ô tương ứng; lỗi khác hiện ở băng lỗi đầu biểu mẫu.
 * @property {string} [submitLabel='Lưu']
 * @property {string} [intro]
 * @property {string} [requestId]  Một mã cho cả biểu mẫu: gửi lại sau lỗi mạng không tạo bản ghi thứ hai.
 * @returns {{ el: HTMLElement, close: () => void }}
 *
 * Trường hợp biên: bấm gửi nhiều lần (khóa trong lúc gửi, không cho đóng), ô bị ẩn bởi showIf không bị bắt buộc,
 * lỗi máy chủ trỏ tới ô đang ẩn (hiện ở băng lỗi), đóng thành công chỉ sau khi onSubmit hoàn tất.
 */
export function FormDialog(p) {
  const banner = h('div', { class: 'form-err', role: 'alert', tabindex: '-1', hidden: true });
  const form = h('form', { novalidate: true, class: 'form' });
  const fields = p.fields.map((spec) => ({ spec, api: Field({ ...spec, onChange: () => refresh() }) }));
  const byName = Object.fromEntries(fields.map((x) => [x.spec.name, x.api]));

  const values = () => Object.fromEntries(fields.map((x) => [x.spec.name, x.api.getValue()]));
  function refresh() {
    const v = values();
    fields.forEach((x) => { if (x.spec.showIf) x.api.setHidden(!x.spec.showIf(v)); });
  }
  fields.forEach((x) => form.appendChild(x.api.el));
  refresh();

  const label = p.submitLabel || 'Lưu';
  const submit = Button({ label, variant: 'primary', type: 'submit', loadingLabel: 'Đang lưu…' });
  const cancel = Button({ label: 'Hủy', onClick: () => d.close() });
  const d = Dialog({
    title: p.title,
    body: [p.intro && h('p', { class: 'muted' }, p.intro), banner, form],
    actions: [cancel, submit],
    initialFocus: () => { const first = fields.find((x) => x.spec.type !== 'range' && !x.api.isHidden()); return first && first.api.input; }
  });
  // Nút gửi nằm ở chân hộp thoại, ngoài <form>: chuyển thành requestSubmit để dùng chung đường kiểm tra.
  submit.addEventListener('click', (e) => { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); });

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    banner.hidden = true;
    fields.forEach((x) => x.api.setError(null));
    for (const x of fields) {
      const msg = x.api.check();
      if (msg) { x.api.setError(msg); x.api.input.focus(); return; }
    }
    sending = true; submit.setLoading(true); cancel.disabled = true; d.setBusy(true);
    try {
      await p.onSubmit(values(), { requestId: p.requestId });
      d.setBusy(false); d.close();
    } catch (err) {
      const target = err && err.details && byName[err.details.field];
      if (target && !target.isHidden()) { target.setError(err.message); target.input.focus(); }
      else { banner.textContent = (err && err.message) || 'Không lưu được.'; banner.hidden = false; banner.focus(); }
    } finally {
      sending = false;
      if (submit.isConnected) { submit.setLoading(false); cancel.disabled = false; d.setBusy(false); }
    }
  });
  return { el: d.el, close: d.close };
}
