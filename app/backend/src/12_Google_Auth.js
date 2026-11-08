/**
 * Hạ tầng xác minh Google ID token (R1). Chỉ làm việc với mã đăng nhập:
 * kiểm tra aud/iss/email_verified/exp (+ hd nếu cấu hình) và trả về email đã chuẩn hóa.
 * Không biết gì về người dùng hay phân quyền – việc đó thuộc 21_Access.js.
 * Bộ nhớ đệm token (≤ TOKEN_CACHE_SEC giây) được giữ theo băm SHA-256 của token, không lưu token thô.
 */
(function (Q) {
  'use strict';
  var U = Q.Util;

  var GoogleAuth = Q.GoogleAuth = {};

  /** Trả về { email } đã xác minh, hoặc ném UNAUTHENTICATED / FORBIDDEN. */
  GoogleAuth.verify = function (idToken) {
    var Env = Q.Env;
    if (typeof idToken !== 'string' || !idToken || idToken.length > 4096) {
      U.fail('UNAUTHENTICATED', 'Chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.');
    }
    if (Env.allowDemoTokens && idToken.indexOf('demo:') === 0) return { email: idToken.slice(5).toLowerCase() };

    var ck = 'tok:' + Env.sha256(idToken), hit = Env.cacheGet(ck);
    if (hit) { try { return JSON.parse(hit); } catch (e) { /* bỏ qua, xác minh lại */ } }

    var clientId = Env.prop('GOOGLE_CLIENT_ID') || '980548527328-g4aiprfddm1fblgc376iuunrsh9o54j9.apps.googleusercontent.com';
    if (!clientId) U.fail('INTERNAL', 'Máy chủ chưa cấu hình GOOGLE_CLIENT_ID.');
    var r = Env.fetchJson('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (r.status !== 200 || !r.json) U.fail('UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

    var t = r.json, nowSec = Math.floor(Env.now().getTime() / 1000);
    if (t.aud !== clientId) U.fail('UNAUTHENTICATED', 'Mã đăng nhập không dành cho ứng dụng này.');
    if (['accounts.google.com', 'https://accounts.google.com'].indexOf(t.iss) < 0) U.fail('UNAUTHENTICATED', 'Nhà phát hành mã đăng nhập không hợp lệ.');
    if (String(t.email_verified) !== 'true' || !t.email) U.fail('UNAUTHENTICATED', 'Email Google chưa được xác minh.');
    if (Number(t.exp) <= nowSec) U.fail('UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn.');
    var hd = Env.prop('ALLOWED_DOMAIN');
    if (hd && String(t.hd || '').toLowerCase() !== hd.toLowerCase()) U.fail('FORBIDDEN', 'Tài khoản không thuộc tổ chức được phép.');

    var out = { email: String(t.email).toLowerCase() };
    Env.cachePut(ck, JSON.stringify(out), Math.min(Q.Config.TOKEN_CACHE_SEC, Number(t.exp) - nowSec));
    return out;
  };
})(QLCV);
