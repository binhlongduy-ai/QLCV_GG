import { h, cx } from './dom.js';
import { Button } from './button.js';

/**
 * Các trạng thái của một vùng dữ liệu: đang tải (vòng xoay / khung xương), rỗng, lỗi.
 * Mọi trạng thái đều có vai trò ARIA phù hợp để trình đọc màn hình thông báo.
 */

/** @param {{ label?: string }} [p] */
export function Spinner(p) {
  return h('div', { class: 'state', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'spin', 'aria-hidden': 'true' }), (p && p.label) || 'Đang tải…');
}

/**
 * Khung xương: giữ chỗ đúng hình dạng nội dung để tránh nhảy bố cục khi dữ liệu về.
 * @param {{ rows?: number, variant?: 'list'|'cards'|'kpis', label?: string }} [p]
 */
export function Skeleton(p) {
  const o = p || {}, rows = Math.max(1, Math.min(o.rows || 4, 12)), variant = o.variant || 'list';
  const item = () => variant === 'kpis'
    ? h('div', { class: 'sk sk-kpi' })
    : h('div', { class: cx('sk-row', variant === 'cards' && 'sk-card') }, h('div', { class: 'sk sk-line w60' }), h('div', { class: 'sk sk-line w35' }));
  return h('div', { class: cx('skeleton', 'sk-' + variant), role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' },
    h('span', { class: 'sr-only' }, o.label || 'Đang tải…'),
    Array.from({ length: rows }, item));
}

/**
 * @param {{ title: string, hint?: string, action?: Node, icon?: string }} p
 */
export function EmptyState(p) {
  return h('div', { class: 'state empty', role: 'status' },
    p.icon && h('div', { class: 'state-i', 'aria-hidden': 'true' }, p.icon),
    h('div', { class: 'state-t' }, p.title), p.hint && h('div', { class: 'state-h' }, p.hint), p.action);
}

/**
 * Lỗi kèm hướng khôi phục (R14). Tách mã tham chiếu của máy chủ để người dùng báo cho quản trị viên.
 * @param {{ error: { message?: string, code?: string }, onRetry?: () => unknown, retryLabel?: string }} p
 */
export function ErrorState(p) {
  const err = p.error || {};
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const ref = /Mã tham chiếu: (\w+)/.exec(err.message || '');
  const title = offline ? 'Không có kết nối mạng.' : (err.message || 'Đã xảy ra lỗi.');
  const hint = offline ? 'Kiểm tra kết nối rồi thử lại.' : 'Nếu sự cố tiếp diễn, hãy báo quản trị viên' + (ref ? ' kèm mã ' + ref[1] : '') + '.';
  return h('div', { class: 'state error', role: 'alert' },
    h('div', { class: 'state-t' }, title), h('div', { class: 'state-h' }, hint),
    p.onRetry && Button({ label: p.retryLabel || 'Thử lại', onClick: p.onRetry }));
}
