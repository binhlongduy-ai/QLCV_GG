/* TỆP SINH TỰ ĐỘNG bởi tools/build.js từ data/appsheet-synthetic/*.csv – KHÔNG sửa tay.
 * Chỉ chứa dữ liệu tham chiếu (vai trò, quyền) và dữ liệu TỔNG HỢP (R13). Không có dữ liệu thật. */
QLCV.SeedData = {
 "reference": {
  "Roles": [
   {
    "role_id": "ROL-ADMIN",
    "code": "Admin",
    "name": "Quản trị",
    "description": "Quản lý người dùng và toàn bộ phạm vi thí điểm"
   },
   {
    "role_id": "ROL-BGD",
    "code": "BGD",
    "name": "Ban Giám đốc",
    "description": "Xem phạm vi thí điểm; tạo và giao việc; chỉ đọc khách hàng"
   },
   {
    "role_id": "ROL-KSV",
    "code": "KSV",
    "name": "Kiểm soát viên",
    "description": "Quản lý công việc; duyệt tiến độ; duy trì khách hàng"
   },
   {
    "role_id": "ROL-CBTD",
    "code": "CBTD",
    "name": "Cán bộ tín dụng",
    "description": "Xem và xử lý công việc được giao; gửi tiến độ"
   }
  ],
  "Permissions": [
   {
    "permission_id": "PER-01",
    "code": "task.view",
    "name": "Xem công việc",
    "description": "Xem công việc trong phạm vi được phép"
   },
   {
    "permission_id": "PER-02",
    "code": "task.create",
    "name": "Tạo công việc",
    "description": "Tạo công việc và giao người thực hiện"
   },
   {
    "permission_id": "PER-03",
    "code": "task.update",
    "name": "Cập nhật công việc",
    "description": "Cập nhật phân công và quản trị công việc; lưu trữ thay vì xóa cứng"
   },
   {
    "permission_id": "PER-04",
    "code": "task.transfer",
    "name": "Chuyển giao người thực hiện chính",
    "description": "Đổi CBTD chính của công việc"
   },
   {
    "permission_id": "PER-05",
    "code": "task.start",
    "name": "Bắt đầu công việc",
    "description": "Chuyển công việc được giao sang Đang thực hiện"
   },
   {
    "permission_id": "PER-06",
    "code": "customer.view",
    "name": "Xem khách hàng",
    "description": "Xem khách hàng trong phạm vi được phép"
   },
   {
    "permission_id": "PER-07",
    "code": "customer.maintain",
    "name": "Duy trì khách hàng",
    "description": "Tạo và cập nhật khách hàng; không xóa"
   },
   {
    "permission_id": "PER-08",
    "code": "customer.delete",
    "name": "Xóa khách hàng",
    "description": "Xóa khách hàng"
   },
   {
    "permission_id": "PER-09",
    "code": "progress.submit",
    "name": "Gửi tiến độ",
    "description": "Gửi cập nhật tiến độ cho công việc được giao"
   },
   {
    "permission_id": "PER-10",
    "code": "progress.review",
    "name": "Duyệt tiến độ",
    "description": "Duyệt hoặc từ chối cập nhật tiến độ"
   },
   {
    "permission_id": "PER-11",
    "code": "dashboard.view",
    "name": "Xem bảng điều khiển",
    "description": "Số liệu trong phạm vi được phép"
   },
   {
    "permission_id": "PER-12",
    "code": "dashboard.view_director",
    "name": "Bảng điều khiển Giám đốc",
    "description": "Có điều kiện; chờ xác nhận cho BGD"
   },
   {
    "permission_id": "PER-13",
    "code": "audit.view",
    "name": "Xem nhật ký kiểm toán",
    "description": "Xem nhật ký kiểm toán"
   },
   {
    "permission_id": "PER-14",
    "code": "notification.view",
    "name": "Xem thông báo",
    "description": "Xem thông báo của chính mình"
   },
   {
    "permission_id": "PER-15",
    "code": "user.manage",
    "name": "Quản lý người dùng",
    "description": "Quản lý người dùng; Backup và Restore"
   }
  ],
  "RolePermissions": [
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-03",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-04",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-07",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-08",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-10",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-12",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-13",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-ADMIN",
    "permission_id": "PER-15",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-03",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-BGD",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-03",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-04",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-07",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-10",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-KSV",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-01",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-02",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-05",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-06",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-09",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-11",
    "created_at": "2026-10-13T07:50:00Z"
   },
   {
    "role_id": "ROL-CBTD",
    "permission_id": "PER-14",
    "created_at": "2026-10-13T07:50:00Z"
   }
  ]
 },
 "demo": {
  "Users": [
   {
    "user_id": "USR-001",
    "email": "admin@example.com",
    "employee_code": "NV-TEST-001",
    "full_name": "Quản trị mẫu",
    "role_id": "ROL-ADMIN",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-002",
    "email": "bgd@example.com",
    "employee_code": "NV-TEST-002",
    "full_name": "Ban giám đốc mẫu",
    "role_id": "ROL-BGD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-003",
    "email": "ksv01@example.com",
    "employee_code": "NV-TEST-003",
    "full_name": "KSV mẫu 01",
    "role_id": "ROL-KSV",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-004",
    "email": "cbtd01@example.com",
    "employee_code": "NV-TEST-004",
    "full_name": "CBTD mẫu 01",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-005",
    "email": "cbtd02@example.com",
    "employee_code": "NV-TEST-005",
    "full_name": "CBTD mẫu 02",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-006",
    "email": "cbtd03@example.com",
    "employee_code": "NV-TEST-006",
    "full_name": "CBTD mẫu 03",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "active",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   },
   {
    "user_id": "USR-007",
    "email": "cbtd-inactive@example.com",
    "employee_code": "NV-TEST-007",
    "full_name": "CBTD không hoạt động mẫu",
    "role_id": "ROL-CBTD",
    "org_unit": "DV-THU-NGHIEM",
    "status": "inactive",
    "created_at": "2026-10-13T07:50:00Z",
    "updated_at": "2026-10-13T07:50:00Z"
   }
  ],
  "Customers": [
   {
    "customer_id": "CUS-001",
    "customer_code": "KH-TEST-001",
    "name": "Khách hàng mẫu A",
    "type": "personal",
    "phone": "0900000001",
    "status": "managed",
    "created_at": "2026-10-13T07:52:00Z",
    "updated_at": "2026-10-13T07:52:00Z",
    "archived_at": "",
    "company_representative": ""
   },
   {
    "customer_id": "CUS-002",
    "customer_code": "KH-TEST-002",
    "name": "Công ty mẫu B",
    "type": "business",
    "phone": "0900000002",
    "status": "new",
    "created_at": "2026-10-13T07:52:00Z",
    "updated_at": "2026-10-13T07:52:00Z",
    "archived_at": "",
    "company_representative": "Người đại diện mẫu B"
   },
   {
    "customer_id": "CUS-003",
    "customer_code": "KH-TEST-003",
    "name": "Khách hàng mẫu C",
    "type": "personal",
    "phone": "0900000003",
    "status": "managed",
    "created_at": "2026-10-13T07:52:00Z",
    "updated_at": "2026-10-13T07:52:00Z",
    "archived_at": "",
    "company_representative": ""
   }
  ],
  "Tasks": [
   {
    "task_id": "TSK-001",
    "task_code": "CV-TEST-001",
    "customer_id": "CUS-001",
    "title": "Thẩm định hồ sơ mẫu A",
    "description": "Thu thập và kiểm tra hồ sơ mẫu",
    "status": "in_progress",
    "priority": "high",
    "due_at": "2026-10-20",
    "created_by_user_id": "USR-003",
    "completed_at": "",
    "created_at": "2026-10-13T08:10:00Z",
    "updated_at": "2026-10-13T09:30:00Z",
    "archived_at": ""
   },
   {
    "task_id": "TSK-002",
    "task_code": "CV-TEST-002",
    "customer_id": "CUS-002",
    "title": "Kiểm tra tài sản bảo đảm mẫu B",
    "description": "Kiểm tra tài sản theo danh mục mẫu",
    "status": "not_started",
    "priority": "normal",
    "due_at": "2026-10-25",
    "created_by_user_id": "USR-004",
    "completed_at": "",
    "created_at": "2026-10-13T08:20:00Z",
    "updated_at": "2026-10-13T08:20:00Z",
    "archived_at": ""
   },
   {
    "task_id": "TSK-003",
    "task_code": "CV-TEST-003",
    "customer_id": "CUS-003",
    "title": "Thu thập hồ sơ tài chính mẫu C",
    "description": "Thu thập báo cáo tài chính mẫu",
    "status": "completed",
    "priority": "high",
    "due_at": "2026-10-10",
    "created_by_user_id": "USR-001",
    "completed_at": "2026-10-12T10:00:00Z",
    "created_at": "2026-10-09T09:00:00Z",
    "updated_at": "2026-10-12T10:00:00Z",
    "archived_at": ""
   },
   {
    "task_id": "TSK-004",
    "task_code": "CV-TEST-004",
    "customer_id": "CUS-001",
    "title": "Báo cáo tiến độ mẫu D",
    "description": "Báo cáo định kỳ mẫu",
    "status": "not_started",
    "priority": "low",
    "due_at": "2026-10-30",
    "created_by_user_id": "USR-002",
    "completed_at": "",
    "created_at": "2026-10-13T08:30:00Z",
    "updated_at": "2026-10-13T08:30:00Z",
    "archived_at": ""
   }
  ],
  "TaskAssignees": [
   {
    "assignment_id": "ASG-001",
    "task_id": "TSK-001",
    "user_id": "USR-004",
    "assignee_email_snapshot": "cbtd01@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-13T08:10:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-002",
    "task_id": "TSK-001",
    "user_id": "USR-005",
    "assignee_email_snapshot": "cbtd02@example.com",
    "assignment_role": "collaborator",
    "assigned_at": "2026-10-13T08:12:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-003",
    "task_id": "TSK-001",
    "user_id": "USR-006",
    "assignee_email_snapshot": "cbtd03@example.com",
    "assignment_role": "collaborator",
    "assigned_at": "2026-10-13T08:11:00Z",
    "active": "FALSE"
   },
   {
    "assignment_id": "ASG-004",
    "task_id": "TSK-002",
    "user_id": "USR-004",
    "assignee_email_snapshot": "cbtd01@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-13T08:20:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-005",
    "task_id": "TSK-003",
    "user_id": "USR-004",
    "assignee_email_snapshot": "cbtd01@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-09T09:00:00Z",
    "active": "TRUE"
   },
   {
    "assignment_id": "ASG-006",
    "task_id": "TSK-004",
    "user_id": "USR-006",
    "assignee_email_snapshot": "cbtd03@example.com",
    "assignment_role": "primary",
    "assigned_at": "2026-10-13T08:30:00Z",
    "active": "TRUE"
   }
  ],
  "TaskUpdates": [
   {
    "update_id": "UPD-001",
    "task_id": "TSK-001",
    "progress_pct": "30",
    "narrative": "Đã thu thập giấy tờ cơ bản mẫu",
    "submitted_by_user_id": "USR-004",
    "submitted_by_email_snapshot": "cbtd01@example.com",
    "submitted_at": "2026-10-13T09:00:00Z",
    "review_status": "approved",
    "reviewed_by_user_id": "USR-003",
    "reviewed_by_email_snapshot": "ksv01@example.com",
    "reviewed_at": "2026-10-13T09:30:00Z",
    "review_comment": "Đạt"
   },
   {
    "update_id": "UPD-002",
    "task_id": "TSK-001",
    "progress_pct": "60",
    "narrative": "Đang đối chiếu hồ sơ mẫu",
    "submitted_by_user_id": "USR-005",
    "submitted_by_email_snapshot": "cbtd02@example.com",
    "submitted_at": "2026-10-13T10:00:00Z",
    "review_status": "pending",
    "reviewed_by_user_id": "",
    "reviewed_by_email_snapshot": "",
    "reviewed_at": "",
    "review_comment": ""
   },
   {
    "update_id": "UPD-003",
    "task_id": "TSK-003",
    "progress_pct": "80",
    "narrative": "Còn thiếu một chứng từ mẫu",
    "submitted_by_user_id": "USR-004",
    "submitted_by_email_snapshot": "cbtd01@example.com",
    "submitted_at": "2026-10-11T09:00:00Z",
    "review_status": "rejected",
    "reviewed_by_user_id": "USR-003",
    "reviewed_by_email_snapshot": "ksv01@example.com",
    "reviewed_at": "2026-10-11T11:00:00Z",
    "review_comment": "Cần bổ sung chứng từ"
   },
   {
    "update_id": "UPD-004",
    "task_id": "TSK-003",
    "progress_pct": "100",
    "narrative": "Hoàn thành hồ sơ mẫu",
    "submitted_by_user_id": "USR-004",
    "submitted_by_email_snapshot": "cbtd01@example.com",
    "submitted_at": "2026-10-12T09:00:00Z",
    "review_status": "approved",
    "reviewed_by_user_id": "USR-003",
    "reviewed_by_email_snapshot": "ksv01@example.com",
    "reviewed_at": "2026-10-12T10:00:00Z",
    "review_comment": "Đạt"
   }
  ],
  "Notifications": [
   {
    "notification_id": "NTF-001",
    "recipient_user_id": "USR-004",
    "event_type": "task_assigned",
    "source_record_id": "ASG-001",
    "request_or_event_key": "evt-assign-ASG-001",
    "message": "Bạn được giao công việc CV-TEST-001",
    "created_at": "2026-10-13T08:10:00Z",
    "read_at": "2026-10-13T08:15:00Z"
   },
   {
    "notification_id": "NTF-002",
    "recipient_user_id": "USR-003",
    "event_type": "progress_submitted",
    "source_record_id": "UPD-001",
    "request_or_event_key": "evt-submit-UPD-001",
    "message": "Có cập nhật tiến độ chờ duyệt CV-TEST-001",
    "created_at": "2026-10-13T09:00:00Z",
    "read_at": ""
   },
   {
    "notification_id": "NTF-003",
    "recipient_user_id": "USR-004",
    "event_type": "progress_approved",
    "source_record_id": "UPD-001",
    "request_or_event_key": "evt-review-UPD-001",
    "message": "Cập nhật tiến độ CV-TEST-001 đã được duyệt",
    "created_at": "2026-10-13T09:30:00Z",
    "read_at": ""
   },
   {
    "notification_id": "NTF-004",
    "recipient_user_id": "USR-004",
    "event_type": "progress_rejected",
    "source_record_id": "UPD-003",
    "request_or_event_key": "evt-review-UPD-003",
    "message": "Cập nhật tiến độ CV-TEST-003 bị từ chối; xem lý do trong ứng dụng",
    "created_at": "2026-10-11T11:00:00Z",
    "read_at": ""
   }
  ],
  "AuditLogs": [
   {
    "audit_id": "AUD-001",
    "actor_user_id": "USR-001",
    "actor_email_snapshot": "admin@example.com",
    "action": "user.create",
    "entity_type": "User",
    "entity_id": "USR-004",
    "request_or_event_key": "evt-aud-001",
    "created_at": "2026-10-13T07:55:00Z"
   },
   {
    "audit_id": "AUD-002",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "customer.create",
    "entity_type": "Customer",
    "entity_id": "CUS-001",
    "request_or_event_key": "evt-aud-002",
    "created_at": "2026-10-13T08:00:00Z"
   },
   {
    "audit_id": "AUD-003",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "task.create",
    "entity_type": "Task",
    "entity_id": "TSK-001",
    "request_or_event_key": "evt-aud-003",
    "created_at": "2026-10-13T08:10:00Z"
   },
   {
    "audit_id": "AUD-004",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "task.assign",
    "entity_type": "TaskAssignee",
    "entity_id": "ASG-001",
    "request_or_event_key": "evt-aud-004",
    "created_at": "2026-10-13T08:10:00Z"
   },
   {
    "audit_id": "AUD-005",
    "actor_user_id": "USR-004",
    "actor_email_snapshot": "cbtd01@example.com",
    "action": "progress.submit",
    "entity_type": "TaskUpdate",
    "entity_id": "UPD-001",
    "request_or_event_key": "evt-aud-005",
    "created_at": "2026-10-13T09:00:00Z"
   },
   {
    "audit_id": "AUD-006",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "progress.approve",
    "entity_type": "TaskUpdate",
    "entity_id": "UPD-001",
    "request_or_event_key": "evt-aud-006",
    "created_at": "2026-10-13T09:30:00Z"
   },
   {
    "audit_id": "AUD-007",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "progress.reject",
    "entity_type": "TaskUpdate",
    "entity_id": "UPD-003",
    "request_or_event_key": "evt-aud-007",
    "created_at": "2026-10-11T11:00:00Z"
   },
   {
    "audit_id": "AUD-008",
    "actor_user_id": "USR-003",
    "actor_email_snapshot": "ksv01@example.com",
    "action": "task.auto_complete",
    "entity_type": "Task",
    "entity_id": "TSK-003",
    "request_or_event_key": "evt-aud-008",
    "created_at": "2026-10-12T10:00:00Z"
   }
  ]
 }
};
