'use strict';
/**
 * Kiểm thử SheetDriver (đường chạy thật trên Apps Script) bằng bộ giả lập Google.
 * Trọng tâm: ánh xạ vị trí dòng (rowNums) khi tab có dòng trống, ghi nhiều dòng, và ghi lại sau khi đọc lại.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fakeGoogle } = require('./fake-gas');

const SRC = path.join(__dirname, '..', 'backend', 'src');

function bootGas() {
  const f = fakeGoogle({});
  const ctx = vm.createContext(f.g);
  fs.readdirSync(SRC).filter((x) => x.endsWith('.js')).sort()
    .forEach((x) => vm.runInContext(fs.readFileSync(path.join(SRC, x), 'utf8'), ctx, { filename: x }));
  return { Q: vm.runInContext('QLCV', ctx), sheets: f.sheets };
}

/** Các dòng dữ liệu (không tính tiêu đề) của một tab, dưới dạng đối tượng theo tiêu đề cột. */
function dataRows(Q, sheets, table) {
  const cols = Q.Schema.cols(table);
  return sheets[table].rows.slice(1).filter((r) => r && r.some((v) => v !== '' && v !== undefined))
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] === undefined ? '' : r[i]])));
}

function customer(id, name) {
  return { customer_id: id, customer_code: 'KH-' + id.slice(-3), name, type: 'personal', phone: '0900000000', status: 'new',
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', company_representative: '', archived_at: '' };
}

test('bootstrap ghi đúng tiêu đề, dòng tham chiếu và Admin đầu tiên vào Sheets', () => {
  const { Q, sheets } = bootGas();
  Q.Setup.bootstrapDatabase();
  Q.Store.reset();
  assert.equal(dataRows(Q, sheets, 'Roles').length, Q.SeedData.reference.Roles.length);
  assert.equal(dataRows(Q, sheets, 'RolePermissions').length, Q.SeedData.reference.RolePermissions.length);
  const admin = dataRows(Q, sheets, 'Users');
  assert.equal(admin.length, 1);
  assert.equal(admin[0].email, 'boss@bank.vn');
  assert.equal(sheets.Users.rows[0][0], 'user_id', 'tiêu đề tab Users phải đúng thứ tự cột');
});

test('dòng trống ở giữa tab: cập nhật đúng dòng sau khi đọc lại, và dòng mới nối sau dòng cuối', () => {
  const { Q, sheets } = bootGas();
  Q.Setup.ensureTabs();
  Q.Store.reset();
  Q.Store.insertMany('Customers', [customer('CUS-001', 'An'), customer('CUS-002', 'Bình'), customer('CUS-003', 'Cường')]);
  assert.equal(sheets.Customers.rows[1][2], 'An');   // dòng 2
  assert.equal(sheets.Customers.rows[3][2], 'Cường'); // dòng 4

  // Người dùng xóa trắng dòng 3 (CUS-002) trực tiếp trên Sheets.
  sheets.Customers.rows[2] = sheets.Customers.rows[2].map(() => '');

  Q.Store.reset();                                     // request mới: đọc lại từ Sheets
  assert.deepEqual(JSON.parse(JSON.stringify(Q.Store.all('Customers').map((c) => c.customer_id))), ['CUS-001', 'CUS-003']);
  Q.Store.update('Customers', 'CUS-003', { name: 'Cường (đã sửa)', updated_at: '2026-10-05T00:00:00Z' });
  assert.equal(sheets.Customers.rows[3][2], 'Cường (đã sửa)', 'phải ghi đúng dòng 4');
  assert.equal(sheets.Customers.rows[2].every((v) => v === ''), true, 'dòng 3 vẫn trống');

  Q.Store.insertMany('Customers', [customer('CUS-004', 'Dung')]);
  assert.equal(sheets.Customers.rows[4][2], 'Dung', 'dòng mới nối sau dòng cuối cùng (dòng 5)');
});

test('ghi rồi sửa trong cùng một request: dòng vừa thêm vẫn được cập nhật đúng vị trí', () => {
  const { Q, sheets } = bootGas();
  Q.Setup.ensureTabs();
  Q.Store.reset();
  Q.Store.insert('Customers', customer('CUS-001', 'Ban đầu'));
  Q.Store.update('Customers', 'CUS-001', { name: 'Sau khi sửa' });
  assert.equal(sheets.Customers.rows[1][2], 'Sau khi sửa');
  Q.Store.reset();
  assert.equal(Q.Store.find('Customers', 'CUS-001').name, 'Sau khi sửa');
});

test('nextId đọc số lớn nhất từ Sheets và tiếp tục sau dòng trống', () => {
  const { Q, sheets } = bootGas();
  Q.Setup.ensureTabs();
  Q.Store.reset();
  Q.Store.insertMany('Customers', [customer('CUS-007', 'A'), customer('CUS-002', 'B')]);
  sheets.Customers.rows[1] = sheets.Customers.rows[1].map(() => '');   // xóa CUS-007
  Q.Store.reset();
  assert.equal(Q.Store.nextId('Customers'), 'CUS-003');
});
