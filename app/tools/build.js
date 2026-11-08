#!/usr/bin/env node
/**
 * Công cụ build (không phụ thuộc thư viện ngoài):
 *   node tools/build.js            -> làm cả ba việc dưới
 *   node tools/build.js seed       -> sinh backend/src/96_Seed.js từ data/appsheet-synthetic/*.csv
 *   node tools/build.js demo       -> gộp lõi backend + môi trường bộ nhớ thành frontend/demo/backend.bundle.js
 *   node tools/build.js config     -> ghi frontend/config.js từ biến môi trường API_URL, GOOGLE_CLIENT_ID, DEMO_MODE
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSV_DIR = process.env.SEED_CSV_DIR || path.join(ROOT, '..', 'data', 'appsheet-synthetic');
const SRC = path.join(ROOT, 'backend', 'src');

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some((v) => v !== '')) rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((v) => v !== '')) rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
}

function buildSeed() {
  const read = (n) => parseCsv(fs.readFileSync(path.join(CSV_DIR, n + '.csv'), 'utf8'));
  const reference = {}, demo = {};
  ['Roles', 'Permissions', 'RolePermissions'].forEach((t) => { reference[t] = read(t); });
  ['Users', 'Customers', 'Tasks', 'TaskAssignees', 'TaskUpdates', 'Notifications', 'AuditLogs'].forEach((t) => { demo[t] = read(t); });
  // Cột mở rộng (R17): một khách hàng doanh nghiệp mẫu có người đại diện.
  demo.Customers.forEach((c) => { c.archived_at = ''; c.company_representative = c.customer_id === 'CUS-002' ? 'Người đại diện mẫu B' : ''; });
  demo.Tasks.forEach((t) => { t.archived_at = ''; });
  const body = '/* TỆP SINH TỰ ĐỘNG bởi tools/build.js từ data/appsheet-synthetic/*.csv – KHÔNG sửa tay.\n' +
    ' * Chỉ chứa dữ liệu tham chiếu (vai trò, quyền) và dữ liệu TỔNG HỢP (R13). Không có dữ liệu thật. */\n' +
    'QLCV.SeedData = ' + JSON.stringify({ reference, demo }, null, 1) + ';\n';
  fs.writeFileSync(path.join(SRC, '96_Seed.js'), body);
  console.log('seed: ' + path.join('backend', 'src', '96_Seed.js'));
}

function buildDemo() {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(SRC, f));
  files.push(path.join(ROOT, 'backend', 'dev', 'Env_Memory.js'));
  const out = '/* TỆP SINH TỰ ĐỘNG bởi tools/build.js – lõi backend chạy trong trình duyệt cho chế độ DEMO. */\n' +
    files.map((f) => '/* ---- ' + path.basename(f) + ' ---- */\n' + fs.readFileSync(f, 'utf8')).join('\n');
  const dir = path.join(ROOT, 'frontend', 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'backend.bundle.js'), out);
  console.log('demo: frontend/demo/backend.bundle.js (' + Math.round(out.length / 1024) + ' KB)');
}

function buildConfig() {
  const apiUrl = process.env.API_URL || '';
  const demo = process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : !apiUrl;
  const cfg = {
    API_URL: apiUrl,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    DEMO_MODE: demo,
    APP_NAME: 'QLCV CBTD'
  };
  fs.writeFileSync(path.join(ROOT, 'frontend', 'config.js'),
    '// Sinh bởi tools/build.js. Không chứa bí mật: Client ID và URL API là thông tin công khai.\nwindow.QLCV_CONFIG = ' +
    JSON.stringify(cfg, null, 2) + ';\n');
  console.log('config: frontend/config.js ' + JSON.stringify({ ...cfg, GOOGLE_CLIENT_ID: cfg.GOOGLE_CLIENT_ID ? '(đã đặt)' : '' }));
}

const task = process.argv[2];
if (!task || task === 'seed') buildSeed();
if (!task || task === 'demo') buildDemo();
if (!task || task === 'config') buildConfig();
