/** 确认框 —— 替代浏览器原生 confirm（原生的没法改样式、移动端体验也差）。 */

/** src/runtime.css 压缩后由 build.mjs 通过 esbuild define 注入。 */
declare const __QI_RUNTIME_CSS__: string;

export function injectStyle(): void {
  const st = document.createElement('style');
  st.textContent = __QI_RUNTIME_CSS__;
  document.head.appendChild(st);
}

export function qiConfirm(msg: string, onOk: () => void): void {
  let ov = document.getElementById('qi-modal');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'qi-modal';
    ov.innerHTML =
      '<div class="qi-modal-card"><div class="qi-modal-title">请确认</div>' +
      '<div class="qi-modal-msg"></div><div class="qi-modal-btns">' +
      '<button type="button" class="qi-modal-cancel">取消</button>' +
      '<button type="button" class="qi-modal-ok">确定</button></div></div>';
    document.body.appendChild(ov);
  }
  const box = ov;
  (box.querySelector('.qi-modal-msg') as HTMLElement).textContent = msg;
  const ok = box.querySelector('.qi-modal-ok') as HTMLButtonElement;
  const cancel = box.querySelector('.qi-modal-cancel') as HTMLButtonElement;
  const close = () => {
    box.style.display = 'none';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter') { close(); onOk(); }
  };
  ok.onclick = () => { close(); onOk(); };
  cancel.onclick = close;
  box.onclick = (e) => { if (e.target === box) close(); };
  document.addEventListener('keydown', onKey);
  box.style.display = 'flex';
  setTimeout(() => ok.focus(), 0);
}
