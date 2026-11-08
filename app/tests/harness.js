'use strict';
/** Nạp lõi backend (đúng các tệp sẽ chạy trên Apps Script) vào một vm context để kiểm thử bằng Node. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'backend', 'src');
const DEV = path.join(__dirname, '..', 'backend', 'dev', 'Env_Memory.js');

function loadBackend() {
  const sandbox = { console };
  const ctx = vm.createContext(sandbox);
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(SRC, f));
  files.push(DEV);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  return vm.runInContext('QLCV', ctx);
}

function makeClient(Q) {
  let n = 0;
  const rid = () => 'rq' + String(++n).padStart(8, '0');
  // Kết quả đi qua JSON để thoát khỏi realm của vm (so sánh deepEqual đúng nguyên mẫu).
  const call = (email, action, params, requestId) =>
    plain(Q.handle({ action, idToken: email ? 'demo:' + email : undefined, params: params || {}, requestId: requestId || rid() }));
  call.rid = rid;
  return call;
}

const plain = (x) => JSON.parse(JSON.stringify(x));
const NOW = '2026-10-13T12:00:00Z';

function fresh() {
  const Q = loadBackend();
  const reset = () => { Q.Dev.reset(); Q.Env.setNow(NOW); Q.Env.setProp('DIRECTOR_EMAILS', null); };
  reset();
  return { Q, call: makeClient(Q), reset };
}

module.exports = { plain, loadBackend, makeClient, fresh, NOW };
