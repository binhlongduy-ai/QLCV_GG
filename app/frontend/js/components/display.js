import { h, cx } from './dom.js';

/**
 * Thành phần hiển thị nhỏ, không có trạng thái.
 */

/** Nhãn trạng thái. tone khớp lớp CSS sẵn có (vd 'st-completed', 'pr-high', 'rv-pending'). */
export function Badge(p) { return h('span', { class: cx('badge', p.tone) }, p.label); }

/**
 * Thanh tiến độ có vai trò progressbar (trình đọc màn hình đọc được giá trị).
 * @param {{ value: number, label?: string, max?: number }} p  value ngoài [0, max] được kẹp lại.
 */
export function ProgressBar(p) {
  const max = p.max || 100, v = Math.max(0, Math.min(max, Number(p.value) || 0)), pct = Math.round(v * 100 / max);
  return h('div', {
    class: 'pbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(v),
    'aria-label': p.label || 'Tiến độ'
  }, h('div', { style: `width:${pct}%` }), h('span', { 'aria-hidden': 'true' }, pct + '%'));
}

/**
 * Ô số liệu (KPI). Có href thì là liên kết thật (<a>): dùng được bằng bàn phím, mở tab mới, đọc đúng vai trò.
 * @param {{ label: string, value: string|number, hint?: string, tone?: 'ok'|'warn'|'bad', href?: string }} p
 */
export function Kpi(p) {
  const kids = [h('div', { class: 'kpi-v' }, p.value), h('div', { class: 'kpi-l' }, p.label), p.hint && h('div', { class: 'kpi-h' }, p.hint)];
  return p.href
    ? h('a', { class: cx('kpi', 'link', p.tone), href: p.href }, kids)
    : h('div', { class: cx('kpi', p.tone) }, kids);
}
