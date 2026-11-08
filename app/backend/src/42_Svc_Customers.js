/**
 * Use case: khách hàng (R9, R17). Không có dư nợ, nhóm nợ hay thông tin tín dụng (R9, R13).
 * Trường "Người đại diện công ty" chỉ có ở khách hàng doanh nghiệp (R17). Xóa = lưu trữ (xóa mềm).
 */
(function (Q) {
  'use strict';
  var U = Q.Util, P = Q.Policy, L = Q.Config.LIMITS, E = Q.Enums, D = Q.Domain;

  /** Kiểm tra và chuẩn hóa các trường khách hàng từ tham số. partial=true: chỉ các trường có mặt trong p. */
  function fields(p, partial) {
    var out = {};
    function has(k) { return p[k] !== undefined; }
    if (!partial || has('name')) out.name = U.str(p.name, { field: 'name', label: 'Tên khách hàng', required: true, max: L.name });
    if (!partial || has('type')) out.type = U.oneOf(p.type, E.customerType, { field: 'type', label: 'Loại khách hàng', required: true });
    if (!partial || has('phone')) out.phone = U.str(p.phone, { field: 'phone', label: 'Số điện thoại', required: true, max: L.phone, pattern: /^[0-9+\s().-]{8,20}$/ });
    if (!partial || has('status')) out.status = U.oneOf(p.status, E.customerStatus, { field: 'status', label: 'Nhóm khách hàng', def: 'new' });
    if (has('companyRepresentative')) out.company_representative = U.str(p.companyRepresentative, { field: 'companyRepresentative', label: 'Người đại diện', max: L.name });
    return out;
  }

  var C = Q.CustomerService = {};

  C.list = function (ctx, p) {
    P.require(ctx, 'customer.view');
    p = p || {};
    var rows = P.visibleCustomers(ctx);
    if (!U.bool(p.includeArchived)) rows = rows.filter(function (c) { return !c.archived_at; });
    if (p.type) rows = rows.filter(function (c) { return c.type === p.type; });
    if (p.status) rows = rows.filter(function (c) { return c.status === p.status; });
    if (p.q) {
      var q = U.norm(String(p.q).slice(0, 100));
      rows = rows.filter(function (c) { return U.norm(c.name + ' ' + c.customer_code + ' ' + c.phone).indexOf(q) >= 0; });
    }
    rows = U.sortBy(rows, function (c) { return U.norm(c.name); }, 'asc');
    var page = U.paginate(rows, p);
    page.items = page.items.map(Q.Presenters.customer);
    return page;
  };

  C.get = function (ctx, p) {
    P.require(ctx, 'customer.view');
    var c = P.customerOrFail(ctx, p && p.customerId);
    var tasks = P.visibleTasks(ctx).filter(function (t) { return t.customer_id === c.customer_id && !t.archived_at; });
    return { customer: Q.Presenters.customer(c), tasks: Q.Presenters.tasks(ctx, tasks) };
  };

  C.create = function (ctx, p, meta) {
    P.require(ctx, 'customer.maintain');
    var key = 'evt-customer.create-' + meta.requestId;
    var dup = Q.Audit.find(key);
    if (dup) return { customer: Q.Presenters.customer(Q.Repo.customers.find(dup.entity_id)), replayed: true };

    var f = fields(p, false);
    D.Customer.assertRepresentativeAllowed(f.type, f.company_representative);
    var id = Q.Repo.customers.nextId(), code;
    if (p.customerCode) {
      code = U.str(p.customerCode, { field: 'customerCode', label: 'Mã khách hàng', max: 30, pattern: /^[A-Za-z0-9_-]{3,30}$/ });
    } else {
      code = D.Codes.customerCodeFor(id);
    }
    if (Q.Repo.customers.byCode(code).length) U.invalid('customerCode', 'Mã khách hàng đã tồn tại.');
    var now = U.isoNow();
    var c = Q.Repo.customers.insert({
      customer_id: id, customer_code: code, name: f.name, type: f.type, phone: f.phone, status: f.status,
      created_at: now, updated_at: now, company_representative: f.company_representative || '', archived_at: ''
    });
    Q.Audit.log(ctx, 'customer.create', 'Customer', c.customer_id, key);
    return { customer: Q.Presenters.customer(c), replayed: false };
  };

  C.update = function (ctx, p, meta) {
    P.require(ctx, 'customer.maintain');
    var c = Q.Repo.customers.find(p.customerId);
    if (!c) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    if (c.archived_at) U.fail('CONFLICT', 'Khách hàng đã được lưu trữ.');
    var f = fields(p, true);
    var type = f.type || c.type;
    if (type === 'personal') {
      D.Customer.assertRepresentativeAllowed(type, f.company_representative);
      if (f.type === 'personal') f.company_representative = '';   // đổi sang cá nhân thì xóa trường đại diện
    }
    if (!Object.keys(f).length) U.invalid(null, 'Không có thay đổi nào để lưu.');
    f.updated_at = U.isoNow();
    var up = Q.Repo.customers.update(c.customer_id, f);
    Q.Audit.log(ctx, 'customer.update', 'Customer', c.customer_id, 'evt-customer.update-' + meta.requestId);
    return { customer: Q.Presenters.customer(up) };
  };

  /** Lưu trữ khách hàng: không cho lưu trữ khi còn công việc chưa hoàn thành. */
  C.archive = function (ctx, p, meta) {
    P.require(ctx, 'customer.delete');
    var c = Q.Repo.customers.find(p.customerId);
    if (!c) U.fail('NOT_FOUND', 'Không tìm thấy khách hàng.');
    var open = Q.Repo.tasks.byCustomer(c.customer_id).filter(function (t) { return D.Task.isOpen(t); });
    var archive = p.archived === undefined ? true : U.bool(p.archived);
    if (archive && open.length) U.fail('CONFLICT', 'Khách hàng còn ' + open.length + ' công việc chưa hoàn thành, không thể lưu trữ.');
    if (archive === !!c.archived_at) return { customer: Q.Presenters.customer(c) };
    var up = Q.Repo.customers.update(c.customer_id, { archived_at: archive ? U.isoNow() : '', updated_at: U.isoNow() });
    Q.Audit.log(ctx, archive ? 'customer.archive' : 'customer.restore', 'Customer', c.customer_id, 'evt-customer.archive-' + meta.requestId);
    return { customer: Q.Presenters.customer(up) };
  };
})(QLCV);
