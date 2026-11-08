import { h, load, emptyState, pager, fmtDate, fmtDateTime, badge } from '../ui.js';
import * as api from '../api.js';
import { approve, reject } from './shared.js';

export async function reviewsView(app, root) {
  let page = 1;
  const run = () => load(root, () => api.call('progress.pending', { page, pageSize: 20 }), (res, reload) => {
    const done = () => { reload(); app.refreshBell(); };
    return h('div', null,
      h('div', { class: 'page-h' }, h('h1', null, 'Báo cáo tiến độ chờ duyệt'), h('span', { class: 'muted' }, res.total + ' báo cáo')),
      res.items.length
        ? h('div', { class: 'cards' }, res.items.map((u) => h('article', { class: 'card review' },
          h('div', { class: 'rv-h' },
            h('div', null, h('a', { href: '#/tasks/' + u.taskId }, u.task ? u.task.taskCode + ' · ' + u.task.title : u.taskId),
              h('div', { class: 'muted sm' }, 'Gửi bởi ' + u.submittedBy.name + ' · ' + fmtDateTime(u.submittedAt) + (u.task ? ' · hạn ' + fmtDate(u.task.dueAt) : ''))),
            h('div', { class: 'rv-pct' }, u.progressPct + '%', u.progressPct === 100 && badge('Hoàn thành khi duyệt', 'st-completed'))),
          h('p', { class: 'tl-n' }, u.narrative),
          u.ownSubmission
            ? h('div', { class: 'muted sm' }, 'Báo cáo do bạn gửi — cần người khác duyệt.')
            : h('div', { class: 'actions' },
              h('button', { class: 'btn primary', onclick: () => approve(u, done) }, 'Duyệt'),
              h('button', { class: 'btn danger', onclick: () => reject(u, done) }, 'Từ chối')))))
        : emptyState('Không có báo cáo nào đang chờ duyệt.', 'Khi cán bộ gửi tiến độ mới, báo cáo sẽ xuất hiện ở đây và bạn sẽ nhận thông báo.'),
      pager(res, (p) => { page = p; run(); }));
  });
  await run();
}
