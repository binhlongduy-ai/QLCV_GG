// Nền DOM cho thư viện thành phần. Không phụ thuộc framework.
// Quy ước an toàn: dữ liệu luôn vào DOM qua text node (h() chuyển chuỗi thành text node);
// không dùng innerHTML với dữ liệu để chặn XSS.

/**
 * Tạo phần tử. props: thuộc tính HTML; `class`, `dataset`, `value`, `onX` (sự kiện) được xử lý riêng.
 * Giá trị null/undefined/false bị bỏ qua; true -> thuộc tính rỗng. kids: chuỗi, Node, mảng lồng nhau.
 */
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
export function mount(el, ...nodes) { clear(el); nodes.flat().forEach((n) => n && el.appendChild(n)); return el; }

let seq = 0;
/** Mã duy nhất trong trang, dùng cho id/aria-* (không dùng Math.random để id ổn định khi kiểm thử). */
export const uid = (prefix) => (prefix || 'c') + '-' + (++seq).toString(36);

/** Nối các lớp CSS, bỏ giá trị rỗng. */
export const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Chỉ đọc cho trình đọc màn hình, ẩn khỏi giao diện. */
export const srOnly = (text) => h('span', { class: 'sr-only' }, text);

/** Người dùng muốn giảm chuyển động (tôn trọng cài đặt hệ điều hành). */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Các phần tử có thể nhận focus bên trong root (dùng cho bẫy focus của hộp thoại). */
export function focusables(root) {
  return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
}
