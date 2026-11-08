// Đăng nhập. Live: Google Identity Services (ID token, gửi trong body mỗi request, máy chủ xác minh lại).
// Demo: chọn tài khoản mẫu, token dạng "demo:<email>" (chỉ backend bộ nhớ chấp nhận).
// Token lưu sessionStorage (mất khi đóng tab) – không dùng localStorage; hết hạn sau ~1 giờ và được làm mới êm qua GIS.

const CFG = () => window.QLCV_CONFIG || {};
const KEY = 'qlcv_session_v1';

let session = null;
let refreshWaiters = [];
let onExpired = () => {};

try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }
if (session && session.exp * 1000 < Date.now()) session = null;

function save() {
  try { session ? sessionStorage.setItem(KEY, JSON.stringify(session)) : sessionStorage.removeItem(KEY); } catch (e) { /* bỏ qua */ }
}

function fromJwt(jwt) {
  const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(atob(p).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  const c = JSON.parse(json);
  return { idToken: jwt, email: c.email, name: c.name || c.email, exp: c.exp };
}

export const getSession = () => session;
export const onSessionExpired = (fn) => { onExpired = fn; };

export function signInDemo(email) {
  session = { idToken: 'demo:' + email, email, name: email, exp: Math.floor(Date.now() / 1000) + 8 * 3600 };
  save();
}

export function signOut() {
  session = null; save();
  try { window.google && google.accounts.id.disableAutoSelect(); } catch (e) { /* bỏ qua */ }
}

export function expire() { session = null; save(); onExpired(); }

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = resolve; s.onerror = () => reject(new Error('Không tải được dịch vụ đăng nhập Google. Kiểm tra mạng hoặc chính sách chặn của cơ quan.'));
    document.head.appendChild(s);
  });
}

let gisReady = null;
export function initGoogle(onSignedIn) {
  if (!gisReady) {
    gisReady = loadGis().then(() => {
      google.accounts.id.initialize({
        client_id: CFG().GOOGLE_CLIENT_ID, auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true,
        callback: (resp) => {
          if (!resp || !resp.credential) return;
          session = fromJwt(resp.credential); save();
          refreshWaiters.splice(0).forEach((w) => w.resolve());
          onSignedIn && onSignedIn();
        }
      });
    });
  }
  return gisReady;
}

export function renderGoogleButton(el) {
  google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'vi', width: 300 });
}

/** Trả token hợp lệ; còn dưới 90 giây thì thử làm mới (live). */
export async function token() {
  if (!session) return null;
  if (!CFG().DEMO_MODE && session.exp - Date.now() / 1000 < 90) {
    try {
      await initGoogle();
      await new Promise((resolve, reject) => {
        refreshWaiters.push({ resolve, reject });
        google.accounts.id.prompt();
        setTimeout(() => reject(new Error('timeout')), 8000);
      });
    } catch (e) { if (session.exp - Date.now() / 1000 < 5) { expire(); return null; } }
  }
  return session ? session.idToken : null;
}
