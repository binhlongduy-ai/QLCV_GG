import { h, toast, confirmDialog, formDialog, reviewBadge, fmtDateTime, badge } from '../ui.js';
import * as api from '../api.js';

export const opts = (items, value, label, blank) =>
  (blank ? [{ value: '', label: blank }] : []).concat(items.map((i) => ({ value: i[value], label: typeof label === 'function' ? label(i) : i[label] })));

export async function approve(u, done) {
  const msg = `Duyệt báo cáo tiến độ ${u.progressPct}% của ${u.submittedBy.name}?` +
    (u.progressPct === 100 ? ' Công việc sẽ tự động chuyển sang "Đã hoàn thành" và không thể mở lại.' : '');
  if (!(await confirmDialog('Duyệt tiến độ', msg, 'Duyệt'))) return;
  try { await api.call('progress.review', { updateId: u.updateId, decision: 'approve' }); toast('Đã duyệt tiến độ', 'ok'); done(); }
  catch (e) { toast(e.message, 'error'); done(); }
}

export function reject(u, done) {
  formDialog({
    title: 'Từ chối báo cáo tiến độ', submitLabel: 'Từ chối',
    intro: 'Lý do sẽ được hiển thị cho cán bộ gửi báo cáo; báo cáo vẫn được lưu trong lịch sử.',
    fields: [{ name: 'comment', label: 'Lý do từ chối', type: 'textarea', required: true, maxlength: 1000 }],
    onSubmit: async (v) => { await api.call('progress.review', { updateId: u.updateId, decision: 'reject', comment: v.comment }); toast('Đã từ chối báo cáo', 'ok'); done(); }
  });
}

/** Một mục trên dòng thời gian tiến độ. */
export function updateItem(app, u, done) {
  const canReview = app.can('progress.review') && u.reviewStatus === 'pending';
  const own = u.submittedBy.userId === app.me.user.userId;
  return h('li', { class: 'tl-item rv-' + u.reviewStatus },
    h('div', { class: 'tl-h' }, h('strong', null, u.progressPct + '%'), reviewBadge(u.reviewStatus),
      h('span', { class: 'muted sm' }, u.submittedBy.name + ' · ' + fmtDateTime(u.submittedAt))),
    h('p', { class: 'tl-n' }, u.narrative),
    u.reviewedBy && h('div', { class: 'muted sm' }, (u.reviewStatus === 'approved' ? 'Duyệt bởi ' : 'Từ chối bởi ') + u.reviewedBy.name + ' · ' + fmtDateTime(u.reviewedAt) +
      (u.reviewComment ? ' — ' + u.reviewComment : '')),
    canReview && (own
      ? h('div', { class: 'muted sm' }, 'Báo cáo do bạn gửi — cần người khác duyệt.')
      : h('div', { class: 'actions' }, h('button', { class: 'btn sm primary', onclick: () => approve(u, done) }, 'Duyệt'),
        h('button', { class: 'btn sm danger', onclick: () => reject(u, done) }, 'Từ chối'))));
}

export function progressBar(pct) {
  return h('div', { class: 'pbar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Tiến độ đã duyệt' },
    h('div', { style: `width:${pct}%` }), h('span', null, pct + '%'));
}

export { badge };
