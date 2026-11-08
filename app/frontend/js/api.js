// Lớp gọi API. Giao thức: POST text/plain (không cần preflight CORS) -> Apps Script Web App.
// Mỗi lời gọi sinh một requestId và dùng lại khi thử lại, nên thao tác ghi thử lại không bao giờ tạo trùng.
import * as auth from './auth.js';

const CFG = () => window.QLCV_CONFIG || {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(e) { super(e.message || 'Lỗi không xác định'); this.code = e.code || 'INTERNAL'; this.details = e.details || null; }
}

function rid() {
  const u = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/-/g, '');
  return 'r' + u.slice(0, 32);
}

/* ---------- Chế độ demo: chạy lõi backend trong trình duyệt ---------- */
const DEMO_KEY = 'qlcv_demo_db_v1';
let demoReady = null;

export function loadDemo() {
  if (!demoReady) {
    demoReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'demo/backend.bundle.js';
      s.onload = () => {
        const Q = window.QLCV;
        Q.Dev.seedProps({ DIRECTOR_EMAILS: 'bgd@example.com' });
        try { const snap = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); if (snap) Q.Dev.load(snap); } catch (e) { /* dùng dữ liệu mẫu */ }
        Q.Dev.onFlush(() => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(Q.Dev.dump())); } catch (e) { /* đầy bộ nhớ */ } });
        resolve(Q);
      };
      s.onerror = () => reject(new ApiError({ code: 'NETWORK', message: 'Không tải được backend demo. Hãy chạy "node tools/build.js demo".' }));
      document.head.appendChild(s);
    });
  }
  return demoReady;
}

export async function demoUsers() {
  const Q = await loadDemo();
  const roles = Object.fromEntries(Q.SeedData.reference.Roles.map((r) => [r.role_id, r.code]));
  return Q.SeedData.demo.Users.filter((u) => u.status === 'active').map((u) => ({ email: u.email, name: u.full_name, role: roles[u.role_id] }));
}

export async function demoReset() {
  const Q = await loadDemo();
  localStorage.removeItem(DEMO_KEY);
  Q.Dev.reset();
}

async function demoCall(body) {
  const Q = await loadDemo();
  await sleep(80);
  return JSON.parse(JSON.stringify(Q.handle(body)));
}

/* ---------- Chế độ thật ---------- */
async function httpCall(body, attempts) {
  for (let i = 0; i < attempts; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(CFG().API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body), signal: ctl.signal, redirect: 'follow', credentials: 'omit'
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      clearTimeout(timer);
      if (i < attempts - 1) await sleep(500 * (i + 1));
    }
  }
  throw new ApiError({ code: 'NETWORK', message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.' });
}

/** Gọi một action. Ném ApiError khi thất bại. */
export async function call(action, params = {}) {
  const idToken = await auth.token();
  if (!idToken) { auth.expire(); throw new ApiError({ code: 'UNAUTHENTICATED', message: 'Phiên đăng nhập đã hết hạn.' }); }
  const body = { action, params, requestId: rid(), idToken };
  const res = CFG().DEMO_MODE ? await demoCall(body) : await httpCall(body, 3);
  if (!res || !res.ok) {
    const err = new ApiError((res && res.error) || {});
    if (err.code === 'UNAUTHENTICATED') auth.expire();
    throw err;
  }
  return res.data;
}
