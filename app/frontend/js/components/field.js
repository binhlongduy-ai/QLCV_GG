import { h, uid, cx } from './dom.js';

/**
 * Trường nhập liệu có nhãn, gợi ý và thông báo lỗi gắn đúng chuẩn ARIA.
 *
 * @typedef {Object} FieldProps
 * @property {string} name
 * @property {string} label
 * @property {'text'|'email'|'tel'|'number'|'date'|'textarea'|'select'|'checkbox'|'range'} [type='text']
 * @property {any} [value]
 * @property {boolean} [required]
 * @property {boolean} [readonly]
 * @property {string} [hint]
 * @property {{ value: string, label: string }[]} [options]   Cho select.
 * @property {number} [min] @property {number} [max] @property {number} [step] @property {number} [maxlength]
 * @property {string} [inputmode] @property {string} [autocomplete] @property {string} [placeholder]
 * @property {(values: Object) => boolean} [showIf]  Dùng bởi FormDialog để ẩn/hiện theo giá trị khác.
 * @property {(value: any) => string|null} [validate] Kiểm tra riêng; trả thông báo lỗi hoặc null.
 * @property {(value: any) => void} [onChange]
 * @returns {FieldApi}
 *
 * @typedef {Object} FieldApi
 * @property {HTMLElement} el                Khối bọc (nhãn + ô + gợi ý + lỗi).
 * @property {HTMLElement} input
 * @property {() => any} getValue
 * @property {(v: any) => void} setValue
 * @property {(msg: string|null) => void} setError   null để xóa lỗi; đặt aria-invalid.
 * @property {(hidden: boolean) => void} setHidden
 * @property {() => boolean} isHidden
 * @property {() => string|null} check        Lỗi bắt buộc/validate của chính trường (không hiện ra).
 */
export function Field(props) {
  const f = props, type = f.type || 'text', id = uid('f-' + f.name);
  const hintId = f.hint ? id + '-h' : null, errId = id + '-e';
  const describedBy = [hintId, errId].filter(Boolean).join(' ');
  const common = {
    id, name: f.name, required: !!f.required && type !== 'checkbox', 'aria-describedby': describedBy,
    'aria-required': f.required && type !== 'checkbox' ? 'true' : null
  };

  let input;
  if (type === 'textarea') input = h('textarea', { ...common, rows: 4, maxlength: f.maxlength, placeholder: f.placeholder, readonly: f.readonly, value: f.value || '' });
  else if (type === 'select') input = h('select', { ...common, disabled: f.readonly, value: f.value || '' }, (f.options || []).map((o) => h('option', { value: o.value }, o.label)));
  else if (type === 'checkbox') input = h('input', { ...common, type: 'checkbox', checked: !!f.value, disabled: f.readonly });
  else {
    input = h('input', {
      ...common, type, readonly: f.readonly, min: f.min, max: f.max, step: f.step, maxlength: f.maxlength,
      inputmode: f.inputmode, autocomplete: f.autocomplete, placeholder: f.placeholder, value: f.value !== undefined ? f.value : ''
    });
  }

  const err = h('div', { class: 'field-err', id: errId, hidden: true });
  const out = type === 'range' ? h('output', { class: 'range-out', for: id, 'aria-live': 'polite' }, '') : null;
  const syncOut = () => { if (out) out.textContent = input.value + '%'; };
  syncOut();

  const label = h('label', { for: id }, f.label, f.required && type !== 'checkbox' && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *'));
  const el = h('div', { class: cx('field', type === 'checkbox' && 'check') },
    type === 'checkbox' ? [input, label] : [label, out, input],
    f.hint && h('div', { class: 'hint', id: hintId }, f.hint), err);

  const getValue = () => (type === 'checkbox' ? input.checked : input.value);
  const onChange = () => { syncOut(); if (!err.hidden) api.setError(null); if (f.onChange) f.onChange(getValue()); };
  input.addEventListener('input', onChange);
  input.addEventListener('change', onChange);

  const api = {
    el, input, getValue,
    setValue: (v) => { if (type === 'checkbox') input.checked = !!v; else input.value = v; syncOut(); },
    setError: (msg) => {
      err.textContent = msg || ''; err.hidden = !msg;
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    },
    setHidden: (hide) => { el.hidden = !!hide; },
    isHidden: () => el.hidden,
    check: () => {
      if (el.hidden) return null;
      const v = getValue();
      if (f.required && type !== 'checkbox' && String(v).trim() === '') return f.label + ' là bắt buộc.';
      return f.validate ? f.validate(v) : null;
    }
  };
  return api;
}
