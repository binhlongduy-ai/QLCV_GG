import { h, mount, clear, spinner, errorState, toast, lbl, L, badge } from './ui.js';
import * as api from './api.js';
import * as auth from './auth.js';
import { dashboardView } from './views/dashboard.js';
import { taskListView, taskDetailView, taskNewView } from './views/tasks.js';
import { reviewsView } from './views/reviews.js';
import { customerListView, customerDetailView } from './views/customers.js';
import { notificationsView } from './views/notifications.js';
import { adminHomeView, adminUsersView, adminAuditView, adminSystemView } from './views/admin.js';

const CFG = window.QLCV_CONFIG || {};
const $app = document.getElementById('app');
let me = null;
let bellTimer = null;

/* ---------- Định tuyến theo hash ---------- */
const ROUTES = [
  { re: /^dashboard$/, perm: 'dashboard.view', view: dashboardView, nav: 'dashboard' },
  { re: /^tasks$/, perm: 'task.view', view: taskListView, nav: 'tasks' },
  { re: /^tasks\/new$/, perm: 'task.create', view: taskNewView, nav: 'tasks' },
  { re: /^tasks\/([\w-]+)$/, perm: 'task.view', view: taskDetailView, nav: 'tasks' },
  { re: /^reviews$/, perm: 'progress.review', view: reviewsView, nav: 'reviews' },
  { re: /^customers$/, perm: 'customer.view', view: customerListView, nav: 'customers' },
  { re: /^customers\/([\w-]+)$/, perm: 'customer.view', view: customerDetailView, nav: 'customers' },
  { re: /^notifications$/, perm: 'notification.view', view: notificationsView, nav: 'notifications' },
  { re: /^admin$/, perm: 'user.manage', view: adminHomeView, nav: 'admin' },
  { re: /^admin\/users$/, perm: 'user.manage', view: adminUsersView, nav: 'admin' },
  { re: /^admin\/audit$/, perm: 'audit.view', view: adminAuditView, nav: 'admin' },
  { re: /^admin\/system$/, perm: 'user.manage', view: adminSystemView, nav: 'admin' }
];

const NAV = [
  { key: 'dashboard', label: 'Tổng quan', hash: '#/dashboard', perm: 'dashboard.view' },
  { key: 'tasks', label: 'Công việc', hash: '#/tasks', perm: 'task.view' },
  { key: 'reviews', label: 'Duyệt tiến độ', hash: '#/reviews', perm: 'progress.review' },
  { key: 'customers', label: 'Khách hàng', hash: '#/customers', perm: 'customer.view' },
  { key: 'notifications', label: 'Thông báo', hash: '#/notifications', perm: 'notification.view' },
  { key: 'admin', label: 'Quản trị', hash: '#/admin', perm: 'user.manage' }
];

const app = {
  get me() { return me; },
  can: (p) => !!me && me.permissions.includes(p),
  go: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  refreshBell
};

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const query = {};
  new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
  return { path: path.replace(/\/$/, ''), query };
}

let shell = null;
function route() {
  if (!me) return;
  const { path, query } = parseHash();
  if (!path) { location.replace('#/' + me.startView); return; }
  let hit = null, params = [];
  for (const r of ROUTES) { const m = r.re.exec(path); if (m) { hit = r; params = m.slice(1); break; } }
  const main = shell.main;
  if (!hit) {
    mount(main, h('div', { class: 'state empty' }, h('div', { class: 'state-t' }, 'Không tìm thấy trang'),
      h('a', { class: 'btn', href: '#/' + me.startView }, 'Về trang chính')));
    return;
  }
  if (!app.can(hit.perm)) {
    mount(main, h('div', { class: 'state error', role: 'alert' }, h('div', { class: 'state-t' }, 'Bạn không có quyền truy cập màn hình này.'),
      h('div', { class: 'state-h' }, 'Liên hệ quản trị viên nếu bạn cần quyền này.'), h('a', { class: 'btn', href: '#/' + me.startView }, 'Về trang chính')));
    return;
  }
  shell.nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.key === hit.nav));
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  Promise.resolve(hit.view(app, main, params, query)).catch((e) => {
    if (e.code !== 'UNAUTHENTICATED') mount(main, errorState(e, route));
  });
}

/* ---------- Khung ứng dụng ---------- */
async function refreshBell() {
  if (!shell || !app.can('notification.view')) return;
  try {
    const r = await api.call('notification.count');
    shell.bell.textContent = r.unread > 99 ? '99+' : String(r.unread);
    shell.bell.hidden = r.unread === 0;
  } catch (e) { /* im lặng: chuông không quan trọng bằng thao tác chính */ }
}

function renderShell() {
  const bell = h('span', { class: 'bell', hidden: true, 'aria-label': 'thông báo chưa đọc' });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Điều hướng chính' },
    NAV.filter((n) => app.can(n.perm)).map((n) => h('a', { href: n.hash, 'data-key': n.key }, n.label, n.key === 'notifications' && bell)));
  const main = h('main', { id: 'main', tabindex: '-1' });
  const userBox = h('div', { class: 'userbox' },
    h('div', { class: 'who' }, h('div', { class: 'who-n' }, me.user.fullName), h('div', { class: 'who-r' }, lbl(L.role, me.role.code) + (me.isDirector ? ' · Giám đốc' : '') + ' · ' + me.user.orgUnit)),
    h('button', { class: 'btn sm', onclick: logout }, 'Đăng xuất'));
  const banner = CFG.DEMO_MODE ? h('div', { class: 'demo-banner' }, 'CHẾ ĐỘ DEMO — dữ liệu tổng hợp lưu trên trình duyệt này, không gửi đi đâu. ',
    h('button', { class: 'linkbtn', onclick: async () => { await api.demoReset(); toast('Đã đặt lại dữ liệu demo'); route(); refreshBell(); } }, 'Đặt lại dữ liệu')) : null;
  mount($app, h('a', { class: 'skip', href: '#main' }, 'Bỏ qua điều hướng'), banner,
    h('header', { class: 'top' }, h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, 'Q'), h('span', null, CFG.APP_NAME || 'QLCV CBTD')), nav, userBox), main);
  shell = { main, nav, bell };
}

function logout() {
  clearInterval(bellTimer);
  auth.signOut(); me = null; shell = null;
  showLogin();
}

/* ---------- Đăng nhập ---------- */
async function showLogin(message) {
  clearInterval(bellTimer);
  const box = h('div', { class: 'login-body' });
  mount($app, h('div', { class: 'login' },
    h('div', { class: 'login-card' },
      h('div', { class: 'brand big' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, 'Q'), h('span', null, CFG.APP_NAME || 'QLCV CBTD')),
      h('p', { class: 'muted' }, 'Quản lý công việc cán bộ tín dụng'),
      message && h('div', { class: 'form-err', role: 'alert' }, message), box)));
  if (CFG.DEMO_MODE) {
    mount(box, spinner('Đang nạp dữ liệu mẫu…'));
    try {
      const users = await api.demoUsers();
      mount(box, h('p', { class: 'muted' }, 'Chọn một tài khoản mẫu để xem giao diện theo từng vai trò:'),
        h('div', { class: 'demo-users' }, users.map((u) => h('button', { class: 'demo-user', onclick: () => { auth.signInDemo(u.email); start(); } },
          h('span', { class: 'du-n' }, u.name), h('span', { class: 'du-r' }, lbl(L.role, u.role) + (u.isDirector ? ' · Giám đốc' : ''))))));
    } catch (e) { mount(box, errorState(e, () => showLogin())); }
    return;
  }
  try {
    await auth.initGoogle(() => start());
    mount(box, h('p', { class: 'muted' }, 'Đăng nhập bằng tài khoản Google đã được cấp quyền.'), h('div', { id: 'gbtn' }));
    auth.renderGoogleButton(box.querySelector('#gbtn'));
  } catch (e) { mount(box, errorState(e, () => showLogin())); }
}

function showDenied(message) {
  mount($app, h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'state error', role: 'alert' }, h('div', { class: 'state-t' }, message || 'Tài khoản chưa được cấp quyền.'),
      h('div', { class: 'state-h' }, 'Hãy đăng nhập bằng tài khoản khác hoặc liên hệ quản trị viên để được cấp quyền.'),
      h('button', { class: 'btn primary', onclick: logout }, 'Đăng nhập lại')))));
}

/* ---------- Khởi động ---------- */
async function start() {
  if (!auth.getSession()) return showLogin();
  mount($app, spinner('Đang kiểm tra phiên đăng nhập…'));
  try {
    me = await api.call('auth.me');
  } catch (e) {
    if (e.code === 'UNAUTHENTICATED') return showLogin('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    if (e.code === 'FORBIDDEN') return showDenied(e.message);
    return mount($app, h('div', { class: 'login' }, h('div', { class: 'login-card' }, errorState(e, start))));
  }
  renderShell();
  refreshBell();
  clearInterval(bellTimer);
  bellTimer = setInterval(() => { if (!document.hidden) refreshBell(); }, 60000);
  route();
}

auth.onSessionExpired(() => { me = null; shell = null; showLogin('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'); });
window.addEventListener('hashchange', route);

if (!CFG.DEMO_MODE && (!CFG.API_URL || !CFG.GOOGLE_CLIENT_ID)) {
  mount($app, h('div', { class: 'login' }, h('div', { class: 'login-card' }, h('div', { class: 'state error', role: 'alert' },
    h('div', { class: 'state-t' }, 'Ứng dụng chưa được cấu hình.'),
    h('div', { class: 'state-h' }, 'Thiếu API_URL hoặc GOOGLE_CLIENT_ID trong frontend/config.js. Xem docs/DEPLOYMENT.md.')))));
} else {
  start();
}
