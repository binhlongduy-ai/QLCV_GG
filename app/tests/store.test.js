'use strict';
/**
 * Kiểm thử Q.makeStore (chỉ mục khóa chính, chỉ mục theo cột, bộ đếm ID, insertMany).
 * Cách làm: chạy cùng một chuỗi thao tác ngẫu nhiên (có seed, lặp lại được) trên Store thật và trên một
 * "oracle" quét tuyến tính rất đơn giản; sau mỗi thao tác so sánh mọi kết quả đọc. Oracle không dùng chỉ mục nào.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./harness');

const Q = loadBackend();
const clone = (o) => JSON.parse(JSON.stringify(o));
// Kết quả từ Store nằm trong realm của vm; đưa về đối tượng thường trước khi so sánh strict.
const plain = clone;

/** Driver bộ nhớ tối giản (giống hợp đồng của SheetDriver: read/append/appendMany/write). */
function memDriver() {
  const tables = {};
  return {
    read: (t) => clone(tables[t] || []),
    append: (t, r) => { (tables[t] = tables[t] || []).push(clone(r)); },
    appendMany: (t, rs) => { rs.forEach((r) => { (tables[t] = tables[t] || []).push(clone(r)); }); },
    write: (t, i, r) => { tables[t][i] = clone(r); },
    dump: () => clone(tables)
  };
}

/** Oracle: quét tuyến tính, không chỉ mục. Cùng hợp đồng lỗi với Store. */
function oracle(table) {
  const def = Q.Schema.tables[table];
  const rows = [];
  const idx = (id) => rows.findIndex((r) => r[def.pk] === id);
  const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
  return {
    all: () => clone(rows),
    find: (id) => { if (id === undefined || id === null || id === '') return null; const i = idx(id); return i < 0 ? null : clone(rows[i]); },
    findBy: (col, v) => clone(rows.filter((r) => String(r[col]) === String(v))),
    nextId: () => {
      let max = 0; const re = new RegExp('^' + def.prefix + '-(\\d+)$');
      rows.forEach((r) => { const m = re.exec(r[def.pk]); if (m) max = Math.max(max, parseInt(m[1], 10)); });
      return def.prefix + '-' + String(max + 1).padStart(3, '0');
    },
    insert: (obj) => {
      const row = Q.Schema.normalize(table, obj);
      if (def.pk && idx(row[def.pk]) >= 0) fail('CONFLICT');
      rows.push(row); return clone(row);
    },
    insertMany: (objs) => {
      const batch = objs.map((o) => Q.Schema.normalize(table, o)), seen = {};
      batch.forEach((r) => { if (def.pk && (seen[r[def.pk]] || idx(r[def.pk]) >= 0)) fail('CONFLICT'); if (def.pk) seen[r[def.pk]] = 1; });
      rows.push(...batch); return clone(batch);
    },
    update: (id, patch) => {
      const i = idx(id); if (i < 0) fail('NOT_FOUND');
      Object.keys(patch).forEach((k) => {
        if (def.immutable && def.immutable.indexOf(k) >= 0 && String(patch[k]) !== String(rows[i][k])) fail('INTERNAL');
      });
      const merged = {}; def.cols.forEach((k) => { merged[k] = Object.prototype.hasOwnProperty.call(patch, k) ? patch[k] : rows[i][k]; });
      rows[i] = Q.Schema.normalize(table, merged); return clone(rows[i]);
    }
  };
}

/** Chạy một thao tác; trả về { ok, value } hoặc { ok:false, code } để so sánh cả lỗi. */
function attempt(fn) {
  try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, code: e.code || 'JS:' + e.message }; }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function taskRow(id, extra) {
  return Object.assign({ task_id: id, task_code: 'CV-' + String(id).slice(-4), customer_id: 'CUS-001', title: 'T ' + id,
    description: '', status: 'not_started', priority: 'normal', due_at: '2026-12-31', created_by_user_id: 'USR-001',
    completed_at: '', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', archived_at: '' }, extra || {});
}

test('Store có chỉ mục khớp với oracle quét tuyến tính qua 600 thao tác ngẫu nhiên (3 seed)', () => {
  const STATUSES = ['not_started', 'in_progress', 'completed'];
  for (const seed of [1, 2, 3]) {
    const rand = rng(seed), pick = (a) => a[Math.floor(rand() * a.length)];
    const driver = memDriver();
    const S = Q.makeStore(driver);
    const O = oracle('Tasks');
    const check = (step) => {
      assert.deepEqual(plain(S.all('Tasks')), O.all(), 'all() lệch ở bước ' + step);
      assert.equal(S.count('Tasks'), O.all().length, 'count lệch ở bước ' + step);
      assert.equal(S.nextId('Tasks'), O.nextId(), 'nextId lệch ở bước ' + step);
      STATUSES.forEach((st) => assert.deepEqual(plain(S.findBy('Tasks', 'status', st)), O.findBy('status', st), 'findBy status=' + st + ' lệch ở bước ' + step));
    };
    for (let step = 0; step < 600; step++) {
      const op = rand();
      const idPool = () => 'TSK-' + String(1 + Math.floor(rand() * 60)).padStart(3, '0');
      if (op < 0.30) {
        const id = rand() < 0.5 ? O.nextId() : (rand() < 0.8 ? idPool() : 'TSK-ABC');
        const obj = taskRow(id, { status: pick(STATUSES) });
        assert.deepEqual(attempt(() => S.insert('Tasks', obj)).ok, attempt(() => O.insert(obj)).ok, 'insert ở bước ' + step);
      } else if (op < 0.45) {
        const batch = []; const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) batch.push(taskRow(rand() < 0.6 ? O.nextId().replace(/\d+$/, String(1000 + k * 7 + step)) : idPool(), { status: pick(STATUSES) }));
        const a = attempt(() => S.insertMany('Tasks', batch)), b = attempt(() => O.insertMany(batch));
        assert.equal(a.ok, b.ok, 'insertMany ở bước ' + step);
        if (!a.ok) assert.equal(a.code, b.code, 'mã lỗi insertMany ở bước ' + step);
      } else if (op < 0.85) {
        const id = rand() < 0.9 ? idPool() : 'TSK-999';
        const patch = rand() < 0.5 ? { status: pick(STATUSES), updated_at: '2026-10-0' + (1 + step % 9) + 'T00:00:00Z' }
          : { title: 'Đổi tên ' + step, archived_at: rand() < 0.5 ? '2026-10-02T00:00:00Z' : '' };
        const a = attempt(() => S.update('Tasks', id, patch)), b = attempt(() => O.update(id, patch));
        assert.equal(a.ok, b.ok, 'update ở bước ' + step);
        if (!a.ok) assert.equal(a.code, b.code, 'mã lỗi update ở bước ' + step);
      } else if (op < 0.88) {
        // Mô phỏng request mới: xóa bộ đệm, chỉ mục phải được dựng lại đúng từ driver.
        S.reset();
      } else {
        const id = idPool();
        assert.deepEqual(plain(S.find('Tasks', id)), O.find(id), 'find ' + id + ' lệch ở bước ' + step);
      }
      check(step);
    }
  }
});

test('đổi khóa chính (Roles.role_id) vẫn tra được theo khóa mới và theo cột khác', () => {
  const S = Q.makeStore(memDriver());
  S.insertMany('Roles', [{ role_id: 'R-1', code: 'A', name: 'a' }, { role_id: 'R-2', code: 'B', name: 'b' }]);
  assert.equal(S.findBy('Roles', 'code', 'A')[0].role_id, 'R-1');   // dựng chỉ mục theo cột trước
  S.update('Roles', 'R-1', { role_id: 'R-9' });
  assert.equal(S.find('Roles', 'R-1'), null);
  assert.equal(S.find('Roles', 'R-9').code, 'A');
  assert.equal(S.findBy('Roles', 'code', 'A')[0].role_id, 'R-9');
  S.insert('Roles', { role_id: 'R-3', code: 'C', name: 'c' });       // chỉ mục khóa đã dựng lại vẫn nhận dòng mới
  assert.equal(S.find('Roles', 'R-3').code, 'C');
});

test('nextId theo sau số lớn nhất đã chèn, bỏ qua ID không đúng tiền tố, và không tăng khi chỉ hỏi', () => {
  const S = Q.makeStore(memDriver());
  assert.equal(S.nextId('Tasks'), 'TSK-001');
  assert.equal(S.nextId('Tasks'), 'TSK-001');                      // chỉ hỏi, không ghi
  S.insert('Tasks', taskRow('TSK-050'));
  S.insert('Tasks', taskRow('TSK-ABC'));
  assert.equal(S.nextId('Tasks'), 'TSK-051');
});

test('insertMany không ghi dòng nào khi một dòng trong lô bị trùng khóa', () => {
  const driver = memDriver();
  const S = Q.makeStore(driver);
  S.insert('Tasks', taskRow('TSK-001'));
  const before = S.count('Tasks');
  const err = attempt(() => S.insertMany('Tasks', [taskRow('TSK-002'), taskRow('TSK-001')]));
  assert.equal(err.code, 'CONFLICT');
  assert.equal(S.count('Tasks'), before);
  assert.equal(driver.dump().Tasks.length, before, 'driver không được nhận dòng nào của lô lỗi');
});

test('sửa một cột không làm mất dòng khỏi chỉ mục theo cột khác', () => {
  const S = Q.makeStore(memDriver());
  S.insertMany('Tasks', [taskRow('TSK-001', { status: 'not_started' }), taskRow('TSK-002', { status: 'not_started' })]);
  assert.equal(S.findBy('Tasks', 'status', 'not_started').length, 2);  // dựng chỉ mục
  S.update('Tasks', 'TSK-001', { status: 'completed' });
  assert.deepEqual(plain(S.findBy('Tasks', 'status', 'not_started').map((r) => r.task_id)), ['TSK-002']);
  assert.deepEqual(plain(S.findBy('Tasks', 'status', 'completed').map((r) => r.task_id)), ['TSK-001']);
});
