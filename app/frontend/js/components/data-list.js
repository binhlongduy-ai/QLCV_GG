import { h, cx } from './dom.js';
import { EmptyState } from './state.js';

/**
 * Danh sách dữ liệu thích ứng: bảng trên màn hình rộng, thẻ xếp dọc trên điện thoại (CSS .dl).
 * Mỗi ô mang data-label = tên cột để khi thành thẻ vẫn đọc được "Cột: giá trị".
 *
 * @typedef {Object} Column
 * @property {string} key
 * @property {string} label
 * @property {(row: any) => (string|Node)} [render]  Mặc định: row[key].
 * @property {'start'|'end'} [align='start']
 * @property {boolean} [primary]   Cột chính: hiện như tiêu đề thẻ trên điện thoại.
 * @property {boolean} [hideOnMobile]
 *
 * @typedef {Object} DataListProps
 * @property {Column[]} columns
 * @property {any[]} rows
 * @property {(row: any) => string} rowKey
 * @property {string} caption              Mô tả bảng cho trình đọc màn hình (ẩn khỏi giao diện).
 * @property {(row: any) => unknown} [onRowClick]  Hàng bấm/Enter được; hàng nhận focus bằng bàn phím.
 * @property {(row: any) => string} [rowLabel]     Nhãn ARIA cho hàng bấm được (mặc định: cột primary).
 * @property {(row: any) => string} [rowClass]
 * @property {{ title: string, hint?: string, action?: Node }} [empty]
 */
const textOf = (v) => (v instanceof Node ? v.textContent : String(v === null || v === undefined ? '' : v)).trim();

export function DataList(p) {
  if (!p.rows || !p.rows.length) return EmptyState(p.empty || { title: 'Không có dữ liệu.' });
  const primary = p.columns.find((c) => c.primary) || p.columns[0];
  const cell = (c, row) => {
    const v = c.render ? c.render(row) : row[c.key];
    return h('td', { class: cx(c.align === 'end' && 'num', c.primary && 'dl-primary', c.hideOnMobile && 'dl-hide-m'), 'data-label': c.label },
      v === null || v === undefined || v === '' ? '—' : v);
  };
  const tr = (row) => {
    const clickable = !!p.onRowClick;
    const el = h('tr', {
      class: cx(clickable && 'dl-click', p.rowClass && p.rowClass(row)),
      dataset: { key: p.rowKey(row) },
      tabindex: clickable ? '0' : null,
      'aria-label': clickable ? (p.rowLabel ? p.rowLabel(row) : textOf(primary.render ? primary.render(row) : row[primary.key])) : null
    }, p.columns.map((c) => cell(c, row)));
    if (clickable) {
      el.addEventListener('click', (e) => { if (!e.target.closest('a,button,input,select,textarea')) p.onRowClick(row); });
      el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); p.onRowClick(row); } });
    }
    return el;
  };
  return h('div', { class: 'dl-wrap' }, h('table', { class: 'tbl dl' },
    h('caption', { class: 'sr-only' }, p.caption),
    h('thead', null, h('tr', null, p.columns.map((c) => h('th', { scope: 'col', class: cx(c.align === 'end' && 'num', c.hideOnMobile && 'dl-hide-m') }, c.label)))),
    h('tbody', null, p.rows.map(tr))));
}
