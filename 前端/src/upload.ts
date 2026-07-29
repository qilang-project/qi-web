/**
 * 上传（对标 Phoenix live_file_input）。
 *
 * 文件跟着**已有的 WebSocket** 走：切成块一块块送，服务端边收边落盘。
 * 进度条不在这里画 —— 服务端每收一块就更新状态、重渲染，进度条就是普通的
 * 状态 → HTML。这里只负责把字节送上去。
 *
 * 选 WS 而不是单开 HTTP 端点，是为了复用**已经鉴权过的连接**：不用再做一遍
 * 权限、也不用把 HTTP 请求和 WS 会话对起来。代价是 base64 多 1/3 字节，
 * 所以不适合超大文件（服务端默认卡 8MB）。
 */
import type { Payload } from './types';

/** 每块原始字节数；base64 之后约 341KB 一帧 */
const CHUNK = 256 * 1024;

type Send = (event: string, payload: Payload) => void;

/** 同一条连接里保证 id 不重样（时间戳 + 自增） */
let seq = 0;
function nextId(): string {
  seq += 1;
  return 'u' + Date.now().toString(36) + '_' + seq;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  // 一次性 apply 整个数组在大文件上会爆栈，分小段拼
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(s);
}

/**
 * accept 匹配：支持 "image/*"、".jpg"、"image/png" 逗号分隔。
 * 只是体验上的提前拦截 —— 服务端会独立再判一次，这里放过去了也不要紧。
 */
function matchesAccept(file: File, accept: string): boolean {
  const rules = (accept || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const mime = (file.type || '').toLowerCase();
  const fileName = file.name.toLowerCase();
  return rules.some((r) => {
    if (r.startsWith('.')) return fileName.endsWith(r);
    if (r.endsWith('/*')) return mime.startsWith(r.slice(0, -1));
    return mime === r;
  });
}

async function sendOne(send: Send, group: string, id: string, file: File): Promise<void> {
  let pos = 0;
  // 一块一块读，不把整个文件读进内存 —— 8MB 的图不该在浏览器里也占一份
  while (pos < file.size) {
    const end = Math.min(pos + CHUNK, file.size);
    const buf = await file.slice(pos, end).arrayBuffer();
    pos = end;
    send('__上传块__', {
      up: group,
      id,
      b: toBase64(buf),
      last: pos >= file.size ? 1 : 0,
    });
  }
  // 空文件也要收尾，否则服务端那条永远停在「传输中」
  if (file.size === 0) {
    send('__上传块__', { up: group, id, b: '', last: 1 });
  }
}

/**
 * 选了一批文件：先报元数据（服务端登记 + 校验，进度条立刻出现），再逐个送字节。
 *
 * 一次只送一个文件：并发送并不会更快（同一条 WS 排队），但会让进度条乱跳，
 * 而且服务端要同时开好几个临时文件。
 */
export async function uploadFiles(send: Send, group: string, files: File[], input: HTMLInputElement): Promise<void> {
  const maxBytes = parseInt(input.getAttribute('data-upload-max') || '0', 10);
  const maxCount = parseInt(input.getAttribute('data-upload-count') || '0', 10) || files.length;
  const accept = input.getAttribute('accept') || '';

  const queue: Array<{ id: string; file: File }> = [];
  const metas: Array<Record<string, unknown>> = [];

  files.slice(0, maxCount).forEach((file) => {
    const id = nextId();
    metas.push({ cid: id, name: file.name, size: file.size, type: file.type });
    // 本地先挡一道：200MB 的文件不该先传完再被告知太大。
    // 服务端仍会独立判 —— 这里只是省一趟往返，不是安全边界。
    const tooBig = maxBytes > 0 && file.size > maxBytes;
    if (!tooBig && matchesAccept(file, accept)) queue.push({ id, file });
  });

  if (!metas.length) return;
  send('__上传开始__', { up: group, entries: metas });

  for (const item of queue) {
    try {
      await sendOne(send, group, item.id, item.file);
    } catch {
      // 读文件失败（用户中途拔了 U 盘之类）：这一个跳过，别把后面的也带停
      send('__上传取消__', { up: group, id: item.id });
    }
  }
}

/** 绑定：文件框选择 + 拖放到 data-upload-drop 容器 */
export function bindUploads(send: Send): void {
  document.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement | null;
    if (!el || !el.matches || !el.matches('input[type=file][data-upload]')) return;
    const group = el.getAttribute('data-upload') || '';
    const files = Array.from(el.files || []);
    // 清掉选择：同一个文件连选两次也要能触发（浏览器默认认为「没变化」）
    el.value = '';
    if (files.length) void uploadFiles(send, group, files, el);
  });

  // 拖放：容器上写 data-upload-drop="组名"，字节走和文件框完全一样的路
  document.addEventListener('dragover', (e) => {
    const box = (e.target as Element | null)?.closest?.('[data-upload-drop]');
    if (!box) return;
    e.preventDefault();
    box.classList.add('qi-drop-on');
  });
  document.addEventListener('dragleave', (e) => {
    const box = (e.target as Element | null)?.closest?.('[data-upload-drop]');
    if (box) box.classList.remove('qi-drop-on');
  });
  document.addEventListener('drop', (e) => {
    const box = (e.target as Element | null)?.closest?.('[data-upload-drop]');
    if (!box) return;
    e.preventDefault();
    box.classList.remove('qi-drop-on');
    const group = box.getAttribute('data-upload-drop') || '';
    // 限制条件写在那个组的文件框上，拖放也照着它来
    const input = document.querySelector(
      'input[type=file][data-upload="' + group.replace(/"/g, '') + '"]',
    ) as HTMLInputElement | null;
    const files = Array.from((e as DragEvent).dataTransfer?.files || []);
    if (files.length && input) void uploadFiles(send, group, files, input);
  });
}
