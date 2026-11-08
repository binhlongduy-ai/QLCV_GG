// Sinh requestId cho thao tác ghi. Máy chủ dùng requestId để nhận ra lần gửi lặp và không ghi trùng.
// Quy tắc: mỗi lần mở một biểu mẫu sinh MỘT requestId dùng cho mọi lần bấm gửi trong biểu mẫu đó;
// mỗi thao tác bấm nút (không có biểu mẫu) sinh requestId mới.

export function newRequestId() {
  const u = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/-/g, '');
  return 'r' + u.slice(0, 32);
}
