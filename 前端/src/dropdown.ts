/**
 * .qdd 自定义下拉 —— 替掉原生 <select>。
 *
 * 原生 <select> 的选项面板在移动端会脱离控件掉到屏幕底部，CSS 也管不着；这个
 * 贴着框往下弹。值由内部的 hidden input 携带，所以表单提交、FormData 采集
 * 都照旧能用。
 *
 * 点击全部委托在 document 上，所以 morph 换掉节点后不需要重新绑定。
 */
import { attr } from './dom';

function closeAll(except?: Element | null): void {
  const open = document.querySelectorAll('.qdd.open');
  for (let i = 0; i < open.length; i++) {
    if (open[i] !== except) open[i].classList.remove('open');
  }
}

function pick(opt: Element): void {
  const dd = opt.closest('.qdd');
  if (!dd) return;
  const hidden = dd.querySelector('input[type=hidden]') as HTMLInputElement | null;
  const label = dd.querySelector('.qdd-txt');
  const value = attr(opt, 'data-v') || '';
  if (hidden && hidden.value !== value) {
    hidden.value = value;
    // 派 change：应用可能自己监听着（表单提交走 FormData，不依赖这个）
    try { hidden.dispatchEvent(new Event('change', { bubbles: true })); } catch { /* 旧浏览器 */ }
  }
  if (label) label.textContent = opt.textContent;
  const opts = dd.querySelectorAll('.qdd-opt');
  for (let i = 0; i < opts.length; i++) opts[i].classList.remove('sel');
  opt.classList.add('sel');
  dd.classList.remove('open');
}

export function bindDropdowns(): void {
  document.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    if (!t || !t.closest) return;

    const head = t.closest('.qdd-head');
    if (head) {
      const dd = head.parentElement;
      const wasOpen = !!dd && dd.classList.contains('open');
      closeAll(dd);
      if (dd && !wasOpen) dd.classList.add('open');
      e.stopPropagation();
      return;
    }

    const opt = t.closest('.qdd-opt');
    if (opt) {
      pick(opt);
      e.stopPropagation();
      return;
    }

    // 点在别处：收起所有展开的
    closeAll();
  });

  // Esc 收起
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}
