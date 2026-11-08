// Sinh mockup/appsheet-role-preview.html từ dữ liệu tổng hợp trong data/appsheet-synthetic.
// Dùng: node tools/appsheet/build-mockup.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const dataDir = path.join(root, 'data', 'appsheet-synthetic');
const TABLES = ['Roles', 'Permissions', 'RolePermissions', 'Users', 'Customers',
  'Tasks', 'TaskAssignees', 'TaskUpdates', 'Notifications', 'AuditLogs'];

function readTable(name) {
  const lines = fs.readFileSync(path.join(dataDir, `${name}.csv`), 'utf8')
    .replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  const cols = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, (values[i] || '').trim()]));
  });
}

const data = Object.fromEntries(TABLES.map(t => [t, readTable(t)]));
const template = fs.readFileSync(path.join(__dirname, 'mockup-template.html'), 'utf8');
// Thoát "<" để chuỗi JSON không đóng thẻ <script> sớm
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const html = template.replace('__DATA_JSON__', () => json);

const outDir = path.join(root, 'mockup');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'appsheet-role-preview.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Đã tạo ${path.relative(root, outFile)} (${TABLES.length} tab)`);
