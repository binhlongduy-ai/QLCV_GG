import { h, mount, load, kpi, emptyState, statusBadge, priorityBadge, fmtDate, lbl, L } from '../ui.js';
import * as api from '../api.js';

function taskRow(t) {
  return h('a', { class: 'row-link', href: '#/tasks/' + t.taskId },
    h('div', { class: 'rl-main' }, h('div', { class: 'rl-t' }, t.taskCode + ' · ' + t.title), h('div', { class: 'muted sm' }, (t.customer ? t.customer.name : '') + (t.primary ? ' · ' + t.primary.name : ''))),
    h('div', { class: 'rl-side' }, priorityBadge(t.priority), statusBadge(t.status), h('span', { class: t.overdue ? 'due late' : 'due' }, 'Hạn ' + fmtDate(t.dueAt) + (t.overdue ? ' (quá hạn)' : ''))));
}

function statusBar(byStatus) {
  const total = byStatus.reduce((s, x) => s + x.count, 0);
  if (!total) return null;
  return h('div', { class: 'card' }, h('h3', null, 'Phân bổ theo trạng thái'),
    h('div', { class: 'stack', role: 'img', 'aria-label': byStatus.map((x) => `${lbl(L.status, x.status)}: ${x.count}`).join(', ') },
      byStatus.filter((x) => x.count).map((x) => h('div', { class: 'seg st-' + x.status, style: `flex:${x.count}` }, x.count))),
    h('div', { class: 'legend' }, byStatus.map((x) => h('span', null, h('i', { class: 'dot st-' + x.status }), lbl(L.status, x.status) + ' (' + x.count + ')'))));
}

export async function dashboardView(app, root) {
  const isDirectorView = app.can('dashboard.view_director');
  await load(root, async () => {
    const [d, dir] = await Promise.all([api.call('dashboard.get'), isDirectorView ? api.call('dashboard.director') : null]);
    return { d, dir };
  }, ({ d, dir }) => {
    const k = d.kpis, scoped = app.me.role.code === 'CBTD';
    const cards = scoped
      ? [kpi('Đến hạn hôm nay', k.dueToday, { tone: k.dueToday ? 'warn' : '', href: '#/tasks' }), kpi('Đang thực hiện', k.inProgress, { href: '#/tasks' }),
        kpi('Quá hạn', k.overdue, { tone: k.overdue ? 'bad' : '', href: '#/tasks' }), kpi('Đã hoàn thành', k.completed)]
      : [kpi('Tổng công việc', k.total, { href: '#/tasks' }), kpi('Đang thực hiện', k.inProgress), kpi('Quá hạn', k.overdue, { tone: k.overdue ? 'bad' : '' }),
        kpi('Tỷ lệ hoàn thành', k.completionRate + '%', { hint: k.completed + '/' + k.total }),
        k.pendingReviews !== undefined && kpi('Chờ duyệt', k.pendingReviews, { tone: k.pendingReviews ? 'warn' : '', href: '#/reviews' }),
        kpi('Khách hàng', k.customers, { href: '#/customers' })];

    const body = [h('h1', null, 'Tổng quan'), h('div', { class: 'kpis' }, cards)];
    if (!k.total) body.push(emptyState('Không có công việc nào trong phạm vi bạn được xem.',
      scoped ? 'Bạn chưa được phân công. Hãy liên hệ KSV, hoặc tạo công việc nếu bạn là người phụ trách chính.' : 'Hãy tạo công việc đầu tiên.',
      app.can('task.create') && h('a', { class: 'btn primary', href: '#/tasks/new' }, 'Tạo công việc')));
    else {
      const grid = h('div', { class: 'grid2' }, statusBar(d.byStatus));
      if (d.byAssignee && d.byAssignee.length) {
        grid.appendChild(h('div', { class: 'card' }, h('h3', null, 'Khối lượng theo cán bộ phụ trách (việc đang mở)'),
          h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Cán bộ'), h('th', { class: 'num' }, 'Đang mở'), h('th', { class: 'num' }, 'Quá hạn'))),
            h('tbody', null, d.byAssignee.map((r) => h('tr', null, h('td', { 'data-label': 'Cán bộ' }, r.name), h('td', { class: 'num', 'data-label': 'Đang mở' }, r.open),
              h('td', { class: 'num' + (r.overdue ? ' late' : ''), 'data-label': 'Quá hạn' }, r.overdue)))))));
      }
      body.push(grid);
      if (dir) {
        body.push(h('section', { class: 'card' },
          h('h3', null, 'Công việc ưu tiên cần chỉ đạo'),
          h('p', { class: 'muted sm' }, `Mức ưu tiên cao hoặc quá hạn, chưa hoàn thành — ${dir.total} việc (${dir.highOpen} ưu tiên cao, ${dir.overdue} quá hạn).`),
          dir.items.length ? h('div', { class: 'list' }, dir.items.map(taskRow)) : emptyState('Không có công việc ưu tiên hoặc quá hạn.', 'Mọi việc đang theo kế hoạch.')));
      }
      body.push(h('section', { class: 'card' }, h('h3', null, 'Sắp đến hạn'),
        d.upcoming.length ? h('div', { class: 'list' }, d.upcoming.map(taskRow)) : emptyState('Không có việc đang mở.')));
    }
    return h('div', null, body);
  });
}
