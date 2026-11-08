import { h, load, emptyState, pager, fmtDateTime, toast } from '../ui.js';
import * as api from '../api.js';

const ICON = { task_assigned: '📌', progress_submitted: '📝', progress_approved: '✅', progress_rejected: '⚠️', task_completed: '🏁' };

function target(app, n) {
  const id = n.sourceRecordId;
  if (id.startsWith('TSK-')) return '#/tasks/' + id;
  if (id.startsWith('UPD-')) return n.eventType === 'progress_submitted' && app.can('progress.review') ? '#/reviews' : '#/tasks';
  return '#/tasks';
}

export async function notificationsView(app, root) {
  let page = 1, unreadOnly = false;
  const run = () => load(root, () => api.call('notification.list', { page, pageSize: 20, unreadOnly }), (res, reload) => h('div', null,
    h('div', { class: 'page-h' }, h('h1', null, 'Thông báo'),
      h('div', { class: 'actions' },
        h('label', { class: 'filter check' }, h('input', { type: 'checkbox', checked: unreadOnly, onchange: (e) => { unreadOnly = e.target.checked; page = 1; run(); } }), h('span', null, 'Chỉ chưa đọc')),
        h('button', { class: 'btn', disabled: !res.unread, onclick: async () => { try { await api.call('notification.markAllRead'); toast('Đã đánh dấu tất cả là đã đọc', 'ok'); } catch (e) { toast(e.message, 'error'); } app.refreshBell(); reload(); } }, 'Đánh dấu đã đọc tất cả'))),
    res.items.length
      ? h('div', { class: 'card list' }, res.items.map((n) => h('a', { class: 'row-link notif' + (n.readAt ? '' : ' unread'), href: target(app, n),
        onclick: async () => { if (!n.readAt) { try { await api.call('notification.markRead', { ids: [n.notificationId] }); app.refreshBell(); } catch (e) { /* bỏ qua */ } } } },
        h('span', { class: 'n-i', 'aria-hidden': 'true' }, ICON[n.eventType] || '🔔'),
        h('div', { class: 'rl-main' }, h('div', { class: 'rl-t' }, n.message), h('div', { class: 'muted sm' }, fmtDateTime(n.createdAt))),
        !n.readAt && h('span', { class: 'dotnew', 'aria-label': 'chưa đọc' }))))
      : emptyState(unreadOnly ? 'Không còn thông báo chưa đọc.' : 'Bạn chưa có thông báo nào.', 'Thông báo về giao việc và duyệt tiến độ sẽ hiện ở đây.'),
    pager(res, (p) => { page = p; run(); })));
  await run();
}
