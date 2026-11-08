// Lớp tương thích cho các view: giữ nguyên chữ ký hàm cũ, ủy quyền sang thư viện thành phần (js/components).
// Quy ước an toàn: dữ liệu luôn vào DOM qua textContent (h() chuyển chuỗi thành text node) – không dùng innerHTML.
// Thành phần mới nên dùng trực tiếp từ './components/index.js'; xem docs/COMPONENTS.md.

import { newRequestId } from './ids.js';
import {
  h, clear, mount, Spinner, EmptyState, ErrorState, AsyncView, Pagination, toast as showToast,
  Dialog, confirm, FormDialog, Badge, Kpi
} from './components/index.js';

export { h, clear, mount };

/* ---------- Nhãn tiếng Việt cho mã nghiệp vụ (mã lưu trữ là tiếng Anh snake_case) ---------- */
export const L = {
  status: { not_started: 'Chưa làm', in_progress: 'Đang thực hiện', completed: 'Đã hoàn thành' },
  priority: { high: 'Cao', normal: 'Bình thường', low: 'Thấp' },
  review: { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối' },
  ctype: { personal: 'Cá nhân', business: 'Doanh nghiệp' },
  cstatus: { new: 'Mới', managed: 'Đang quản lý' },
  ustatus: { active: 'Hoạt động', inactive: 'Vô hiệu hóa' },
  role: { Admin: 'Quản trị', BGD: 'Ban Giám đốc', KSV: 'Kiểm soát viên', CBTD: 'Cán bộ tín dụng' },
  assign: { primary: 'Phụ trách chính', collaborator: 'Phối hợp' },
  audit: {
    'user.create': 'Tạo người dùng', 'user.update': 'Sửa người dùng', 'customer.create': 'Tạo khách hàng',
    'customer.update': 'Sửa khách hàng', 'customer.archive': 'Lưu trữ khách hàng', 'customer.restore': 'Khôi phục khách hàng',
    'task.create': 'Tạo công việc', 'task.assign': 'Phân công', 'task.transfer': 'Chuyển giao', 'task.update': 'Sửa công việc',
    'task.start': 'Bắt đầu công việc', 'task.archive': 'Lưu trữ công việc', 'task.restore': 'Khôi phục công việc',
    'progress.submit': 'Gửi tiến độ', 'progress.approve': 'Duyệt tiến độ', 'progress.reject': 'Từ chối tiến độ',
    'task.auto_complete': 'Tự động hoàn thành', 'admin.backup': 'Sao lưu', 'admin.reconcile': 'Vá dữ liệu'
  }
};
export const lbl = (map, k) => (map && map[k]) || k || '';

/* ---------- Định dạng ---------- */
export function fmtDate(ymd) {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const todayYmd = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

/* ---------- Thành phần (ủy quyền sang js/components) ---------- */
export function badge(text, kind) { return Badge({ label: text, tone: kind }); }
export const statusBadge = (s) => badge(lbl(L.status, s), 'st-' + s);
export const priorityBadge = (p) => badge(lbl(L.priority, p), 'pr-' + p);
export const reviewBadge = (s) => badge(lbl(L.review, s), 'rv-' + s);

export function kpi(label, value, opts = {}) { return Kpi({ label, value, hint: opts.hint, tone: opts.tone, href: opts.href }); }

export function spinner(text) { return Spinner({ label: text }); }
export function emptyState(title, hint, action) { return EmptyState({ title, hint, action }); }
export function errorState(err, retry) { return ErrorState({ error: err, onRetry: retry }); }

/** Tải dữ liệu rồi vẽ; có trạng thái đang tải và lỗi + nút thử lại (R14). */
export function load(root, loader, render) {
  return AsyncView({ container: root, loader, render }).reload();
}

/**
 * Khu vực danh sách: lần đầu hiện trạng thái đang tải; các lần sau giữ kết quả cũ (làm mờ) cho tới khi có kết quả mới.
 * Chỉ kết quả của lần gọi mới nhất được vẽ. Trả về hàm tải lại.
 */
export function listLoader(results, loader, render) {
  return AsyncView({ container: results, loader, render, keepPrevious: true }).reload;
}

export function pager(res, onPage) {
  return Pagination({ page: res.page, pageSize: res.pageSize, total: res.total, onPage });
}

/* ---------- Toast ---------- */
export function toast(msg, kind) { return showToast(msg, { kind: kind || 'info' }); }

/* ---------- Hộp thoại ---------- */
export function dialog({ title, body, actions }) { return Dialog({ title, body, actions }); }

export function confirmDialog(title, message, okLabel, danger) {
  return confirm({ title, message, okLabel, danger });
}

/**
 * Hộp thoại biểu mẫu. fields: [{name,label,type,required,options,value,hint,min,max,maxlength,showIf(values)}]
 * onSubmit(values, { requestId }) trả Promise; ném ApiError có details.field để hiện lỗi ngay dưới ô nhập.
 * Một requestId cho cả biểu mẫu: gửi lại sau lỗi mạng không tạo bản ghi thứ hai.
 */
export function formDialog({ title, fields, submitLabel, onSubmit, intro }) {
  return FormDialog({ title, fields, submitLabel, onSubmit, intro, requestId: newRequestId() });
}
