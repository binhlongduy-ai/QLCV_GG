import { mount } from './dom.js';
import { Spinner, Skeleton, EmptyState, ErrorState } from './state.js';

/**
 * Vùng dữ liệu bất đồng bộ: đang tải → (rỗng | dữ liệu | lỗi + thử lại).
 *
 * @typedef {Object} AsyncViewProps
 * @property {HTMLElement} container               Phần tử chứa (nội dung bị thay khi đổi trạng thái).
 * @property {() => Promise<any>} loader
 * @property {(data: any, reload: () => Promise<void>) => Node|Node[]} render
 * @property {(data: any) => boolean} [isEmpty]    Trả true thì hiện `empty` thay cho render.
 * @property {{ title: string, hint?: string, action?: Node }} [empty]
 * @property {'spinner'|{ variant: 'list'|'cards'|'kpis', rows?: number }} [loading='spinner']
 * @property {boolean} [keepPrevious=false]        Đang có kết quả: giữ nguyên, làm mờ, không nhảy bố cục.
 * @property {(err: any) => boolean} [ignoreError] Lỗi được xử lý nơi khác (mặc định: phiên hết hạn).
 * @returns {{ reload: () => Promise<void> }}
 *
 * Trường hợp biên đã xử lý: nhiều lần tải chồng nhau (chỉ kết quả của lần gọi MỚI NHẤT được vẽ),
 * container bị gỡ khỏi trang trong lúc chờ (bỏ kết quả), lỗi phiên hết hạn (không vẽ lỗi).
 */
export function AsyncView(props) {
  const p = props, el = p.container;
  const ignore = p.ignoreError || ((e) => e && e.code === 'UNAUTHENTICATED');
  let seq = 0, hasContent = false;

  const loadingNode = () => (p.loading && p.loading !== 'spinner') ? Skeleton(p.loading) : Spinner();

  const reload = async () => {
    const mine = ++seq;
    el.setAttribute('aria-busy', 'true');
    if (p.keepPrevious && hasContent) el.classList.add('busy');
    else { mount(el, loadingNode()); hasContent = false; }
    try {
      const data = await p.loader();
      if (mine !== seq) return;                         // đã có yêu cầu mới hơn
      if (p.isEmpty && p.isEmpty(data) && p.empty) { mount(el, EmptyState(p.empty)); hasContent = false; }
      else { mount(el, p.render(data, reload)); hasContent = true; }
    } catch (e) {
      if (mine !== seq) return;
      if (!ignore(e)) { mount(el, ErrorState({ error: e, onRetry: reload })); hasContent = false; }
    } finally {
      if (mine === seq) { el.classList.remove('busy'); el.removeAttribute('aria-busy'); }
    }
  };
  return { reload };
}
