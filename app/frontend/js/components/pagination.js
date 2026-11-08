import { h } from './dom.js';
import { Button } from './button.js';

/**
 * Phân trang.
 * @typedef {Object} PaginationProps
 * @property {number} page        Trang hiện tại (bắt đầu từ 1).
 * @property {number} pageSize
 * @property {number} total       Tổng số bản ghi.
 * @property {(page: number) => unknown} onPage
 * @property {string} [label='Phân trang']  Tên vùng điều hướng cho trình đọc màn hình.
 * Trường hợp biên: total = 0 hoặc chỉ một trang → chỉ hiện tổng số; page ngoài khoảng được kẹp lại.
 */
export function Pagination(p) {
  const size = Math.max(1, p.pageSize || 1), total = Math.max(0, p.total || 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, p.page || 1), pages);
  const summary = h('span', { class: 'muted', 'aria-live': 'polite' },
    pages <= 1 ? `${total} bản ghi` : `Trang ${page}/${pages} · ${total} bản ghi`);
  if (pages <= 1) return h('div', { class: 'pager' }, summary);
  return h('nav', { class: 'pager', 'aria-label': p.label || 'Phân trang' },
    Button({ label: '‹ Trước', size: 'sm', ariaLabel: 'Trang trước', disabled: page <= 1, onClick: () => p.onPage(page - 1) }),
    summary,
    Button({ label: 'Sau ›', size: 'sm', ariaLabel: 'Trang sau', disabled: page >= pages, onClick: () => p.onPage(page + 1) }));
}
