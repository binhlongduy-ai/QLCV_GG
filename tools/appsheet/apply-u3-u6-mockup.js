const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'mockup-template.html');
let html = fs.readFileSync(file, 'utf8');

// 1. Cập nhật LABEL nếu cần
if (!html.includes('transfer:')) {
  html = html.replace("assign: { primary: 'Chính', collaborator: 'Phối hợp' },", 
`assign: { primary: 'Chính', collaborator: 'Phối hợp' },
  transfer: { success: 'Đã chuyển giao CBTD chính' },`);
}

// 2. Cập nhật viewOverview để thêm R15 Slice Dashboard Giám đốc & Admin
const oldOverviewCards = '<div class="card"><h3 style="margin-top:0">Công việc gần đây</h3>${tasksTable(tasks.slice(0, 5))}</div>';
const newOverviewCards = `\${(myRole() === 'BGD' || myRole() === 'Admin') ? \`
    <div class="card" style="border-left: 4px solid var(--amber); background: #fffdf5;">
      <h3 style="margin-top:0; color: var(--amber);">⭐ Bảng điều khiển công việc ưu tiên (R15 - Giám đốc & Admin)</h3>
      <p class="sub" style="margin-bottom:8px;">Lọc tự động theo Slice R15: Việc khẩn/quan trọng hoặc Quá hạn (&lt; TODAY), chưa hoàn thành.</p>
      \${tasksTable(tasks.filter(t => (t.priority === 'high' || t.due_at < TODAY) && t.status !== 'completed'))}
    </div>\` : ''}
    <div class="card"><h3 style="margin-top:0">Công việc gần đây</h3>\${tasksTable(tasks.slice(0, 5))}</div>`;

if (html.includes(oldOverviewCards)) {
  html = html.replace(oldOverviewCards, newOverviewCards);
  console.log('✅ Đã cập nhật R15 Director Slice trong viewOverview');
} else {
  console.log('⚠️ Không tìm thấy oldOverviewCards');
}

// 3. Cập nhật viewTask để thêm Action R17 Chuyển giao người thực hiện (Reassign)
const oldAssigneesBlock = '<div class="card"><h3 style="margin-top:0">Phân công</h3>${assignees || \'—\'}</div>';
const newAssigneesBlock = `<div class="card"><h3 style="margin-top:0">Phân công</h3>
        <div>\${assignees || '—'}</div>
        \${canTransfer ? \`
          <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--border);">
            <label style="font-weight:600; font-size:12px;">Chuyển giao CBTD chính (Action R17):</label>
            <div style="display:flex; gap:6px; margin-top:4px;">
              <select id="transfer-user" style="font-size:13px;">\${cbtdTransferOpts}</select>
              <button data-act="transfer" data-id="\${esc(t.task_id)}" style="padding:4px 10px; font-size:12px;">Chuyển giao</button>
            </div>
          </div>\` : ''}
      </div>`;

if (html.includes(oldAssigneesBlock)) {
  // Chuẩn bị biến canTransfer và cbtdTransferOpts trong viewTask()
  const oldHistoryLine = "const history = ups.length";
  const newPrepLine = `const canTransfer = (myRole() === 'BGD' || myRole() === 'Admin' || myRole() === 'KSV') && t.status !== 'completed';
  const cbtdCandidates = state.Users.filter(u => u.status === 'active' && roleOf(u) === 'CBTD');
  const cbtdTransferOpts = cbtdCandidates.map(u => \`<option value="\${u.user_id}">\${esc(u.full_name)}</option>\`).join('');
  const history = ups.length`;

  html = html.replace(oldHistoryLine, newPrepLine);
  html = html.replace(oldAssigneesBlock, newAssigneesBlock);
  console.log('✅ Đã cập nhật Action R17 Chuyển giao người thực hiện trong viewTask');
}

// 4. Cập nhật viewCustomers để hỗ trợ Form tạo khách hàng & hiển thị đại diện công ty (R17)
const oldViewCustomers = `function viewCustomers() {
  const rows = visibleCustomers();
  const body = rows.length
    ? \`<div class="scroll"><table class="tbl"><thead><tr><th>Mã KH</th><th>Tên</th><th>Loại</th><th>SĐT</th><th>Nhóm</th><th>Công việc liên quan</th></tr></thead><tbody>
       \${rows.map(c => \`<tr><td>\${esc(c.customer_code)}</td><td><strong>\${esc(c.name)}</strong></td><td>\${esc(LABEL.type[c.type])}</td><td>\${esc(c.phone)}</td><td>\${esc(LABEL.custStatus[c.status])}</td><td>\${visibleTasks().filter(t => t.customer_id === c.customer_id).length}</td></tr>\`).join('')}
       </tbody></table></div>\`
    : \`<div class="empty">Chưa có khách hàng nào trong phạm vi của bạn.</div>\`;
  return \`<h2>Khách hàng</h2>
    <p class="sub">Phạm vi: \${esc(scopeText())}. Không hiển thị dư nợ hoặc thông tin tín dụng chi tiết (ngoài phạm vi thí điểm).</p>
    <div class="card">\${body}</div>\`;
}`;

const newViewCustomers = `function viewCustomers() {
  const rows = visibleCustomers();
  const canMaintainCust = can('customer.maintain');
  const custForm = canMaintainCust ? \`
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Thêm khách hàng mới (R9 - KSV & Admin)</h3>
      <div class="grid2">
        <div><label>Tên khách hàng<input id="nc-name" placeholder="Nguyễn Văn A / Công ty XYZ"></label></div>
        <div>
          <label>Loại khách hàng
            <select id="nc-type" data-act="cust-type-change">
              <option value="personal">Cá nhân</option>
              <option value="business">Doanh nghiệp (Công ty)</option>
            </select>
          </label>
        </div>
        <div id="nc-rep-box" style="display:none;">
          <label style="color:var(--primary-dark); font-weight:600;">Người đại diện công ty (Show_If R17):
            <input id="nc-rep" placeholder="Họ tên người đại diện pháp luật">
          </label>
        </div>
        <div><label>Số điện thoại<input id="nc-phone" placeholder="090..."></label></div>
      </div>
      <div class="row-actions"><button data-act="create-cust">Thêm khách hàng</button></div>
    </div>\` : '';

  const body = rows.length
    ? \`<div class="scroll"><table class="tbl"><thead><tr><th>Mã KH</th><th>Tên</th><th>Loại</th><th>Đại diện (R17)</th><th>SĐT</th><th>Nhóm</th><th>Công việc liên quan</th></tr></thead><tbody>
       \${rows.map(c => \`<tr><td>\${esc(c.customer_code)}</td><td><strong>\${esc(c.name)}</strong></td><td>\${esc(LABEL.type[c.type])}</td><td>\${c.type === 'business' ? esc(c.representative_name || 'Đại diện mẫu') : '—'}</td><td>\${esc(c.phone)}</td><td>\${esc(LABEL.custStatus[c.status])}</td><td>\${visibleTasks().filter(t => t.customer_id === c.customer_id).length}</td></tr>\`).join('')}
       </tbody></table></div>\`
    : \`<div class="empty">Chưa có khách hàng nào trong phạm vi của bạn.</div>\`;
  return \`<h2>Khách hàng</h2>
    <p class="sub">Phạm vi: \${esc(scopeText())}. Không hiển thị dư nợ hoặc thông tin tín dụng chi tiết (ngoài phạm vi thí điểm).</p>
    \${custForm}
    <div class="card">\${body}</div>\`;
}`;

if (html.includes(oldViewCustomers)) {
  html = html.replace(oldViewCustomers, newViewCustomers);
  console.log('✅ Đã cập nhật Form Customer & Representative (R17) trong viewCustomers');
}

// 5. Cập nhật viewUsers để thêm nút Backup/Restore của Admin (R16)
const oldViewUsersSub = `<p class="sub">Quản lý người dùng và vai trò (chỉ Admin). Trang này chỉ xem, không sửa.</p>`;
const newViewUsersSub = `<p class="sub">Quản lý người dùng và vai trò (chỉ Admin R16).</p>
    <div class="row-actions" style="margin-bottom:12px;">
      <button class="ghost" data-act="backup" title="Sao lưu toàn bộ sổ Google Sheets">💾 Backup dữ liệu sổ (R16)</button>
      <button class="ghost" data-act="restore" title="Khôi phục trạng thái sổ dữ liệu">🔄 Kiểm tra Restore (R16)</button>
    </div>`;

if (html.includes(oldViewUsersSub)) {
  html = html.replace(oldViewUsersSub, newViewUsersSub);
  console.log('✅ Đã cập nhật nút Backup / Restore (R16) trong viewUsers');
}

// 6. Cập nhật handlers để xử lý transfer, create-cust, backup, restore, cust-type-change
const oldHandlersSubmit = `  submit(d) {`;
const newHandlersAdditions = `  transfer(d) {
    const t = byId('Tasks', 'task_id', d.id);
    const newUserId = document.getElementById('transfer-user').value;
    if (!newUserId) return;
    const oldPrimary = state.TaskAssignees.find(a => a.task_id === t.task_id && a.assignment_role === 'primary' && a.active === 'TRUE');
    if (oldPrimary) oldPrimary.active = 'FALSE';
    
    const newUser = byId('Users', 'user_id', newUserId);
    const asgId = nextId('ASG', state.TaskAssignees);
    state.TaskAssignees.push({
      assignment_id: asgId,
      task_id: t.task_id,
      user_id: newUserId,
      assignee_email_snapshot: newUser.email,
      assignment_role: 'primary',
      assigned_at: nowIso(),
      active: 'TRUE'
    });
    audit('task.transfer', 'Task', t.task_id);
    notify(newUserId, 'task_assigned', t.task_id, \`Bạn được phân công làm người phụ trách chính cho \${t.task_code}\`);
    flashMsg = \`Đã chuyển giao \${t.task_code} sang \${newUser.full_name} (Action R17 thành công).\`;
    render();
  },

  'create-cust'() {
    const name = document.getElementById('nc-name').value.trim();
    const type = document.getElementById('nc-type').value;
    const rep = document.getElementById('nc-rep') ? document.getElementById('nc-rep').value.trim() : '';
    const phone = document.getElementById('nc-phone').value.trim();
    if (!name) { flashMsg = 'Vui lòng nhập tên khách hàng.'; return render(); }
    const id = nextId('CUS', state.Customers);
    const code = \`KH-TEST-\${id.slice(-3)}\`;
    const ts = nowIso();
    state.Customers.push({
      customer_id: id,
      customer_code: code,
      name,
      type,
      phone: phone || '0900000000',
      status: 'new',
      representative_name: rep,
      created_at: ts,
      updated_at: ts
    });
    audit('customer.create', 'Customer', id);
    flashMsg = \`Đã thêm khách hàng \${code} - \${name} thành công.\`;
    render();
  },

  backup() {
    audit('system.backup', 'Workbook', 'ALL');
    flashMsg = '✅ Sao lưu sổ dữ liệu Google Sheets thành công (Mô phỏng handler R16).';
    render();
  },

  restore() {
    flashMsg = 'ℹ️ Thao tác Restore kiểm tra thành công trên môi trường thử nghiệm tổng hợp (R16/U7).';
    render();
  },

  submit(d) {`;

if (html.includes(oldHandlersSubmit)) {
  html = html.replace(oldHandlersSubmit, newHandlersAdditions);
  console.log('✅ Đã bổ sung các handlers mới: transfer, create-cust, backup, restore');
}

// Thêm sự kiện change cho nc-type để toggle nc-rep-box (Show_If R17)
const oldDocChange = `document.addEventListener('change', e => {
  if (e.target.dataset.act === 'user') handlers.user();
});`;

const newDocChange = `document.addEventListener('change', e => {
  if (e.target.dataset.act === 'user') handlers.user();
  if (e.target.id === 'nc-type') {
    const repBox = document.getElementById('nc-rep-box');
    if (repBox) repBox.style.display = e.target.value === 'business' ? 'block' : 'none';
  }
});`;

if (html.includes(oldDocChange)) {
  html = html.replace(oldDocChange, newDocChange);
  console.log('✅ Đã bổ sung toggle Show_If cho trường đại diện công ty (R17)');
}

fs.writeFileSync(file, html, 'utf8');
console.log('🎉 Hoàn tất cập nhật mockup-template.html!');

