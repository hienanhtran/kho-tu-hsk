/* ══════════════════════════════════════════════════════════════════
   KHO TỪ HSK — app.js
   ------------------------------------------------------------------
   MỤC LỤC
     0. Tiện ích chung
     1. Trạng thái & lưu trữ
     2. Google Sheets client (gviz JSONP + Apps Script)
     3. Dựng dữ liệu & so sánh khác biệt (diff)
     4. Thuật toán ngắt quãng SM-2
     5. Phát âm
     6. Khung app: điều hướng, modal, toast
     7. Màn Kho từ
     8. Chi tiết từ & form thêm/sửa
     9. Màn Học
    10. Màn Thống kê
    11. Màn Cài đặt & khai báo cột
    12. Đồng bộ
    13. Khởi động
   ══════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ═══ 0. TIỆN ÍCH CHUNG ═══════════════════════════════════════════ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const MIN = 60000, DAY = 86400000;
const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(c => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return n;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/* Bỏ dấu: dùng cho tìm kiếm cả pinyin (hǎo → hao) lẫn tiếng Việt (nghĩa → nghia) */
function noAccent(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(COMBINING, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/ü/g, 'u').replace(/ǖ|ǘ|ǚ|ǜ/g, 'u')
    .toLowerCase().trim();
}
/* Ô "Nghĩa" trong sheet gộp cả nghĩa lẫn câu ví dụ (dòng nào có chữ Hán là câu
   ví dụ). Thẻ trong lưới chỉ lấy nghĩa, bản đầy đủ vẫn nằm ở màn chi tiết. */
function meaningOnly(txt) {
  const raw = String(txt || '');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const clean = lines.filter(l => !l.match(CJK_RE));
  const pick = clean[0] || lines[0] || '';
  return pick.replace(/^[-•*\s]+/, '').trim();
}
function uid() {
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function debounce(fn, ms) {
  let t; return function () { clearTimeout(t); const a = arguments, s = this; t = setTimeout(() => fn.apply(s, a), ms); };
}
function todayKey(d) {
  const t = d ? new Date(d) : new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function fmtClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') +
         ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}
/* Khoảng thời gian → chữ tiếng Việt gọn */
function fmtIvl(ms) {
  if (ms < MIN) return '<1 phút';
  if (ms < 60 * MIN) return Math.round(ms / MIN) + ' phút';
  if (ms < DAY) return Math.round(ms / (60 * MIN)) + ' giờ';
  const d = ms / DAY;
  if (d < 31) return Math.round(d) + ' ngày';
  if (d < 365) return (Math.round(d / 30.4 * 10) / 10) + ' tháng';
  return (Math.round(d / 365 * 10) / 10) + ' năm';
}

/* ═══ 0b. BỘ ICON (SVG nét mảnh, không dùng emoji) ═══════════════ */

const ICONS = {
  book:    '<path d="M3 4.5h5.2A3.3 3.3 0 0 1 11.5 7.8V20a2.8 2.8 0 0 0-2.8-2.5H3z"/><path d="M21 4.5h-5.2a3.3 3.3 0 0 0-3.3 3.3V20a2.8 2.8 0 0 1 2.8-2.5H21z"/>',
  repeat:  '<path d="M16.5 2.5 20.5 6l-4 3.5"/><path d="M3.5 11.5v-1.8a3.7 3.7 0 0 1 3.7-3.7H20.5"/><path d="M7.5 21.5 3.5 18l4-3.5"/><path d="M20.5 12.5v1.8a3.7 3.7 0 0 1-3.7 3.7H3.5"/>',
  chart:   '<path d="M4 20.5V11"/><path d="M10 20.5V4"/><path d="M16 20.5v-6.5"/><path d="M21.5 20.5h-19"/>',
  gear:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  volume:  '<path d="M11 4.5 6.5 8.5H3v7h3.5L11 19.5z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.8 6.4a8 8 0 0 1 0 11.2"/>',
  search:  '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/>',
  refresh: '<path d="M21 11.5A9 9 0 1 1 18.4 5.6"/><path d="M21 3.5v6h-6"/>',
  moon:    '<path d="M21 13.2A8.6 8.6 0 1 1 11.3 3a6.7 6.7 0 0 0 9.7 10.2z"/>',
  x:       '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  plus:    '<path d="M12 5v14"/><path d="M5 12h14"/>',
  left:    '<path d="M15 19 8 12l7-7"/>',
  right:   '<path d="M9 5l7 7-7 7"/>',
  down:    '<path d="M5.5 8.75 12 15.25l6.5-6.5"/>',
  award:   '<circle cx="12" cy="9" r="6"/><path d="M8.2 14.2 7 22l5-2.8L17 22l-1.2-7.8"/>',
  inbox:   '<path d="M21.5 12.5h-5l-1.7 2.6H9.2l-1.7-2.6h-5"/><path d="M6.1 4.6 2.5 12.5v5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5l-3.6-7.9a2 2 0 0 0-1.8-1.1H7.9a2 2 0 0 0-1.8 1.1z"/>',
  edit:    '<path d="M12 20.5h9"/><path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L7.3 18.7l-4 1 1-4z"/>',
  trash:   '<path d="M3.5 6h17"/><path d="M8.5 6V4.2A1.7 1.7 0 0 1 10.2 2.5h3.6A1.7 1.7 0 0 1 15.5 4.2V6"/><path d="M18.5 6l-1 13.4a2 2 0 0 1-2 1.6h-7a2 2 0 0 1-2-1.6L5.5 6"/>'
};
function icon(name, size) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size || 16);
  s.setAttribute('height', size || 16);
  s.setAttribute('class', 'ic');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}
/* Điền icon cho mọi phần tử có data-ico trong HTML tĩnh */
function paintIcons(root) {
  $$('[data-ico]', root || document).forEach(e => {
    if (e._ico) return;
    e._ico = 1;
    e.insertBefore(icon(e.getAttribute('data-ico'), +e.getAttribute('data-ico-size') || 16), e.firstChild);
  });
}

/* ═══ 1. TRẠNG THÁI & LƯU TRỮ ════════════════════════════════════ */

const K = { lessons: 'hsk.lessons', cfg: 'hsk.cfg', words: 'hsk.words', prog: 'hsk.prog', log: 'hsk.log', queue: 'hsk.queue', meta: 'hsk.meta', lookup: 'hsk.lookup', rads: 'hsk.rads' };

/* Các mục app hiểu được. hints = từ khoá để tự đoán cột khi đọc Sheet */
const FIELDS = [
  { key: 'hanzi',     label: 'Chữ Hán',           req: true,  hints: ['hán', 'hanzi', 'chữ hán', 'chu han', 'từ vựng', 'tu vung', 'word', '汉字', 'tiếng trung'] },
  { key: 'pinyin',    label: 'Pinyin',            req: true,  hints: ['pinyin', 'phiên âm', 'phien am', 'pin yin', '拼音'] },
  { key: 'nghiaViet', label: 'Nghĩa tiếng Việt',  req: true,  hints: ['nghĩa', 'nghia', 'meaning', 'dịch', 'dich', 'tiếng việt', 'tieng viet'] },
  { key: 'hsk',       label: 'Cấp HSK',           hints: ['hsk', 'cấp', 'cap do', 'level', 'trình độ'] },
  { key: 'chuDe',     label: 'Chủ đề',            hints: ['chủ đề', 'chu de', 'topic', 'category', 'nhóm', 'bài', 'chuyên đề'] },
  { key: 'boThu',     label: 'Bộ thủ',            hints: ['bộ thủ', 'bo thu', 'radical', '部首', 'bộ'] },
  { key: 'loaiTu',    label: 'Loại từ',           hints: ['loại từ', 'loai tu', 'từ loại', 'word type', 'pos'] },
  { key: 'viDu',      label: 'Ví dụ / đặt câu',   hints: ['đặt câu', 'dat cau', 'ví dụ', 'vi du', 'example', 'câu mẫu', 'mẫu câu'] },
  { key: 'nghiaViDu', label: 'Nghĩa ví dụ',       hints: ['nghĩa ví dụ', 'dịch ví dụ', 'example meaning', 'nghĩa câu'] },
  { key: 'ghiChu',    label: 'Ghi chú / mẹo nhớ', hints: ['cách nhớ', 'cach nho', 'mẹo nhớ', 'ghi chú', 'ghi chu', 'note', 'chú thích', 'mẹo'] },
  { key: 'audio',     label: 'File/link phát âm', hints: ['audio', 'âm thanh', 'am thanh', 'sound', 'mp3'] },
  { key: 'ngayHoc',   label: 'Ngày học',          hints: ['ngày', 'ngay', 'date', 'timestamp', 'dấu thời gian', 'thời gian'] }
];

/* ─────────────────────────────────────────────────────────────────
   CẤU HÌNH NHÚNG SẴN
   Mở app là chạy ngay với Sheet dưới đây, không phải dán link lần nào.
   Đổi sang Sheet khác: sửa 3 dòng đầu ở đây, hoặc dán link mới trong
   Cài đặt (cái đã lưu trong máy luôn được ưu tiên hơn phần này).
   ───────────────────────────────────────────────────────────────── */
/* Phải khớp với version.json đặt cạnh index.html. Mỗi lần đưa bản mới lên
   thì đổi cả hai chỗ; app sẽ thấy lệch và mời người dùng cập nhật. */
const APP_VER = '17';

const PRESET = {
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1kKAr7Yd6kDt2z6k6On_WBRplEfZxHL77QKzXWuFk8ds/edit',
  sheetId:  '1kKAr7Yd6kDt2z6k6On_WBRplEfZxHL77QKzXWuFk8ds',
  tab:      'HSK 1',
  // Cột nào là gì. Sheet đổi tên cột thì app tự dò lại nên không sợ hỏng.
  map: {
    hanzi: 'Chữ hán', pinyin: 'Pinyin', nghiaViet: 'Nghĩa', hsk: 'HSK',
    chuDe: 'Chủ đề', boThu: 'Bộ thủ', loaiTu: 'Từ loại',
    viDu: 'Đặt câu', ghiChu: 'Cách nhớ chữ', audio: 'Audio'
  },
  groupBy: ['Chủ đề', 'HSK', 'Từ loại', 'Bộ thủ'],
  lessonTab: 'Bài khoá'
};

const DEFAULT_CFG = {
  sheetUrl: '', sheetId: '', tab: '', gid: '', webApp: '',
  map: {}, cols: [], groupBy: [], lessonTab: '',
  lookup: { tab: '', keyCol: '', varCol: '', valCol: '' },
  settings: { newPerDay: 10, maxReview: 120, dir: 'h2m', maxIvlDays: 365, voice: '', minGroup: 0, tts: 'auto' }
};

const state = {
  cfg: null, words: [], prog: {}, log: {}, queue: [], meta: {},
  demo: false, view: 'kho', sess: null, detailIdx: -1, filtered: [],
  mode: 'tu', rads: [], radIndex: {}, radByChar: {}, radCols: {}, pins: [], lessons: []
};

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Bộ nhớ trình duyệt đầy', 'err'); } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

function loadState() {
  state.cfg   = Object.assign({}, DEFAULT_CFG, LS.get(K.cfg, {}));
  state.cfg.settings = Object.assign({}, DEFAULT_CFG.settings, state.cfg.settings || {});
  state.cfg.lookup = Object.assign({}, DEFAULT_CFG.lookup, state.cfg.lookup || {});
  state.lookupMap = LS.get(K.lookup, {});
  const rd = LS.get(K.rads, null);
  state.rads = (rd && rd.rads) || [];
  state.radCols = (rd && rd.cols) || {};
  state.radIndex = buildRadIndex(state.rads);
  state.radByChar = {};
  state.rads.forEach(r => state.radByChar[r.f.hanzi] = r);
  state.lessons = LS.get(K.lessons, []);
  state.words = LS.get(K.words, []);
  state.prog  = LS.get(K.prog, {});
  state.log   = LS.get(K.log, {});
  state.queue = LS.get(K.queue, []);
  state.meta  = LS.get(K.meta, {});
  state.mode  = ['bo', 'py', 'bk'].indexOf(state.meta.mode) > -1 ? state.meta.mode : 'tu';
  // chưa từng khai báo gì -> lấy cấu hình nhúng sẵn
  if (!state.cfg.sheetId && PRESET.sheetId) {
    state.cfg.sheetUrl = PRESET.sheetUrl;
    state.cfg.sheetId = PRESET.sheetId;
    state.cfg.tab = PRESET.tab;
    state.cfg.map = Object.assign({}, PRESET.map);
    state.cfg.groupBy = PRESET.groupBy.slice();
    state.cfg.lessonTab = PRESET.lessonTab || '';
    saveCfg();
  }
  // Cấu hình đã lưu từ bản app cũ sẽ thiếu những khoá mới thêm về sau.
  // Bổ sung cho đúng Sheet đó, nếu không tính năng mới sẽ im lặng không chạy.
  if (state.cfg.sheetId && state.cfg.sheetId === PRESET.sheetId) {
    if (!state.cfg.lessonTab && PRESET.lessonTab) {
      state.cfg.lessonTab = PRESET.lessonTab;
      saveCfg();
    }
  }
  if (!state.words.length && !state.cfg.sheetId) {
    state.words = demoWords(); state.demo = true;
    if (!state.cfg.groupBy.length) state.cfg.groupBy = ['Chủ đề', 'HSK', 'Bộ thủ'];
  }
}
const saveCfg   = () => LS.set(K.cfg, state.cfg);
const saveWords = () => LS.set(K.words, state.words);
const saveProg  = () => LS.set(K.prog, state.prog);
const saveLog   = () => LS.set(K.log, state.log);
const saveQueue = () => { LS.set(K.queue, state.queue); paintQueueBadge(); };

/* Dữ liệu mẫu để app có hình hài ngay khi chưa nối Sheet */
function demoWords() {
  const C = ['Chữ Hán', 'Pinyin', 'Nghĩa tiếng Việt', 'HSK', 'Chủ đề', 'Bộ thủ', 'Loại từ', 'Ví dụ', 'Nghĩa ví dụ'];
  const raws = [
    ['你好', 'nǐ hǎo', 'xin chào', '1', 'Chào hỏi', '亻', 'cụm từ', '你好！我叫小明。', 'Xin chào! Tôi tên Tiểu Minh.'],
    ['谢谢', 'xiè xie', 'cảm ơn', '1', 'Chào hỏi', '讠', 'động từ', '谢谢你的帮助。', 'Cảm ơn sự giúp đỡ của bạn.'],
    ['再见', 'zài jiàn', 'tạm biệt', '1', 'Chào hỏi', '冂', 'cụm từ', '老师，再见！', 'Thưa thầy, tạm biệt!'],
    ['老师', 'lǎo shī', 'giáo viên, thầy cô', '1', 'Nghề nghiệp', '耂', 'danh từ', '他是我的老师。', 'Anh ấy là thầy của tôi.'],
    ['学生', 'xué sheng', 'học sinh', '1', 'Nghề nghiệp', '子', 'danh từ', '我是学生。', 'Tôi là học sinh.'],
    ['医生', 'yī shēng', 'bác sĩ', '1', 'Nghề nghiệp', '匚', 'danh từ', '我妈妈是医生。', 'Mẹ tôi là bác sĩ.'],
    ['妈妈', 'mā ma', 'mẹ', '1', 'Gia đình', '女', 'danh từ', '妈妈在家。', 'Mẹ ở nhà.'],
    ['爸爸', 'bà ba', 'bố', '1', 'Gia đình', '父', 'danh từ', '爸爸去工作了。', 'Bố đi làm rồi.'],
    ['朋友', 'péng you', 'bạn bè', '1', 'Gia đình', '月', 'danh từ', '他是我的好朋友。', 'Cậu ấy là bạn tốt của tôi.'],
    ['吃', 'chī', 'ăn', '1', 'Ăn uống', '口', 'động từ', '我想吃米饭。', 'Tôi muốn ăn cơm.'],
    ['喝', 'hē', 'uống', '1', 'Ăn uống', '口', 'động từ', '你喝茶吗？', 'Bạn uống trà không?'],
    ['水', 'shuǐ', 'nước', '1', 'Ăn uống', '水', 'danh từ', '请给我一杯水。', 'Cho tôi một cốc nước.'],
    ['米饭', 'mǐ fàn', 'cơm', '1', 'Ăn uống', '米', 'danh từ', '这个米饭很好吃。', 'Cơm này rất ngon.'],
    ['今天', 'jīn tiān', 'hôm nay', '1', 'Thời gian', '人', 'danh từ', '今天很热。', 'Hôm nay rất nóng.'],
    ['明天', 'míng tiān', 'ngày mai', '1', 'Thời gian', '日', 'danh từ', '明天见！', 'Hẹn gặp ngày mai!'],
    ['星期', 'xīng qī', 'tuần, thứ', '1', 'Thời gian', '日', 'danh từ', '今天星期几？', 'Hôm nay thứ mấy?'],
    ['大', 'dà', 'to, lớn', '1', 'Tính chất', '大', 'tính từ', '这个房子很大。', 'Ngôi nhà này rất to.'],
    ['小', 'xiǎo', 'nhỏ, bé', '1', 'Tính chất', '小', 'tính từ', '小猫很可爱。', 'Con mèo nhỏ rất dễ thương.'],
    ['好', 'hǎo', 'tốt, ổn', '1', 'Tính chất', '女', 'tính từ', '我很好，谢谢。', 'Tôi rất khoẻ, cảm ơn.'],
    ['多少', 'duō shao', 'bao nhiêu', '1', 'Số lượng', '夕', 'đại từ', '这个多少钱？', 'Cái này bao nhiêu tiền?']
  ];
  return raws.map(r => {
    const raw = {}; C.forEach((c, i) => raw[c] = r[i]);
    return mkWord(raw, { hanzi: C[0], pinyin: C[1], nghiaViet: C[2], hsk: C[3], chuDe: C[4], boThu: C[5], loaiTu: C[6], viDu: C[7], nghiaViDu: C[8] });
  });
}

/* ═══ 2. GOOGLE SHEETS CLIENT ════════════════════════════════════ */

/* JSONP — nạp bằng thẻ script nên không vướng CORS, chạy được cả file:// */
let jsonpSeq = 0;
function jsonp(makeUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cb = '__hskcb' + (++jsonpSeq) + '_' + Date.now().toString(36);
    const s = document.createElement('script');
    const done = (err, data) => {
      clearTimeout(timer);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
      err ? reject(err) : resolve(data);
    };
    const timer = setTimeout(() => done(new Error('Hết thời gian chờ Google trả lời')), timeoutMs || 25000);
    window[cb] = d => done(null, d);
    s.src = makeUrl(cb);
    s.onerror = () => done(new Error('Không tải được dữ liệu — kiểm tra link và quyền chia sẻ của Sheet'));
    document.head.appendChild(s);
  });
}

function parseSheetId(url) {
  if (!url) return '';
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/) ||
            String(url).match(/^([a-zA-Z0-9-_]{20,})$/);
  return m ? m[1] : '';
}

/* Đọc 1 tab của Sheet → {cols:[nhãn], rows:[[giá trị]], tab} */
function parseGid(url) {
  const m = String(url || '').match(/[#&?]gid=(\d+)/);
  return m ? m[1] : '';
}

/* tab (tên) được ưu tiên; không có thì dùng gid lấy từ link */
async function readSheet(sheetId, tab, gid) {
  const res = await jsonp(cb => {
    let u = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(sheetId) +
            '/gviz/tq?tqx=out:json;responseHandler:' + cb + '&headers=1';
    if (tab) u += '&sheet=' + encodeURIComponent(tab);
    else if (gid) u += '&gid=' + encodeURIComponent(gid);
    return u + '&_=' + Date.now();
  });
  if (!res || res.status === 'error') {
    const e = res && res.errors && res.errors[0];
    throw new Error(e ? (e.detailed_message || e.message).replace(/<[^>]+>/g, '') : 'Sheet trả về lỗi');
  }
  const t = res.table || {};
  const cols = (t.cols || []).map((c, i) => (c.label || '').trim() || ('Cột ' + String.fromCharCode(65 + i)));
  const rows = (t.rows || []).map(r => (r.c || []).map(cellVal));
  return { cols, rows, tab: tab || '', gid: gid || '' };
}
function cellVal(c) {
  if (!c) return '';
  if (c.f != null && c.f !== '') return String(c.f).trim();
  const v = c.v;
  if (v == null) return '';
  if (typeof v === 'string' && /^Date\((\d+),(\d+),(\d+)/.test(v)) {
    const m = v.match(/^Date\((\d+),(\d+),(\d+)/);
    return String(+m[3]).padStart(2, '0') + '/' + String(+m[2] + 1).padStart(2, '0') + '/' + m[1];
  }
  return String(v).trim();
}

/* Gọi Apps Script Web App. POST dùng text/plain để tránh preflight OPTIONS
   (Apps Script không xử lý OPTIONS → application/json sẽ luôn hỏng).
   Hỏng nữa thì rơi xuống JSONP GET — không đụng CORS. */
async function callApi(action, payload) {
  const url = (state.cfg.webApp || '').trim();
  if (!url) throw new Error('Chưa khai báo Web App URL ở mục 3 phần Cài đặt');
  const body = { action: action, tab: state.cfg.tab || '', gid: state.cfg.gid || '', payload: payload || {} };
  try {
    const r = await fetch(url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!j || j.ok === false) throw new Error((j && j.error) || 'Apps Script báo lỗi');
    return j;
  } catch (e) {
    const j = await jsonp(cb =>
      url + (url.indexOf('?') > -1 ? '&' : '?') + 'callback=' + cb +
      '&action=' + encodeURIComponent(action) +
      '&tab=' + encodeURIComponent(state.cfg.tab || '') +
      '&gid=' + encodeURIComponent(state.cfg.gid || '') +
      '&payload=' + encodeURIComponent(JSON.stringify(payload || {})) +
      '&_=' + Date.now());
    if (!j || j.ok === false) throw new Error((j && j.error) || 'Apps Script báo lỗi');
    return j;
  }
}
const hasWrite = () => !!(state.cfg.webApp || '').trim();

/* Hàng đợi offline: ghi hỏng thì để dành, mở app lần sau tự đẩy lại */
function enqueue(action, payload) {
  state.queue.push({ action, payload, ts: Date.now() });
  saveQueue();
}
async function flushQueue(silent) {
  if (!state.queue.length || !hasWrite()) return;
  const pending = state.queue.slice();
  const left = [];
  for (const job of pending) {
    try { await callApi(job.action, job.payload); }
    catch (e) { left.push(job); }
  }
  state.queue = left; saveQueue();
  if (!silent && pending.length > left.length) toast('Đã đẩy ' + (pending.length - left.length) + ' thay đổi lên Sheet', 'ok');
}
function paintQueueBadge() {
  const b = $('#queueBadge');
  if (!b) return;
  b.textContent = state.queue.length;
  b.hidden = !state.queue.length;
}

/* ═══ 3. DỰNG DỮ LIỆU & DIFF ════════════════════════════════════ */

function mkWord(raw, map) {
  const f = {};
  FIELDS.forEach(fd => { f[fd.key] = map[fd.key] ? (raw[map[fd.key]] || '') : ''; });
  const idCol = Object.keys(raw).find(c => /^id$/i.test(c.trim()));
  const id = (idCol && raw[idCol]) ? String(raw[idCol]) : (noAccent(f.hanzi) + '|' + noAccent(f.pinyin));
  const w = { id, raw, f };
  w._py = noAccent(f.pinyin);
  w._pyz = w._py.replace(/\s+/g, '');
  w._vi = noAccent(f.nghiaViet);
  w._full = noAccent(Object.values(raw).join(' '));
  return w;
}
/* Bảng của bạn để chung từ vựng và bộ thủ, phân biệt bằng ô ghi "Bộ thủ".
   Tìm xem cột nào đóng vai trò đánh dấu đó (phải xuất hiện đủ nhiều mới tính). */
function findRadMarkCol(table) {
  for (let j = 0; j < table.cols.length; j++) {
    if (!table.cols[j]) continue;
    let n = 0;
    for (let i = 0; i < table.rows.length; i++) {
      if (noAccent(table.rows[i][j]) === 'bo thu') n++;
    }
    if (n >= 3) return j;
  }
  return -1;
}

/* Tách bảng thành 2 kho: từ vựng và bộ thủ */
function splitTable(table, map) {
  const mark = findRadMarkCol(table);
  const words = [], radRows = [], seen = {};
  table.rows.forEach(r => {
    const raw = {};
    table.cols.forEach((c, i) => { if (c) raw[c] = r[i] == null ? '' : r[i]; });
    if (mark >= 0 && noAccent(r[mark]) === 'bo thu') { radRows.push(raw); return; }
    const w = mkWord(raw, map);
    if (!w.f.hanzi) return;
    if (seen[w.id]) w.id = w.id + '#' + (++seen[w.id]); else seen[w.id] = 1;
    words.push(w);
  });
  return { words: words, rads: buildRadicals(table.cols, radRows, map) };
}
function buildWords(table, map) { return splitTable(table, map).words; }
function diffWords(oldArr, newArr) {
  const oi = {}, ni = {};
  oldArr.forEach(w => oi[w.id] = w);
  newArr.forEach(w => ni[w.id] = w);
  const added = newArr.filter(w => !oi[w.id]);
  const removed = oldArr.filter(w => !ni[w.id]);
  const changed = newArr.filter(w => oi[w.id] && JSON.stringify(oi[w.id].raw) !== JSON.stringify(w.raw));
  return { added, removed, changed };
}

/* ═══ 3b. BẢNG TRA GỘP NHÓM ═════════════════════════════════════
   Bảng từ vựng ghi bộ thủ rời rạc (NGÔN 言, NGÔN 讠, NHÂN 人 (亻)…) nên
   nhóm theo cột đó ra hàng chục nhóm lẻ tẻ. Bảng tra là một tab khác trong
   cùng Sheet, ánh xạ từng bộ thủ sang một phân loại lớn hơn.            */

const LOOKUP_HINTS = {
  key: ['bộ thủ', 'bo thu', 'radical', 'dạng chính'],
  var: ['biến thể', 'bien the', 'variant', 'phồn thể', 'dạng khác'],
  val: ['phân loại', 'phan loai', 'semantic', 'category', 'nhóm', 'ý nghĩa']
};
const LOOKUP_COL = '\u241Flookup';   // khoá ảo, không đụng tên cột thật
const CJK_RE = /[\u2E80-\u2FDF\u3005\u3007\u31C0-\u31EF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

const RAD_COL = '\u241Fradical';     // nhóm theo bộ thủ suy từ từng chữ

/* Các cột của tab bộ thủ, dò tự động theo từ khoá */
const RAD_FIELDS = [
  { key: 'char',    hints: ['chữ hán', 'bộ thủ (dạng chính)', 'dạng chính', 'radical'] },
  { key: 'name',    hints: ['hán việt', 'tên hán việt', 'tên bộ'] },
  { key: 'pinyin',  hints: ['pinyin', 'phiên âm'] },
  { key: 'meaning', hints: ['nghĩa gốc', 'nghĩa', 'meaning'] },
  { key: 'variant', hints: ['chữ phồn thể', 'phồn thể', 'biến thể', 'variant'] },
  { key: 'strokes', hints: ['số nét', 'stroke'] },
  { key: 'tip',     hints: ['cách nhớ chữ', 'mẹo nhớ', 'cách nhớ', 'memory tip'] },
  { key: 'note',    hints: ['ghi chú bộ thủ', 'ghi chú bộ'] },
  { key: 'pos',     hints: ['vị trí thường gặp', 'vị trí'] },
  { key: 'cat',     hints: ['phân loại ngữ nghĩa', 'phân loại', 'semantic', 'category'] },
  { key: 'freq',    hints: ['mức phổ biến', 'phổ biến', 'frequency'] },
  { key: 'ex',      hints: ['chữ ví dụ', 'example characters'] },
  { key: 'hskEx',   hints: ['chữ hsk', 'hsk characters'] }
];

/* Chấm điểm khớp tên cột: trùng khít > chứa. Mỗi cột chỉ dùng cho một mục. */
function guessCols(cols, defs, taken) {
  const map = {}, used = {};
  (taken || []).forEach(c => used[c] = 1);
  defs.forEach(f => {
    let best = null, bestScore = 0;
    cols.forEach(c => {
      if (used[c] || !c) return;
      const n = noAccent(c);
      let sc = 0;
      f.hints.forEach(h => {
        const nh = noAccent(h);
        if (n === nh) sc = Math.max(sc, 3);
        else if (n.indexOf(nh) > -1) sc = Math.max(sc, 2);
      });
      if (sc > bestScore) { bestScore = sc; best = c; }
    });
    if (best) { map[f.key] = best; used[best] = 1; }
  });
  return map;
}

/* "3 nét", "2 nét (亻: 2 nét)" → "3 nét" cho gọn khi nhóm */
function tidyStrokes(v) {
  const m = String(v || '').match(/(\d+)\s*n[ée]t/i);
  return m ? (m[1] + ' nét') : (String(v || '').trim() || '(chưa rõ)');
}

/* Ô "Ghi chú bộ thủ" gói nhiều thông tin trong một dòng chữ:
   "Vị trí: … | Phân loại: … | Mức phổ biến: … | Chữ ví dụ: … | Chữ HSK: …"
   Hàm này bóc chúng ra thành từng mục. */
function parseRadNote(txt) {
  const o = {};
  String(txt || '').split('|').forEach(part => {
    const i = part.indexOf(':');
    if (i < 0) return;
    o[noAccent(part.slice(0, i))] = part.slice(i + 1).trim();
  });
  return o;
}

/* Mỗi bộ thủ được đóng gói y như một "từ" để dùng lại toàn bộ thẻ, chi tiết, SRS */
function buildRadicals(cols, rawRows, map) {
  const m = guessCols(cols, RAD_FIELDS);
  state.radCols = m;
  const out = [];
  rawRows.forEach(raw => {
    const g = k => (m[k] ? (raw[m[k]] || '') : '');
    const note = parseRadNote(m.note ? (raw[m.note] || '') : '');
    const ch = (String(g('char')).match(CJK_RE) || [])[0] || '';
    if (!ch) return;
    const idCol = Object.keys(raw).find(c => /^id$/i.test(c.trim()));
    const rid = (idCol && String(raw[idCol]).trim()) ? String(raw[idCol]).trim() : ('r:' + ch);
    const w = {
      id: rid, isRad: true, raw: raw,
      f: {
        hanzi: ch, pinyin: g('pinyin'), nghiaViet: g('meaning'),
        viDu: g('ex'), nghiaViDu: '', ghiChu: g('tip'),
        boThu: '', hsk: '', chuDe: '', loaiTu: '', ngayHoc: '', audio: ''
      },
      r: {
        name: g('name'), variant: g('variant'),
        strokes: tidyStrokes(g('strokes')), tip: g('tip'),
        pos:   note['vi tri']       || g('pos'),
        cat:   note['phan loai']    || g('cat'),
        freq:  note['muc pho bien'] || g('freq'),
        ex:    note['chu vi du']    || g('ex'),
        hskEx: note['chu hsk']      || g('hskEx'),
        note:  note['ghi chu bien the'] || ''
      }
    };
    w._py = noAccent(w.f.pinyin);
    w._pyz = w._py.replace(/\s+/g, '');
    w._vi = noAccent(w.f.nghiaViet + ' ' + w.r.name);
    w._full = noAccent(Object.values(raw).join(' '));
    out.push(w);
  });
  return out;
}

/* ký tự → danh sách bộ thủ. Lấy cả từ cột Chữ ví dụ và Chữ HSK nên tra được
   bộ thủ của từng chữ trong từ, không phụ thuộc ô "Bộ thủ" của bảng từ vựng. */
function buildRadIndex(rads) {
  const idx = {};
  const add = (ch, key) => {
    if (!ch || ch === '无' || ch === '無') return;
    if (!idx[ch]) idx[ch] = [];
    if (idx[ch].indexOf(key) < 0) idx[ch].push(key);
  };
  rads.forEach(w => {
    const key = w.f.hanzi;
    add(key, key);
    [w.r.variant, w.r.ex, w.r.hskEx].forEach(src => {
      (String(src || '').match(CJK_RE) || []).forEach(c => add(c, key));
    });
  });
  return idx;
}

/* Bộ thủ của một từ: gộp ô "Bộ thủ" trong sheet với bộ thủ suy ra từ TỪNG chữ.
   Từ hai chữ chỉ cần một chữ mang bộ đó là từ được xếp vào bộ đó. */
function radicalsOf(w) {
  if (w.isRad) return [w.f.hanzi];
  const out = [];
  const push = k => { if (k && out.indexOf(k) < 0) out.push(k); };
  const scan = txt => (String(txt || '').match(CJK_RE) || [])
    .forEach(c => (state.radIndex[c] || []).forEach(push));
  scan(w.f.boThu);
  scan(w.f.hanzi);
  return out;
}
function radLabel(ch) {
  const r = state.radByChar[ch];
  return r && r.r.name ? (ch + ' · ' + r.r.name) : ch;
}
/* Các phân loại ngữ nghĩa mà một từ thuộc về (qua bộ thủ của nó) */
function lookupCatsOf(w) {
  const out = [];
  radicalsOf(w).forEach(ch => {
    const r = state.radByChar[ch];
    const v = r && r.r.cat;
    if (v && out.indexOf(v) < 0) out.push(v);
  });
  return out;
}

function refreshPinyin() { state.pins = buildPinyin(); }
function applyRads(rads) {
  state.rads = rads;
  state.radIndex = buildRadIndex(rads);
  state.radByChar = {};
  rads.forEach(r => state.radByChar[r.f.hanzi] = r);
  LS.set(K.rads, { rads: rads, cols: state.radCols });
}
/* ─── KHO PINYIN: bảng vỡ lòng ────────────────────────────────────
   21 thanh mẫu (phụ âm đầu) · 36 vận mẫu (vần) · 4 thanh điệu + thanh nhẹ.
   Đây là bảng chuẩn của tiếng Trung, không phụ thuộc vốn từ trong Sheet.
   App chỉ mượn Sheet để gắn thêm ví dụ: chữ nào trong kho đang dùng âm đó. */

const PY_INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
                     'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const TONE_MARKS = { '\u0304': 1, '\u0301': 2, '\u030C': 3, '\u0300': 4 };
const TONE_NAME = { 1: 'Thanh 1 — ngang (ā)', 2: 'Thanh 2 — sắc (á)', 3: 'Thanh 3 — hỏi (ǎ)',
                    4: 'Thanh 4 — huyền (à)', 5: 'Thanh nhẹ (a)' };

/* [ ký hiệu, nhóm, cách đọc, ghi chú, ví dụ ] */
const PY_SM = [
  ['b',  'Âm môi',            'gần "p" tiếng Việt, KHÔNG bật hơi', 'Hai môi khép rồi mở, không đẩy hơi ra', 'bā 八 · bàba 爸爸'],
  ['p',  'Âm môi',            'như b nhưng BẬT HƠI mạnh',          'Để tờ giấy trước miệng, đọc đúng thì giấy rung', 'pí 皮 · péngyou 朋友'],
  ['m',  'Âm môi',            '"m" như tiếng Việt',                '', 'mā 妈 · mèi 妹'],
  ['f',  'Âm môi',            '"ph" tiếng Việt',                   'Răng trên chạm nhẹ môi dưới', 'fù 父 · fàn 饭'],
  ['d',  'Âm đầu lưỡi',       'gần "t" tiếng Việt, KHÔNG bật hơi', 'Đầu lưỡi chạm lợi trên', 'dà 大 · dì 弟'],
  ['t',  'Âm đầu lưỡi',       'như d nhưng BẬT HƠI ("th")',        '', 'tài 太 · tiān 天'],
  ['n',  'Âm đầu lưỡi',       '"n" như tiếng Việt',                '', 'nǐ 你 · nǚ 女'],
  ['l',  'Âm đầu lưỡi',       '"l" như tiếng Việt',                '', 'lì 力 · liù 六'],
  ['g',  'Âm gốc lưỡi',       'gần "c/k", KHÔNG bật hơi',          'Gốc lưỡi nâng chạm ngạc mềm', 'gē 哥 · gōng 工'],
  ['k',  'Âm gốc lưỡi',       'như g nhưng BẬT HƠI ("kh")',        '', 'kǒu 口 · kè 客'],
  ['h',  'Âm gốc lưỡi',       '"h" nhưng ma sát mạnh hơn',         'Hơi cọ ở cuống họng, nặng hơn "h" tiếng Việt', 'hǎo 好 · hàn 汉'],
  ['j',  'Âm mặt lưỡi',       'gần "ch", môi dẹt, KHÔNG bật hơi',  'Chỉ ghép được với i và ü', 'jiě 姐 · jiā 家'],
  ['q',  'Âm mặt lưỡi',       'như j nhưng BẬT HƠI',               'Chỉ ghép được với i và ü', 'qī 七 · qì 气'],
  ['x',  'Âm mặt lưỡi',       'gần "x" tiếng Việt, mặt lưỡi',      'Chỉ ghép được với i và ü', 'xiè 谢 · xué 学'],
  ['zh', 'Âm uốn lưỡi',       'gần "tr", UỐN LƯỠI, không bật hơi', 'Đầu lưỡi cong lên chạm ngạc cứng', 'zhōng 中 · zhè 这'],
  ['ch', 'Âm uốn lưỡi',       'như zh nhưng BẬT HƠI',              '', 'chē 车 · chī 吃'],
  ['sh', 'Âm uốn lưỡi',       'gần "s", UỐN LƯỠI',                 '', 'shuǐ 水 · shí 十'],
  ['r',  'Âm uốn lưỡi',       'giữa "r" và "d", UỐN LƯỠI',         'Lưỡi cong như sh nhưng rung dây thanh', 'rén 人 · rì 日'],
  ['z',  'Âm đầu lưỡi trước', 'gần "ts", KHÔNG bật hơi',           'Đầu lưỡi chạm mặt sau răng trên', 'zì 字 · zǐ 子'],
  ['c',  'Âm đầu lưỡi trước', 'như z nhưng BẬT HƠI',               '', 'cǎo 草 · cài 菜'],
  ['s',  'Âm đầu lưỡi trước', 'gần "x/s" tiếng Việt',              '', 'sān 三 · sì 四']
];

const PY_VM = [
  ['a',    'Nguyên âm đơn', '"a"',                        '', 'bā 八 · dà 大'],
  ['o',    'Nguyên âm đơn', '"ô" hơi tròn môi',           '', 'wǒ 我'],
  ['e',    'Nguyên âm đơn', '"ơ", môi dẹt, lưỡi lùi sau', 'Không phải "e" tiếng Việt', 'hē 喝 · gē 哥'],
  ['i',    'Nguyên âm đơn', '"i"',                        'Sau z/c/s/zh/ch/sh/r đọc ê ê trong cổ, không thành "i"', 'yī 一 · nǐ 你'],
  ['u',    'Nguyên âm đơn', '"u" tròn môi',               '', 'wǔ 五 · bù 不'],
  ['ü',    'Nguyên âm đơn', '"uy" nhưng GIỮ TRÒN MÔI',    'Sau j/q/x/y viết thành u nhưng vẫn đọc ü', 'nǚ 女 · yǔ 雨'],
  ['ai',   'Nguyên âm kép', '"ai"',                       '', 'tài 太 · ài 爱'],
  ['ei',   'Nguyên âm kép', '"ây"',                       '', 'bèi 贝 · méi 没'],
  ['ao',   'Nguyên âm kép', '"ao"',                       '', 'hǎo 好 · cǎo 草'],
  ['ou',   'Nguyên âm kép', '"âu"',                       '', 'kǒu 口 · ròu 肉'],
  ['ia',   'Nguyên âm kép', '"i-a" liền thành "ya"',      '', 'jiā 家'],
  ['ie',   'Nguyên âm kép', '"iê"',                       '', 'xiè 谢 · jiě 姐'],
  ['ua',   'Nguyên âm kép', '"oa"',                       '', 'huà 话'],
  ['uo',   'Nguyên âm kép', '"uô"',                       '', 'wǒ 我 · huǒ 火'],
  ['üe',   'Nguyên âm kép', '"uê" tròn môi',              '', 'yuè 月 · xué 学'],
  ['iao',  'Nguyên âm kép', '"i-ao"',                     '', 'jiào 叫 · xiǎo 小'],
  ['iu',   'Nguyên âm kép', '"i-âu"',                     'Viết tắt của iou', 'liù 六 · jiǔ 九'],
  ['uai',  'Nguyên âm kép', '"oai"',                      '', 'kuài 快'],
  ['ui',   'Nguyên âm kép', '"uây"',                      'Viết tắt của uei', 'shuǐ 水 · guì 贵'],
  ['an',   'Vận mẫu mũi',   '"an"',                       '', 'sān 三 · hàn 汉'],
  ['en',   'Vận mẫu mũi',   '"ân"',                       '', 'rén 人 · běn 本'],
  ['in',   'Vận mẫu mũi',   '"in"',                       '', 'jīn 今 · xīn 心'],
  ['un',   'Vận mẫu mũi',   '"uân"',                      'Viết tắt của uen', 'chūn 春'],
  ['ün',   'Vận mẫu mũi',   '"uyn" tròn môi',             '', 'yūn 晕 · qún 裙'],
  ['ian',  'Vận mẫu mũi',   '"iên"',                      '', 'tiān 天 · qián 钱'],
  ['uan',  'Vận mẫu mũi',   '"oan"',                      '', 'wán 完 · chuān 穿'],
  ['üan',  'Vận mẫu mũi',   '"uyên"',                     '', 'yuǎn 远'],
  ['ang',  'Vận mẫu mũi',   '"ang"',                      '', 'chàng 唱 · fáng 房'],
  ['eng',  'Vận mẫu mũi',   '"âng"',                      '', 'děng 等 · fēng 风'],
  ['ing',  'Vận mẫu mũi',   '"inh"',                      '', 'míng 明 · tīng 听'],
  ['ong',  'Vận mẫu mũi',   '"ung"',                      '', 'zhōng 中 · dōng 东'],
  ['iang', 'Vận mẫu mũi',   '"i-ang"',                    '', 'xiǎng 想 · liáng 凉'],
  ['uang', 'Vận mẫu mũi',   '"oang"',                     '', 'huáng 黄 · chuáng 床'],
  ['ueng', 'Vận mẫu mũi',   '"uâng"',                     'Chỉ đứng một mình thành weng', 'wēng 翁'],
  ['iong', 'Vận mẫu mũi',   '"i-ung"',                    '', 'xiōng 兄'],
  ['er',   'Vận mẫu đặc biệt', '"ơ" có uốn lưỡi',         'Không ghép với phụ âm đầu nào', 'ér 儿 · èr 二']
];

const PY_TONE = [
  ['ā', 1, 'Cao và BẰNG, giữ đều từ đầu tới cuối', 'Như ngân một nốt cao kéo dài', 'mā 妈 (mẹ)'],
  ['á', 2, 'ĐI LÊN từ giữa lên cao',               'Giống khi hỏi lại "hả?"', 'má 麻 (cây gai)'],
  ['ǎ', 3, 'XUỐNG thấp rồi mới LÊN',               'Thanh dài nhất; hai thanh 3 liền nhau thì thanh trước đọc thành thanh 2', 'mǎ 马 (ngựa)'],
  ['à', 4, 'RƠI mạnh từ cao xuống thấp',           'Dứt khoát, như quát một tiếng', 'mà 骂 (mắng)'],
  ['a',  5, 'Đọc NHẸ và NGẮN, không dấu',          'Thường ở âm tiết thứ hai: māma, bàba', 'ma 吗 (trợ từ hỏi)']
];

/* Bóc dấu thanh: "hǎo" → { base:'hao', tone:3 }. Dấu hai chấm của ü không phải dấu thanh. */
function splitTone(syl) {
  const d = String(syl || '').normalize('NFD');
  let tone = 5;
  for (const mk in TONE_MARKS) if (d.indexOf(mk) > -1) { tone = TONE_MARKS[mk]; break; }
  const base = d.replace(/[\u0304\u0301\u030C\u0300]/g, '').normalize('NFC');
  return { base: base, tone: tone };
}
function splitInitial(base) {
  for (let i = 0; i < PY_INITIALS.length; i++) {
    if (base.indexOf(PY_INITIALS[i]) === 0) {
      const ini = PY_INITIALS[i];
      let fin = base.slice(ini.length);
      // sau j/q/x/y thì ü viết thành u, phải trả về đúng ü
      if ('jqxy'.indexOf(ini) > -1 && /^u(e|an|n)?$/.test(fin)) fin = 'ü' + fin.slice(1);
      return { initial: ini, final: fin };
    }
  }
  return { initial: '', final: base };
}

/* Ô pinyin lúc có dấu cách lúc không ("jiě jie" vs "māma"). Lấy các ô một chữ
   làm vốn âm tiết chắc chắn rồi cắt các ô dính liền theo đó. Chỉ dùng để gắn
   ví dụ lấy từ kho, không phải nguồn của bảng pinyin. */
function scanSyllables() {
  const list = state.words.concat(state.rads);
  const known = {}, cells = [];
  list.forEach(w => {
    const t = String(w.f.pinyin || '').trim();
    if (!t || !/[a-zA-Z]/.test(t)) return;
    const chars = (String(w.f.hanzi || '').match(CJK_RE) || []);
    cells.push({ t: t, chars: chars });
    if (t.indexOf(' ') > -1) {
      t.split(/\s+/).forEach(x => { if (/[a-zA-Z]/.test(x)) known[splitTone(x).base.toLowerCase()] = 1; });
    } else if (chars.length <= 1) {
      known[splitTone(t).base.toLowerCase()] = 1;
    }
  });
  const bases = Object.keys(known).sort((a, b) => b.length - a.length);
  const cut = txt => {
    if (txt.indexOf(' ') > -1) return txt.split(/\s+/).filter(x => /[a-zA-Z]/.test(x));
    const out = [];
    let rest = txt, guard = 0;
    while (rest && guard++ < 12) {
      let hit = '';
      for (let i = 0; i < bases.length; i++) {
        if (splitTone(rest).base.toLowerCase().indexOf(bases[i]) === 0) { hit = rest.slice(0, bases[i].length); break; }
      }
      if (!hit) { out.push(rest); break; }
      out.push(hit); rest = rest.slice(hit.length);
    }
    return out;
  };
  const out = [];
  cells.forEach(c => cut(c.t).forEach((syl, i) => {
    const t = splitTone(syl);
    const f = splitInitial(t.base.toLowerCase());
    out.push({ syl: syl, tone: t.tone, initial: f.initial, final: f.final, ch: c.chars[i] || c.chars[0] || '' });
  }));
  return out;
}


/* Âm tiết dùng để luyện 4 thanh cho từng mục, kèm chữ ví dụ mỗi thanh.
   [ âm tiết luyện, thanh1, thanh2, thanh3, thanh4 ] — ô trống nghĩa là
   tổ hợp đó hiếm/không dùng trong tiếng phổ thông. */
const PY_DRILL = {
  // ── 21 thanh mẫu: ghép với một vận mẫu thông dụng ──
  'b':  ['ba',  '八 巴',    '拔',      '把',      '爸 罢'],
  'p':  ['pa',  '趴',       '爬',      '',        '怕'],
  'm':  ['ma',  '妈',       '麻',      '马',      '骂'],
  'f':  ['fa',  '发',       '罚',      '法',      '发'],
  'd':  ['da',  '搭',       '答 达',   '打',      '大'],
  't':  ['ta',  '他 她 它', '',        '塔',      '踏'],
  'n':  ['na',  '',         '拿',      '哪',      '那'],
  'l':  ['li',  '',         '离 梨',   '里 李',   '力 立'],
  'g':  ['ge',  '哥 歌',    '格',      '',        '个'],
  'k':  ['ke',  '科',       '咳',      '可 渴',   '客 课'],
  'h':  ['hao', '',         '豪',      '好',      '号'],
  'j':  ['ji',  '鸡 机',    '急',      '几',      '记 寄'],
  'q':  ['qi',  '七',       '骑 齐',   '起',      '气 汽'],
  'x':  ['xi',  '西',       '习 席',   '洗 喜',   '系 戏'],
  'zh': ['zhi', '知 只',    '直',      '纸',      '志'],
  'ch': ['chi', '吃',       '池 迟',   '尺',      '赤'],
  'sh': ['shi', '师 诗',    '十 时',   '使 史',   '是 事'],
  'r':  ['ren', '',         '人',      '忍',      '认'],
  'z':  ['zi',  '资',       '',        '子 紫',   '字 自'],
  'c':  ['cai', '猜',       '才 材',   '彩 采',   '菜'],
  's':  ['san', '三',       '',        '伞',      '散'],

  // ── 36 vận mẫu: đọc đứng một mình (theo cách viết chuẩn) ──
  'a':    ['a',    '啊',    '',        '',        '啊'],
  'o':    ['o',    '噢',    '哦',      '',        '哦'],
  'e':    ['e',    '',      '鹅',      '恶',      '饿 恶'],
  'i':    ['yi',   '一 衣', '移 姨',   '已 椅',   '意 易'],
  'u':    ['wu',   '屋',    '无',      '五 午',   '物 雾'],
  'ü':    ['yu',   '迂',    '鱼 于',   '雨 语',   '玉 育'],
  'ai':   ['ai',   '哀',    '癌',      '矮',      '爱'],
  'ei':   ['ei',   '',      '',        '',        ''],
  'ao':   ['ao',   '凹',    '熬',      '袄',      '奥'],
  'ou':   ['ou',   '欧',    '',        '偶',      ''],
  'ia':   ['ya',   '鸭 押', '牙',      '哑',      '亚'],
  'ie':   ['ye',   '椰',    '爷',      '也 野',   '页 夜'],
  'ua':   ['wa',   '挖 蛙', '娃',      '瓦',      '袜'],
  'uo':   ['wo',   '窝',    '',        '我',      '握'],
  'üe':   ['yue',  '约',    '',        '',        '月 乐'],
  'iao':  ['yao',  '腰',    '摇',      '咬',      '要 药'],
  'iu':   ['you',  '优',    '油 由',   '有 友',   '又 右'],
  'uai':  ['wai',  '歪',    '',        '',        '外'],
  'ui':   ['wei',  '危',    '围 为',   '尾 伟',   '位 喂'],
  'an':   ['an',   '安',    '',        '',        '暗 案'],
  'en':   ['en',   '恩',    '',        '',        ''],
  'in':   ['yin',  '因 音', '银',      '引 饮',   '印'],
  'un':   ['wen',  '温',    '文 闻',   '稳 吻',   '问'],
  'ün':   ['yun',  '晕',    '云',      '允',      '运'],
  'ian':  ['yan',  '烟',    '言 严',   '眼 演',   '燕'],
  'uan':  ['wan',  '弯',    '完 玩',   '晚 碗',   '万'],
  'üan':  ['yuan', '冤',    '元 员',   '远',      '院 愿'],
  'ang':  ['ang',  '肮',    '昂',      '',        ''],
  'eng':  ['eng',  '',      '',        '',        ''],
  'ing':  ['ying', '应 英', '迎 赢',   '影',      '硬'],
  'ong':  ['dong', '东',    '',        '懂',      '动 洞'],
  'iang': ['yang', '央',    '羊 阳',   '养 痒',   '样'],
  'uang': ['wang', '汪',    '王 亡',   '网 往',   '忘 望'],
  'ueng': ['weng', '翁',    '',        '',        ''],
  'iong': ['yong', '拥',    '',        '永 勇',   '用'],
  'er':   ['er',   '',      '儿 而',   '耳',      '二'],

};

/* Bộ ví dụ kinh điển cho thanh điệu. Để riêng vì khoá 'a' của thanh nhẹ
   trùng với vận mẫu 'a'. Chỉ số = số thanh, 5 là thanh nhẹ. */
const TONE_DRILL = ['ma', '妈', '麻', '马', '骂', '吗'];

/* Đặt dấu thanh đúng chỗ: ưu tiên a > o > e, còn lại rơi vào nguyên âm cuối
   (iu → iù, ui → uǐ, ü → ǚ). */
function addTone(base, tone) {
  if (!base || tone === 5) return base;
  const mk = { 1: '\u0304', 2: '\u0301', 3: '\u030C', 4: '\u0300' }[tone];
  const low = base.toLowerCase();
  let pos = -1;
  if (low.indexOf('a') > -1) pos = low.indexOf('a');
  else if (low.indexOf('o') > -1) pos = low.indexOf('o');
  else if (low.indexOf('e') > -1) pos = low.indexOf('e');
  else for (let k = 0; k < low.length; k++) if ('iouü'.indexOf(low[k]) > -1) pos = k;
  if (pos < 0) return base;
  return (base.slice(0, pos + 1) + mk + base.slice(pos + 1)).normalize('NFC');
}

/* Bảng luyện: âm tiết ghép lần lượt 4 thanh, mỗi thanh vài chữ ví dụ có loa */
function drillTable(w) {
  const isTone = w.p.kind === 'Thanh điệu';
  const d = isTone ? TONE_DRILL : PY_DRILL[w.p.sym];
  const box = el('div', {});
  if (!d) return box;
  const base = d[0];
  box.appendChild(el('div', { class: 'sechead', text: isTone ? 'Nghe 4 thanh của cùng một âm' : 'Ghép "' + w.p.sym + '" với 4 thanh' }));
  const tbl = el('div', { class: 'drill' });
  (isTone ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]).forEach(tn => {
    const chars = (d[tn] || '').split(/\s+/).filter(Boolean).slice(0, 3);
    const row = el('div', { class: 'drill__row' + (isTone && w.p.tone === tn ? ' is-on' : '') }, [
      el('div', { class: 'drill__syl' }, [
        el('b', { text: addTone(base, tn) }),
        el('span', { text: tn === 5 ? 'thanh nhẹ' : 'thanh ' + tn })
      ]),
      el('div', { class: 'drill__ex' },
        chars.length
          ? chars.map(c => el('button', {
              class: 'drill__ch', title: 'Nghe ' + c,
              onclick: e => { e.stopPropagation(); speak(c); }
            }, [el('span', { class: 'han', text: c })]))
          : [el('span', { class: 'drill__none', text: '— ít dùng —' })]),
      chars.length ? el('button', {
        class: 'btn btn--icon drill__spk', title: 'Nghe âm tiết',
        onclick: () => speak(chars[0])
      }, [icon('volume', 17)]) : null
    ]);
    tbl.appendChild(row);
  });
  box.appendChild(tbl);
  box.appendChild(el('p', { class: 'hint', style: 'margin-top:10px',
    text: 'Bấm vào từng chữ để nghe. Máy không đọc được chữ Latin nên phát âm mượn chữ Hán có âm đó.' }));
  return box;
}

function buildPinyin() {
  const syls = scanSyllables();
  const out = [];
  const add = (kind, sym, group, doc, note, ex, tone) => {
    const mine = [];
    syls.forEach(s => {
      const ok = kind === 'Thanh mẫu' ? s.initial === sym
               : kind === 'Vận mẫu'   ? s.final === sym
               : s.tone === tone;
      if (ok && s.ch && mine.indexOf(s.ch) < 0) mine.push(s.ch);
    });
    const raw = {
      'Ký hiệu': sym, 'Loại': kind, 'Nhóm': group,
      'Cách đọc': doc, 'Ghi chú': note, 'Ví dụ': ex,
      'Chữ trong kho dùng âm này': mine.join(' ')
    };
    const w = {
      id: 'p:' + kind.charAt(4) + ':' + sym, isPin: true, raw: raw,
      spk: '',
      f: {
        hanzi: sym, pinyin: group, nghiaViet: doc,
        viDu: ex + (mine.length ? '\nTrong kho: ' + mine.join(' ') : ''),
        nghiaViDu: '', ghiChu: note,
        boThu: '', hsk: '', chuDe: '', loaiTu: '', ngayHoc: '', audio: ''
      },
      p: { sym: sym, kind: kind, group: group, tone: tone || 0, mine: mine }
    };
    w._py = noAccent(sym); w._pyz = w._py;
    w._vi = noAccent(doc + ' ' + group);
    w._full = noAccent(Object.values(raw).join(' '));
    out.push(w);
  };
  PY_SM.forEach(r => add('Thanh mẫu', r[0], r[1], r[2], r[3], r[4]));
  PY_VM.forEach(r => add('Vận mẫu', r[0], r[1], r[2], r[3], r[4]));
  PY_TONE.forEach(r => add('Thanh điệu', r[0], 'Thanh điệu', r[2], r[3], r[4], r[1]));
  // loa ở đầu thẻ: mượn chữ Hán đầu tiên trong bảng luyện thanh
  out.forEach(x => {
    let src = '';
    if (x.p.kind === 'Thanh điệu') {
      // mỗi thanh một chữ riêng, không thì thanh nào cũng đọc "mā"
      src = TONE_DRILL[x.p.tone] || '';
    } else {
      const d = PY_DRILL[x.p.sym];
      src = d ? d.slice(1).join(' ') : '';
    }
    const first = (src.match(CJK_RE) || [])[0] || '';
    x.spk = first || (String(x.f.viDu).match(CJK_RE) || [])[0] || '';
  });
  return out;
}
function spkText(w) { return w.spk || w.f.hanzi; }

function lookupReady() {
  for (let i = 0; i < state.rads.length; i++) if (state.rads[i].r.cat) return true;
  return false;
}
function lookupLabel() { return 'Phân loại ngữ nghĩa'; }

/* Dựng bảng tra ký tự → phân loại từ một tab khác */
function buildLookup(table, lk) {
  // cột bảng tra cũng có thể bị đổi tên — dò lại theo từ khoá trước khi bỏ cuộc
  ['keyCol', 'varCol', 'valCol'].forEach(k => {
    if (lk[k] && table.cols.indexOf(lk[k]) < 0) lk[k] = '';
  });
  if (!lk.keyCol || !lk.valCol) {
    const pick = (hints, taken) => {
      for (let i = 0; i < hints.length; i++) {
        const m = table.cols.find(c => taken.indexOf(c) < 0 && noAccent(c).indexOf(noAccent(hints[i])) > -1);
        if (m) return m;
      }
      return '';
    };
    if (!lk.keyCol) lk.keyCol = pick(LOOKUP_HINTS.key, []);
    if (!lk.valCol) lk.valCol = pick(LOOKUP_HINTS.val, [lk.keyCol]);
    if (!lk.varCol) lk.varCol = pick(LOOKUP_HINTS.var, [lk.keyCol, lk.valCol]);
    state.cfg.lookup = lk; saveCfg();
  }
  const iKey = table.cols.indexOf(lk.keyCol);
  const iVar = lk.varCol ? table.cols.indexOf(lk.varCol) : -1;
  const iVal = table.cols.indexOf(lk.valCol);
  const map = {};
  if (iKey < 0 || iVal < 0) return map;
  table.rows.forEach(r => {
    const val = (r[iVal] || '').trim();
    if (!val) return;
    [r[iKey], iVar >= 0 ? r[iVar] : ''].forEach(src => {
      (String(src || '').match(CJK_RE) || []).forEach(ch => { if (!map[ch]) map[ch] = val; });
    });
  });
  return map;
}
/* Phân loại chính của một từ (mục đầu tiên tra được) */
function lookupOf(w) { return lookupCatsOf(w)[0] || ''; }
async function loadLookup(silent) {
  const lk = state.cfg.lookup;
  if (!lk.tab || !lk.keyCol || !lk.valCol || !state.cfg.sheetId) return null;
  const t = await readSheet(state.cfg.sheetId, lk.tab, '');
  state.lookupMap = buildLookup(t, lk);
  const rows = t.rows.map(r => { const o = {}; t.cols.forEach((c, i) => { if (c) o[c] = r[i] || ''; }); return o; });
  applyRads(buildRadicals(t.cols, rows, state.cfg.map));
  LS.set(K.lookup, state.lookupMap);
  const miss = {};
  let hit = 0;
  state.words.forEach(w => { lookupOf(w) ? hit++ : (miss[w.f.boThu || '(trống)'] = (miss[w.f.boThu || '(trống)'] || 0) + 1); });
  const res = { chars: Object.keys(state.lookupMap).length, groups: new Set(Object.values(state.lookupMap)).size, hit: hit, total: state.words.length, miss: miss };
  if (!silent) toast('Bảng tra: ' + res.chars + ' bộ thủ, gộp được ' + hit + '/' + state.words.length + ' từ', 'ok');
  return res;
}

/* ═══ 4. THUẬT TOÁN NGẮT QUÃNG (SM-2 kiểu Anki) ═════════════════ */

const LEARN_STEPS = [1 * MIN, 10 * MIN];   // các bước học từ mới
const RELEARN_STEP = 10 * MIN;             // bước học lại sau khi quên
const GRAD_IVL = 1, EASY_IVL = 4;          // ngày
const MIN_EASE = 1300, START_EASE = 2500;
const LEECH_AT = 8;

function newSrs(id) {
  return { id, s: 'new', step: 0, ease: START_EASE, ivl: 0, due: 0, reps: 0, lapses: 0, last: 0 };
}
function getSrs(id) { return state.prog[id] || newSrs(id); }

/* rating: 1 Lại · 2 Khó · 3 Tốt · 4 Dễ → trả về bản ghi mới */
function srsApply(st0, rating, now) {
  const st = Object.assign({}, st0);
  now = now || Date.now();
  st.r = rating;                       // lựa chọn lần cuối, để ghi ra Sheet
  const maxIvl = state.cfg.settings.maxIvlDays || 365;
  st.reps++; st.last = now;

  if (st.s === 'new' || st.s === 'learn') {
    st.s = 'learn';
    if (rating === 1) { st.step = 0; st.due = now + LEARN_STEPS[0]; }
    else if (rating === 2) {
      const cur = LEARN_STEPS[Math.min(st.step, LEARN_STEPS.length - 1)];
      const nxt = LEARN_STEPS[Math.min(st.step + 1, LEARN_STEPS.length - 1)];
      st.due = now + Math.round((cur + nxt) / 2);
    }
    else if (rating === 3) {
      if (st.step + 1 >= LEARN_STEPS.length) { st.s = 'review'; st.ivl = GRAD_IVL; st.due = now + GRAD_IVL * DAY; st.step = 0; }
      else { st.step++; st.due = now + LEARN_STEPS[st.step]; }
    } else { st.s = 'review'; st.ivl = EASY_IVL; st.due = now + EASY_IVL * DAY; st.step = 0; }
    return st;
  }

  if (st.s === 'relearn') {
    if (rating === 1) { st.due = now + RELEARN_STEP; }
    else { st.s = 'review'; st.ivl = Math.max(1, st.ivl || 1); st.due = now + st.ivl * DAY; }
    return st;
  }

  // đang ở giai đoạn ôn dài hạn
  const ivl = Math.max(1, st.ivl || 1);
  if (rating === 1) {
    st.lapses++;
    st.ease = Math.max(MIN_EASE, st.ease - 200);
    st.ivl = Math.max(1, Math.round(ivl * 0.5));
    st.s = 'relearn'; st.step = 0; st.due = now + RELEARN_STEP;
    if (st.lapses >= LEECH_AT) st.leech = true;
    return st;
  }
  if (rating === 2)      { st.ease = Math.max(MIN_EASE, st.ease - 150); st.ivl = Math.max(ivl + 1, Math.round(ivl * 1.2)); }
  else if (rating === 3) { st.ivl = Math.max(ivl + 1, Math.round(ivl * st.ease / 1000)); }
  else                   { st.ease += 150; st.ivl = Math.max(ivl + 1, Math.round(ivl * st.ease / 1000 * 1.3)); }
  st.ivl = Math.min(st.ivl, maxIvl);
  st.due = now + st.ivl * DAY;
  return st;
}
function srsPreview(st, rating) {
  const now = Date.now();
  const n = srsApply(st, rating, now);
  return fmtIvl(Math.max(MIN, n.due - now));
}
/* Trạng thái hiển thị của một từ */
function wordState(id) {
  const st = state.prog[id];
  if (!st || st.s === 'new') return 'new';
  if (st.due <= Date.now()) return 'due';
  if (st.s === 'review') return 'review';
  return 'learn';
}

/* ═══ 5. PHÁT ÂM ════════════════════════════════════════════════ */

let fallbackAudio = null, voiceWarned = false;

/* Chrome trả về danh sách giọng RỖNG ở lần gọi đầu và chỉ nạp xong sau đó.
   Vì vậy phải hỏi lại getVoices() ngay lúc bấm chứ không cache một lần lúc
   khởi động — cache sớm là mãi mãi rỗng và không bao giờ phát ra tiếng. */
function allVoices() {
  try { return window.speechSynthesis ? (window.speechSynthesis.getVoices() || []) : []; }
  catch (e) { return []; }
}
function zhVoices() { return allVoices().filter(v => /^zh/i.test(v.lang || '')); }
function pickVoice() {
  const want = state.cfg.settings.voice;
  const zh = zhVoices();
  return (want && zh.find(v => v.voiceURI === want)) ||
         zh.find(v => /zh[-_]?(CN|Hans)/i.test(v.lang)) || zh[0] || null;
}

function sayNow(text) {
  const v = pickVoice();
  if (!v || !window.speechSynthesis) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang || 'zh-CN';
    u.rate = 0.8;
    window.speechSynthesis.speak(u);
    // Chrome thỉnh thoảng kẹt ở trạng thái pause sau khi cancel
    setTimeout(() => {
      try { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); } catch (e) {}
    }, 120);
    return true;
  } catch (e) { return false; }
}

/* Nguồn tiếng trên mạng là endpoint TỪ ĐIỂN của Youdao: chỉ có tiếng cho từ
   và cụm nằm trong từ điển, gặp câu tự đặt thì trả lỗi 500. Vì vậy:
     · từ / chữ đơn  -> ưu tiên mạng (giọng người, hay hơn)
     · câu hội thoại -> dùng thẳng giọng máy, khỏi chờ một lượt gọi hỏng
   Cả hai chiều vẫn có đường lui sang nguồn còn lại.                       */
function netVoiceUrl(text) {
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&le=zh';
}
function isSentence(text) {
  const t = String(text || '');
  return (t.match(CJK_RE) || []).length > 4 || /[，。！？、：；,.!?]/.test(t);
}

/* Bản trả Promise, hoàn thành khi phát XONG — cần cho việc đọc cả bài khoá */
function playUrlP(url) {
  return new Promise((resolve, reject) => {
    try {
      if (fallbackAudio) { try { fallbackAudio.pause(); } catch (e) {} }
      const a = new Audio(url);
      fallbackAudio = a;
      a.addEventListener('ended', () => resolve(true));
      a.addEventListener('error', () => reject(new Error('khong tai duoc')));
      a.play().catch(reject);
    } catch (e) { reject(e); }
  });
}
function sayNowP(text) {
  return new Promise((resolve, reject) => {
    const v = pickVoice();
    if (!v || !window.speechSynthesis) return reject(new Error('chua co giong'));
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang || 'zh-CN'; u.rate = 0.8;
      u.onend = () => resolve(true);
      u.onerror = () => reject(new Error('giong may loi'));
      window.speechSynthesis.speak(u);
      setTimeout(() => {
        try { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); } catch (e) {}
      }, 120);
    } catch (e) { reject(e); }
  });
}
function sayNow(text) { sayNowP(text).catch(() => {}); return !!pickVoice(); }

/* Phát và chờ xong. Trả Promise. */
function speakP(text, audioUrl) {
  const mode = state.cfg.settings.tts || 'auto';
  const own = audioUrl && /^https?:\/\//i.test(audioUrl) ? audioUrl : '';
  if (!text && !own) return Promise.resolve(false);
  if (own) return playUrlP(own).catch(() => sayNowP(text));
  if (mode === 'local') return sayNowP(text);
  if (mode === 'net')   return playUrlP(netVoiceUrl(text));
  return isSentence(text)
    ? sayNowP(text).catch(() => playUrlP(netVoiceUrl(text)))
    : playUrlP(netVoiceUrl(text)).catch(() => sayNowP(text));
}

function speak(text, audioUrl) {
  speakP(text, audioUrl).catch(() => {
    if (voiceWarned) return;
    voiceWarned = true;
    toast('Chưa phát được tiếng — vào Cài đặt mục 4 bấm "Kiểm tra âm thanh"', 'err');
  });
}

/* Đọc lần lượt nhiều câu, dừng được giữa chừng */
let seqAbort = false;
function stopSpeak() {
  seqAbort = true;
  try { window.speechSynthesis.cancel(); } catch (e) {}
  if (fallbackAudio) { try { fallbackAudio.pause(); } catch (e) {} }
}
async function speakSeq(texts, onStep) {
  seqAbort = false;
  for (let i = 0; i < texts.length; i++) {
    if (seqAbort) return;
    if (onStep) onStep(i);
    try { await speakP(texts[i]); } catch (e) { /* câu hỏng thì bỏ qua, đọc tiếp */ }
    if (seqAbort) return;
    await new Promise(r => setTimeout(r, 320));
  }
  if (onStep) onStep(-1);
}

/* Thử lần lượt từng cách, báo cách nào kêu được */
async function audioCheck() {
  const st = $('#voiceStatus');
  setStatus(st, 'Đang thử…', 'info');
  const out = [];
  try { await playUrlP(netVoiceUrl('你好')); out.push('✔ Giọng thật trên mạng: phát được'); }
  catch (e) { out.push('✘ Giọng thật trên mạng: không gọi được (mất mạng hoặc bị chặn)'); }
  await new Promise(r => setTimeout(r, 1400));
  const zh = zhVoices();
  if (!zh.length) out.push('✘ Giọng trong máy: chưa cài giọng tiếng Trung nào');
  else if (sayNow('你好')) out.push('✔ Giọng trong máy: đã gọi ' + (pickVoice() || {}).name);
  else out.push('✘ Giọng trong máy: gọi không được');
  out.push('Nếu cả hai đều có dấu ✔ mà vẫn không nghe thấy gì thì vấn đề nằm ở loa hoặc trình duyệt đang bị tắt tiếng — bấm chuột phải vào tab, xem có dòng "Bật tiếng trang web" không.');
  setStatus(st, out.join('\n'), out[0].charAt(0) === '✔' ? 'ok' : 'info');
}

/* Giữ cho danh sách giọng luôn mới */
function watchVoices() {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      if (state.view === 'caidat') fillVoiceSelect();
    });
  } catch (e) {}
}

/* ═══ 6. KHUNG APP ══════════════════════════════════════════════ */

const VIEWS = [
  { id: 'kho',     ico: 'book',   label: 'Kho từ' },
  { id: 'hoc',     ico: 'repeat', label: 'Học' },
  { id: 'thongke', ico: 'chart',  label: 'Thống kê' },
  { id: 'caidat',  ico: 'gear',   label: 'Cài đặt' }
];
function buildNav() {
  ['#navTop', '#navBottom'].forEach(sel => {
    const box = $(sel); box.innerHTML = '';
    VIEWS.forEach(v => box.appendChild(el('button', {
      class: 'navbtn', 'data-view': v.id, onclick: () => go(v.id)
    }, [
      sel === '#navBottom' ? el('span', { class: 'navbtn__ico' }, [icon(v.ico, 19)]) : null,
      el('span', { text: v.label }),
      v.id === 'hoc' ? el('span', { class: 'navdot', id: sel === '#navTop' ? 'dotTop' : 'dotBot', hidden: true }) : null
    ])));
  });
}
function go(view) {
  state.view = view;
  $$('.view').forEach(s => s.classList.toggle('is-on', s.id === 'view-' + view));
  $$('.navbtn').forEach(b => b.classList.toggle('is-on', b.getAttribute('data-view') === view));
  window.scrollTo(0, 0);
  if (view === 'kho') renderKho();
  if (view === 'hoc') renderHocSetup();
  if (view === 'thongke') renderStats();
  if (view === 'caidat') fillSettings();
}
function toast(msg, kind) {
  const t = el('div', { class: 'toast ' + (kind || ''), text: msg });
  $('#toastRoot').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 2600);
}
function openModal(node, onClose) {
  const mask = el('div', { class: 'mask', onclick: e => { if (e.target === mask) close(); } }, [node]);
  function close() { mask.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  $('#modalRoot').appendChild(mask);
  mask._close = close;
  return close;
}
function closeAllModals() { $$('.mask').forEach(m => m._close ? m._close() : m.remove()); }
function modalShell(title, bodyNode, footNodes) {
  let close;
  const head = el('div', { class: 'modal__head' }, [
    el('span', { class: 'modal__title', text: title }),
    el('button', { class: 'btn btn--icon', onclick: () => close() }, [icon('x')])
  ]);
  const modal = el('div', { class: 'modal' }, [head, el('div', { class: 'modal__body' }, [bodyNode])]);
  if (footNodes && footNodes.length) modal.appendChild(el('div', { class: 'modal__foot' }, footNodes));
  close = openModal(modal);
  return { modal, close };
}
function confirmBox(title, msg, okLabel, onOk, danger) {
  const body = el('p', { text: msg });
  let close;
  const btnOk = el('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), text: okLabel, onclick: () => { close(); onOk(); } });
  const btnNo = el('button', { class: 'btn', text: 'Huỷ', onclick: () => close() });
  close = modalShell(title, body, [btnNo, btnOk]).close;
}

/* ═══ 7. MÀN KHO TỪ ═════════════════════════════════════════════ */

/* ─── BÀI KHOÁ ─────────────────────────────────────────────────────
   Mỗi dòng trong tab là một câu thoại; gom lại thành từng bài, xếp theo
   cấp HSK. Cột dò tự động nên đổi tên cột vẫn chạy.                    */
const LESSON_FIELDS = [
  { key: 'bai',    hints: ['bài', 'bai', 'lesson', 'số bài'] },
  { key: 'ten',    hints: ['tên bài', 'tên', 'title'] },
  { key: 'hsk',    hints: ['hsk', 'cấp'] },
  { key: 'thutu',  hints: ['thứ tự', 'thu tu', 'order', 'stt trong bài'] },
  { key: 'vai',    hints: ['vai', 'người nói', 'speaker', 'nhân vật'] },
  { key: 'han',    hints: ['chữ hán', 'hán', 'chinese', 'câu'] },
  { key: 'pinyin', hints: ['pinyin', 'phiên âm'] },
  { key: 'viet',   hints: ['nghĩa tiếng việt', 'nghĩa', 'tiếng việt', 'dịch'] },
  { key: 'note',   hints: ['ghi chú', 'note'] }
];

function buildLessons(table) {
  const m = guessCols(table.cols, LESSON_FIELDS);
  const byKey = {};
  table.rows.forEach((r, i) => {
    const raw = {};
    table.cols.forEach((c, j) => { if (c) raw[c] = r[j] == null ? '' : r[j]; });
    const g = k => (m[k] ? String(raw[m[k]] || '').trim() : '');
    const han = g('han');
    if (!han) return;
    const bai = g('bai') || '?';
    const hsk = g('hsk') || 'Khác';
    const key = hsk + '|' + bai;
    if (!byKey[key]) byKey[key] = { key: key, bai: bai, ten: g('ten'), hsk: hsk, lines: [] };
    if (!byKey[key].ten && g('ten')) byKey[key].ten = g('ten');
    byKey[key].lines.push({
      thutu: +g('thutu') || (i + 1),
      vai: g('vai') || '',
      han: han, pinyin: g('pinyin'), viet: g('viet'), note: g('note'), raw: raw
    });
  });
  const out = Object.keys(byKey).map(k => byKey[k]);
  out.forEach(l => l.lines.sort((a, b) => a.thutu - b.thutu));
  out.sort((a, b) => a.hsk.localeCompare(b.hsk, 'vi') || (parseFloat(a.bai) || 0) - (parseFloat(b.bai) || 0));
  return out;
}

async function loadLessons(silent) {
  const tab = (state.cfg.lessonTab || '').trim();
  if (!tab || !state.cfg.sheetId) return null;
  const t = await readSheet(state.cfg.sheetId, tab, '');
  state.lessons = buildLessons(t);
  LS.set(K.lessons, state.lessons);
  if (!silent) toast('Đã nạp ' + state.lessons.length + ' bài khoá', 'ok');
  return state.lessons;
}

function curList() {
  if (state.mode === 'bo') return state.rads;
  if (state.mode === 'py') return state.pins;
  return state.words;
}
const STROKE_COL = '\u241Fstrokes';
const RF = '\u241Ff';   // nhóm theo một mục của bộ thủ (đã bóc từ ô ghi chú)
const PY_ORDER = [
  'Thanh mẫu', 'Vận mẫu', 'Thanh điệu',
  'Âm môi', 'Âm đầu lưỡi', 'Âm gốc lưỡi', 'Âm mặt lưỡi', 'Âm uốn lưỡi', 'Âm đầu lưỡi trước',
  'Nguyên âm đơn', 'Nguyên âm kép', 'Vận mẫu mũi', 'Vận mẫu đặc biệt'
];
const PY = '\u241Fp';   // nhóm theo một mục của âm tiết pinyin

function groupOptions() {
  const opts = [{ v: '', t: 'Không nhóm' }];
  const c = state.radCols || {};
  if (state.mode === 'py') {
    opts.push({ v: PY + 'kind',  t: 'Loại' });
    opts.push({ v: PY + 'group', t: 'Nhóm âm' });
    return opts;
  }
  if (state.mode === 'bo') {
    const has = k => state.rads.some(r => r.r && r.r[k]);
    if (has('cat'))     opts.push({ v: RF + 'cat',  t: 'Phân loại ngữ nghĩa' });
    if (has('strokes')) opts.push({ v: STROKE_COL,  t: 'Số nét' });
    if (has('freq'))    opts.push({ v: RF + 'freq', t: 'Mức phổ biến' });
    if (has('pos'))     opts.push({ v: RF + 'pos',  t: 'Vị trí thường gặp' });
    return opts;
  }
  if (state.rads.length) opts.push({ v: RAD_COL, t: 'Bộ thủ' });
  if (lookupReady()) opts.push({ v: LOOKUP_COL, t: lookupLabel() });
  // cột trong sheet trùng tên với mục đã có ở trên thì bỏ, tránh hai mục "Bộ thủ"
  (state.cfg.groupBy || []).forEach(c2 => {
    if (opts.some(o => noAccent(o.t) === noAccent(c2))) return;
    opts.push({ v: c2, t: c2 });
  });
  return opts;
}

/* Một từ có thể thuộc NHIỀU nhóm: từ hai chữ mà mỗi chữ một bộ thủ thì nó
   xuất hiện ở cả hai bộ. Vì vậy hàm này trả về danh sách chứ không phải một giá trị. */
function groupKeysOf(w, gcol) {
  if (gcol === RAD_COL) {
    const rs = radicalsOf(w).map(radLabel);
    return rs.length ? rs : ['(chưa xác định bộ thủ)'];
  }
  if (gcol === LOOKUP_COL) {
    const cs = lookupCatsOf(w);
    return cs.length ? cs : ['Chưa phân loại'];
  }
  if (gcol === STROKE_COL) return [(w.r && w.r.strokes) || '(chưa rõ)'];
  if (gcol.indexOf(RF) === 0) return [(w.r && w.r[gcol.slice(RF.length)]) || '(chưa rõ)'];
  if (gcol.indexOf(PY) === 0) {
    if (!w.p) return ['(chưa rõ)'];
    return [w.p[gcol.slice(PY.length)] || '(không có)'];
  }
  return [(w.raw[gcol] || '').trim() || '(chưa phân loại)'];
}
function fillGroupSelect() {
  const sel = $('#groupBy'), opts = groupOptions();
  const saved = state.meta.groupBy !== undefined ? state.meta.groupBy : ((state.cfg.groupBy || [])[0] || '');
  // Bảng tra nạp xong sau lần vẽ đầu, nên lựa chọn đã lưu lúc đó chưa có trong
  // danh sách. Hễ nó vừa khả dụng thì khôi phục lại, không thì giữ đang chọn.
  let want = opts.some(o => o.v === saved) ? saved : (sel.options.length ? sel.value : '');
  if (state.meta.groupBy === undefined && state.mode !== 'tu' && opts[1]) want = opts[1].v;
  if (!opts.some(o => o.v === want)) want = '';
  sel.innerHTML = '';
  opts.forEach(o => sel.appendChild(el('option', { value: o.v, text: o.t })));
  sel.value = want;
}
/* Điểm càng cao càng khớp sát. 0 = không khớp phần lõi. */
function scoreWord(w, q, rawq) {
  if (rawq && w.f.hanzi === rawq) return 100;
  if (rawq && w.f.hanzi.indexOf(rawq) > -1) return 90;
  if (w._py === q || w._pyz === q) return 80;
  if (w._py.indexOf(q) === 0 || w._pyz.indexOf(q) === 0) return 70;
  if (w._py.indexOf(q) > -1 || w._pyz.indexOf(q) > -1) return 62;
  if (w._vi.indexOf(q) === 0) return 55;
  const at = w._vi.indexOf(q);
  if (at > -1) return 45 - Math.min(10, Math.floor(at / 20));
  return 0;
}
function filterWords() {
  const rawq = $('#q').value.trim();
  const q = noAccent(rawq);
  const st = $('#filterState').value;
  let pool = curList();

  if (q) {
    let hits = pool.map(w => ({ w: w, sc: scoreWord(w, q, rawq) })).filter(x => x.sc > 0);
    // không thấy ở chữ Hán/pinyin/nghĩa thì mới lục toàn bộ nội dung
    state.searchDeep = false;
    if (!hits.length && q.length >= 2) {
      hits = pool.filter(w => w._full.indexOf(q) > -1).map(w => ({ w: w, sc: 1 }));
      state.searchDeep = hits.length > 0;
    }
    hits.sort((a, b) => b.sc - a.sc || a.w.f.hanzi.localeCompare(b.w.f.hanzi));
    pool = hits.map(x => x.w);
  }

  if (st === 'added') {
    const ids = state.meta.lastAdded || [];
    return pool.filter(w => ids.indexOf(w.id) > -1);
  }

  return pool.filter(w => {
    if (st) {
      const s = wordState(w.id);
      if (st === 'due' && s !== 'due') return false;
      if (st === 'new' && s !== 'new') return false;
      if (st === 'learn' && s !== 'learn') return false;
      if (st === 'review' && s !== 'review') return false;
    }
    return true;
  });
}
function renderKho() {
  const seg = $('#segMode');
  seg.hidden = !state.rads.length && !state.pins.length && !state.lessons.length;
  const segBo = $('.seg__btn[data-mode="bo"]', seg); if (segBo) segBo.hidden = !state.rads.length;
  const segPy = $('.seg__btn[data-mode="py"]', seg); if (segPy) segPy.hidden = !state.pins.length;
  const segBk = $('.seg__btn[data-mode="bk"]', seg);
  if (segBk) segBk.hidden = !state.lessons.length && state.mode !== 'bk';
  $$('.seg__btn', seg).forEach(b => b.classList.toggle('is-on', b.getAttribute('data-mode') === state.mode));
  const isBk = state.mode === 'bk';
  $('.toolbar__row').hidden = isBk;
  $('.search').hidden = isBk;
  if (isBk) { $('#khoMeta').textContent = ''; renderLessons(); return; }
  $('.toolbar__row').hidden = false;
  $('.search').hidden = false;
  fillGroupSelect();
  $('#btnAdd').style.display = (hasWrite() && state.mode === 'tu') ? '' : 'none';
  // bộ lọc trạng thái chỉ có nghĩa với từ vựng
  const fs = $('#filterState');
  fs.closest('.field').hidden = state.mode !== 'tu';
  if (state.mode !== 'tu' && fs.value) { fs.value = ''; }
  const list = $('#khoList'); list.innerHTML = '';
  const words = filterWords();
  state.filtered = words;

  const meta = [];
  const total = curList().length;
  const dv = { bo: ' bộ thủ', py: ' mục pinyin' }[state.mode] || ' từ trong kho';
  if (state.demo) meta.push('Đang xem dữ liệu mẫu — vào Cài đặt để nối Google Sheet của bạn');
  else {
    meta.push(total + dv);
    if (words.length !== total) meta.push('hiện ' + words.length);
    if (state.searchDeep) meta.push('không thấy ở chữ Hán/pinyin/nghĩa nên đang tìm trong toàn bộ nội dung');
    if ($('#filterState').value === 'added') {
      meta.push(state.meta.lastAddedAt
        ? 'mẻ thêm mới lúc ' + fmtClock(state.meta.lastAddedAt)
        : 'chưa ghi nhận lần thêm mới nào — bấm Đồng bộ sau khi nhập thêm từ vào Sheet');
    }
    if (state.meta.syncAt) meta.push('đồng bộ lúc ' + fmtClock(state.meta.syncAt));
  }
  $('#khoMeta').textContent = meta.join(' · ');

  if (!words.length) {
    list.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__ico' }, [icon('inbox', 38)]),
      el('h3', { text: curList().length ? 'Không có mục nào khớp' : 'Kho đang trống' }),
      el('p', { text: curList().length ? 'Thử đổi từ khoá hoặc bỏ bộ lọc trạng thái.' : 'Vào Cài đặt để nối với Google Sheet của bạn.' })
    ]));
    return;
  }

  const gcol = $('#groupBy').value;

  // khi đang tìm: xếp theo độ khớp, không chia nhóm
  if ($('#q').value.trim() || !gcol) { list.appendChild(gridOf(words)); return; }

  const buckets = new Map();
  words.forEach(w => {
    groupKeysOf(w, gcol).forEach(k => {
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(w);
    });
  });

  // gộp các nhóm quá ít từ lại cho đỡ vụn
  const minG = state.cfg.settings.minGroup || 0;
  if (minG > 1) {
    const small = [];
    let nSmall = 0;
    Array.from(buckets.keys()).forEach(k => {
      if (buckets.get(k).length < minG && k !== 'Khác') {
        small.push.apply(small, buckets.get(k));
        nSmall++;
        buckets.delete(k);
      }
    });
    if (small.length) {
      buckets.set('Khác (' + nSmall + ' nhóm lẻ)', small);
    }
  }

  const keys = Array.from(buckets.keys()).sort((a, b) => {
    if (state.mode === 'py') {
      const ia = PY_ORDER.indexOf(a), ib = PY_ORDER.indexOf(b);
      if (ia > -1 || ib > -1) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    const la = a.startsWith('(') || a.startsWith('Khác') || a.startsWith('Chưa');
    const lb = b.startsWith('(') || b.startsWith('Khác') || b.startsWith('Chưa');
    if (la !== lb) return la ? 1 : -1;
    return buckets.get(b).length - buckets.get(a).length || a.localeCompare(b, 'vi');
  });
  const closed = state.meta.closed || {};
  keys.forEach(k => {
    const box = el('div', { class: 'group' + (closed[gcol + '|' + k] ? ' is-closed' : '') });
    box.appendChild(el('div', {
      class: 'group__head', onclick: () => {
        box.classList.toggle('is-closed');
        closed[gcol + '|' + k] = box.classList.contains('is-closed');
        state.meta.closed = closed; LS.set(K.meta, state.meta);
      }
    }, [
      el('span', { class: 'group__caret' }, [icon('down', 12)]),
      el('span', { class: 'group__name', text: k }),
      el('span', { class: 'group__count', text: buckets.get(k).length + ({ bo: ' bộ', py: ' mục' }[state.mode] || ' từ') })
    ]));
    box.appendChild(gridOf(buckets.get(k)));
    list.appendChild(box);
  });
}
/* Mỗi bài khoá là một thẻ, xếp nhóm theo cấp HSK — cùng kiểu với kho từ vựng */
function renderLessons() {
  const box = $('#khoList');
  box.innerHTML = '';
  if (!state.lessons.length) {
    const dangTai = !!(state.cfg.lessonTab || '').trim();
    box.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__ico' }, [icon(dangTai ? 'refresh' : 'inbox', 38)]),
      el('h3', { text: dangTai ? 'Đang tải bài khoá…' : 'Chưa có bài khoá' }),
      el('p', { text: dangTai
        ? 'Đợi lần đồng bộ đầu tiên xong là hiện.'
        : 'Thêm tab "Bài khoá" vào Google Sheet rồi bấm Đồng bộ.' })
    ]));
    return;
  }
  const byHsk = {};
  state.lessons.forEach(l => { (byHsk[l.hsk] = byHsk[l.hsk] || []).push(l); });

  Object.keys(byHsk).sort().forEach(h => {
    const g = el('div', { class: 'group' });
    g.appendChild(el('div', { class: 'group__head' }, [
      el('span', { class: 'group__caret' }, [icon('down', 12)]),
      el('span', { class: 'group__name', text: h }),
      el('span', { class: 'group__count', text: byHsk[h].length + ' bài' })
    ]));
    const grid = el('div', { class: 'grid grid--lesson' });
    byHsk[h].forEach(l => grid.appendChild(el('div', {
      class: 'lcard', onclick: () => openLesson(l)
    }, [
      el('div', { class: 'lcard__no', text: 'Bài ' + l.bai }),
      el('div', { class: 'lcard__ten', text: l.ten || '(chưa đặt tên)' }),
      el('div', { class: 'lcard__n', text: l.lines.length + ' câu hội thoại' })
    ])));
    g.appendChild(grid);
    box.appendChild(g);
  });
}

/* Hội thoại: từng lượt A / B xếp lần lượt, mỗi câu đủ Hán · pinyin · nghĩa · loa */
function openLesson(L) {
  closeAllModals();
  stopSpeak();
  const body = el('div', { class: 'dlg' });
  L.lines.forEach(ln => {
    body.appendChild(el('div', { class: 'dlg__row' }, [
      el('span', { class: 'dlg__vai', text: (ln.vai || '') + ':' }),
      el('div', { class: 'dlg__txt' }, [
        el('div', { class: 'dlg__han', text: ln.han }),
        ln.pinyin ? el('div', { class: 'dlg__py', text: ln.pinyin }) : null,
        ln.viet ? el('div', { class: 'dlg__vi', text: ln.viet }) : null,
        ln.note ? el('div', { class: 'dlg__note', text: ln.note }) : null
      ]),
      el('button', {
        class: 'dlg__spk', title: 'Nghe câu này',
        onclick: e => { e.stopPropagation(); stopSpeak(); speak(ln.han); }
      }, [icon('volume', 16)])
    ]));
  });

  let close;
  const btnAll = el('button', { class: 'btn', onclick: () => togglePlayAll(L, btnAll) },
                    [icon('volume'), 'Nghe cả bài']);
  close = modalShell('Bài ' + L.bai + (L.ten ? ' · ' + L.ten : ''), body, [
    btnAll,
    el('button', { class: 'btn', onclick: () => close() }, ['Đóng'])
  ]).close;
}

/* Đọc lần lượt cả bài, tô sáng câu đang đọc; bấm lần nữa thì dừng */
function togglePlayAll(L, btn) {
  const rows = $$('.dlg__row');
  const mark = i => rows.forEach((r, k) => r.classList.toggle('is-play', k === i));
  const setLabel = (ico, txt) => {
    btn.innerHTML = '';
    btn.appendChild(icon(ico));
    btn.appendChild(document.createTextNode(txt));
  };
  if (btn.dataset.on === '1') {
    stopSpeak(); btn.dataset.on = ''; mark(-1); setLabel('volume', 'Nghe cả bài');
    return;
  }
  btn.dataset.on = '1';
  setLabel('x', 'Dừng');
  speakSeq(L.lines.map(x => x.han), i => {
    mark(i);
    if (i === -1) { btn.dataset.on = ''; setLabel('volume', 'Nghe cả bài'); }
  });
}

function gridOf(words) {
  const g = el('div', { class: 'grid' });
  words.forEach(w => g.appendChild(wordCard(w)));
  return g;
}
function wordCard(w) {
  const hocDuoc = !w.isRad && !w.isPin;
  return el('div', { class: 'wcard' + (w.isPin ? ' wcard--pin' : ''), onclick: () => openDetail(w.id) }, [
    hocDuoc ? el('span', { class: 'wcard__dot dot-' + wordState(w.id) }) : null,
    el('button', {
      class: 'wcard__spk', title: 'Phát âm',
      onclick: e => { e.stopPropagation(); speak(spkText(w), w.f.audio); }
    }, [icon('volume', 13)]),
    el('div', { class: 'wcard__han', text: w.f.hanzi }),
    el('div', { class: 'wcard__py', text: (w.isRad && w.r.name ? w.r.name + ' · ' : '') + w.f.pinyin }),
    el('div', { class: 'wcard__vi', title: w.f.nghiaViet, text: meaningOnly(w.f.nghiaViet) })
  ]);
}

/* ═══ 8. CHI TIẾT & FORM THÊM/SỬA ═══════════════════════════════ */

const STATE_VI = { new: 'Chưa học', learn: 'Đang học', relearn: 'Đang học lại', review: 'Đã thuộc', due: 'Đến hạn ôn' };

/* Khối phụ trong màn chi tiết: từ thì liệt kê bộ thủ của nó, bộ thủ thì liệt kê
   các từ HSK đang dùng bộ đó — bấm vào là nhảy sang. */
function radBlock(w) {
  const box = el('div', {});
  if (w.isRad) {
    const used = state.words.filter(x => radicalsOf(x).indexOf(w.f.hanzi) > -1);
    if (!used.length) return box;
    box.appendChild(el('div', { class: 'sechead', text: 'Từ trong kho dùng bộ này (' + used.length + ')' }));
    const chips = el('div', { class: 'radchips' });
    used.forEach(x => chips.appendChild(el('button', {
      class: 'radchip', onclick: () => { state.mode = 'tu'; saveMode(); openDetail(x.id); }
    }, [el('span', { class: 'han', text: x.f.hanzi }), x.f.pinyin])));
    box.appendChild(chips);
    return box;
  }
  const rs = radicalsOf(w);
  if (!rs.length || !state.rads.length) return box;
  box.appendChild(el('div', { class: 'sechead', text: 'Bộ thủ trong từ này (' + rs.length + ')' }));
  const chips = el('div', { class: 'radchips' });
  rs.forEach(ch => {
    const r = state.radByChar[ch];
    chips.appendChild(el('button', {
      class: 'radchip', onclick: () => {
        state.mode = 'bo'; saveMode();
        const rr = state.radByChar[ch];
        if (rr) openDetail(rr.id);
      }
    }, [el('span', { class: 'han', text: ch }), (r && r.r.name ? r.r.name : '') + (r && r.f.nghiaViet ? ' — ' + r.f.nghiaViet : '')]));
  });
  box.appendChild(chips);
  return box;
}
function saveMode() { state.meta.mode = state.mode; LS.set(K.meta, state.meta); }

function openDetail(id) {
  const it = findItem(id);
  const pool = !it ? state.words
             : it.isRad ? state.rads
             : it.isPin ? state.pins
             : state.words;
  const list = (state.filtered.length && state.filtered.indexOf(it) > -1) ? state.filtered : pool;
  const idx = list.findIndex(w => w.id === id);
  if (idx < 0) return;
  state.detailIdx = idx;
  showDetail(list, idx);
}
function showDetail(list, idx) {
  closeAllModals();
  const w = list[idx];
  const st = state.prog[w.id];

  const rows = [];
  Object.keys(w.raw).forEach(c => {
    if (/^id$/i.test(c.trim())) return;
    const v = w.raw[c];
    if (!v) return;
    const isHan = /[一-鿿]/.test(v);
    // Ô kiểu <img src="..."> : ảnh trên mạng thì hiện ảnh, ảnh nằm trên máy thì
    // hiện nguyên văn đường dẫn — không bỏ đi, để không thiếu nội dung nào.
    const img = v.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
    let cell;
    if (img && /^https?:\/\//i.test(img[1])) {
      cell = el('td', {}, [el('img', { src: img[1], alt: c, class: 'dimg' })]);
    } else {
      cell = el('td', { class: isHan ? 'han' : '', text: v });
    }
    rows.push(el('tr', {}, [el('th', { text: c }), cell]));
  });

  const body = el('div', { class: w.isPin ? 'detail--pin' : '' }, [
    el('div', { class: 'detail__top' }, [
      el('div', { class: 'detail__han', text: w.f.hanzi }),
      el('div', { class: 'detail__py', text: (w.isRad && w.r.name ? w.r.name + ' · ' : '') + w.f.pinyin }),
      w.isPin ? null : el('div', { class: 'detail__vi', text: w.f.nghiaViet }),
      el('div', { class: 'detail__spk' }, [
        el('button', { class: 'btn', onclick: () => speak(spkText(w), w.f.audio) }, [icon('volume'), 'Nghe phát âm'])
      ])
    ]),
    w.isPin ? drillTable(w) : null,
    el('table', { class: 'dtable' }, [el('tbody', {}, rows)]),
    w.isRad ? radBlock(w) : null,
    (w.isRad || w.isPin) ? null : el('div', { class: 'srsbox', html:
      '<b>' + esc(STATE_VI[wordState(w.id)]) + '</b>' +
      (st ? ' · ôn ' + st.reps + ' lần · quên ' + st.lapses + ' lần' +
            (st.r ? ' · lần cuối chọn <b>' + esc(RATING_VI[st.r] || '') + '</b>' : '') +
            (st.due ? '<br>Hạn ôn tới: <b>' + esc(fmtClock(st.due)) + '</b>' +
                      (st.ivl ? ' (cách ' + esc(fmtIvl(st.ivl * DAY)) + ')' : '') : '') +
            (st.last ? '<br>Ôn gần nhất: ' + esc(fmtClock(st.last)) : '')
          : ' · từ này chưa vào lịch ôn')
    })
  ]);

  const foot = [];
  foot.push(el('div', { class: 'navpair' }, [
    el('button', { class: 'btn btn--icon', disabled: idx <= 0, onclick: () => showDetail(list, idx - 1) }, [icon('left')]),
    el('button', { class: 'btn btn--icon', disabled: idx >= list.length - 1, onclick: () => showDetail(list, idx + 1) }, [icon('right')])
  ]));
  if (hasWrite()) {
    foot.push(el('button', { class: 'btn', onclick: () => openWordForm(w) }, [icon('edit', 16), 'Sửa']));
    foot.push(el('button', {
      class: 'btn btn--danger',
      onclick: () => confirmBox('Xoá từ này?', 'Dòng "' + w.f.hanzi + '" sẽ bị xoá khỏi Google Sheet. Không khôi phục được.', 'Xoá', () => delWord(w), true)
    }, [icon('trash', 16), 'Xoá']));
  }
  modalShell(w.isRad ? 'Chi tiết bộ thủ' : w.isPin ? 'Chi tiết âm tiết' : 'Chi tiết từ', body, foot);
}

function openWordForm(word) {
  const cols = state.cfg.cols && state.cfg.cols.length
    ? state.cfg.cols
    : Object.keys((state.words[0] || { raw: {} }).raw);
  const inputs = {};
  const box = el('div', {});
  // id do Sheet cấp, STT thì đánh số tiếp theo tự động — không bắt gõ tay
  const AUTO = c => /^id$/i.test(c.trim()) || /^(stt|no\.?|số thứ tự|#)$/i.test(c.trim());
  const autoCols = cols.filter(AUTO);
  cols.forEach(c => {
    if (AUTO(c)) return;
    const inp = el('input', { type: 'text', value: word ? (word.raw[c] || '') : '' });
    inputs[c] = inp;
    box.appendChild(el('label', { class: 'field field--block' }, [el('span', { class: 'field__lbl', text: c }), inp]));
  });
  if (!word && autoCols.length) {
    box.appendChild(el('p', { class: 'hint', style: 'margin-top:6px',
      text: 'Cột ' + autoCols.join(' và ') + ' để Sheet tự điền, bạn không phải nhập.' }));
  }
  let close;
  const save = async () => {
    const row = {};
    Object.keys(inputs).forEach(c => row[c] = inputs[c].value.trim());
    const hCol = state.cfg.map.hanzi;
    if (hCol && !row[hCol]) { toast('Chưa nhập chữ Hán', 'err'); return; }
    close();
    await upsertWord(word ? word.id : '', row);
  };
  close = modalShell(word ? 'Sửa từ' : 'Thêm từ mới', box, [
    el('button', { class: 'btn', text: 'Huỷ', onclick: () => close() }),
    el('button', { class: 'btn btn--primary', text: 'Lưu vào Sheet', onclick: save })
  ]).close;
}

async function upsertWord(id, row) {
  const newId = id || uid();
  const local = mkWord(Object.assign({ id: newId }, row), state.cfg.map);
  const at = state.words.findIndex(w => w.id === id);
  if (at >= 0) state.words[at] = local; else state.words.push(local);
  saveWords(); renderKho();
  try {
    const res = await callApi('upsert', { id: newId, row: row });
    if (at >= 0) {
      toast('Đã cập nhật vào Sheet', 'ok');
    } else {
      toast('Đã thêm vào Sheet' + (res && res.stt ? ' — STT ' + res.stt : '') +
            (res && res.id ? ', mã ' + res.id : ''), 'ok');
      // Sheet mới là nơi cấp id và STT thật, kéo lại cho khớp
      await doSync(true);
    }
  } catch (e) {
    enqueue('upsert', { id: newId, row: row });
    toast('Chưa ghi được lên Sheet — đã xếp hàng chờ', 'err');
  }
}
async function delWord(w) {
  closeAllModals();
  state.words = state.words.filter(x => x.id !== w.id);
  delete state.prog[w.id];
  saveWords(); saveProg(); renderKho();
  try { await callApi('delete', { id: w.id }); toast('Đã xoá khỏi Sheet', 'ok'); }
  catch (e) { enqueue('delete', { id: w.id }); toast('Chưa xoá được trên Sheet — đã xếp hàng chờ', 'err'); }
}

/* ═══ 9. MÀN HỌC ════════════════════════════════════════════════ */

/* Chỉ học TỪ VỰNG. Bộ thủ và pinyin là kho tra cứu, không đưa vào lịch ôn. */
function deckOptions() {
  const opts = [{ v: '', t: 'Toàn bộ kho (' + state.words.length + ' từ)' }];
  const DECK_MIN = 3;    // nhóm dưới 3 từ không đủ làm một buổi học, bỏ cho đỡ rối

  if (lookupReady()) {
    const cnt = {};
    state.words.forEach(w => { const v = lookupOf(w); if (v) cnt[v] = (cnt[v] || 0) + 1; });
    Object.keys(cnt).filter(v => cnt[v] >= DECK_MIN)
      .sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b, 'vi'))
      .forEach(v => opts.push({
        v: LOOKUP_COL + '\u241F' + v,
        t: lookupLabel() + ': ' + v + ' (' + cnt[v] + ')'
      }));
  }
  (state.cfg.groupBy || []).forEach(col => {
    const cnt = {};
    state.words.forEach(w => { const v = (w.raw[col] || '').trim(); if (v) cnt[v] = (cnt[v] || 0) + 1; });
    Object.keys(cnt).filter(v => cnt[v] >= DECK_MIN)
      .sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b, 'vi'))
      .forEach(v => opts.push({
        v: col + '\u241F' + v,
        t: col + ': ' + v + ' (' + cnt[v] + ')'
      }));
  });
  return opts;
}
function deckWords(key) {
  if (!key) return state.words;
  const p = key.split('\u241F');
  if (p[0] === 'p') {
    if (p[1] === '*') return state.pins;
    if (p[1] === 'kind') return state.pins.filter(x => x.p.kind === p[2]);
    return state.pins;
  }
  if (p[0] === 'r') {
    if (p[1] === '*') return state.rads;
    if (p[1] === 'cat') return state.rads.filter(r => r.r.cat === p[2]);
    return state.rads;
  }
  if (p[0] === LOOKUP_COL) return state.words.filter(w => lookupOf(w) === p[1]);
  return state.words.filter(w => (w.raw[p[0]] || '').trim() === p[1]);
}
function countsOf(words) {
  const now = Date.now();
  let nw = 0, lr = 0, du = 0;
  words.forEach(w => {
    const st = state.prog[w.id];
    if (!st || st.s === 'new') nw++;
    else if (st.due <= now) { (st.s === 'review') ? du++ : lr++; }
  });
  return { nw, lr, du };
}
function renderHocSetup() {
  $('#hocSetup').hidden = false; $('#hocSession').hidden = true; $('#hocDone').hidden = true;

  const sel = $('#deckPick'), cur = sel.value;
  sel.innerHTML = '';
  deckOptions().forEach(o => sel.appendChild(el('option', { value: o.v, text: o.t })));
  sel.value = Array.from(sel.options).some(o => o.value === cur) ? cur : '';
  sel.onchange = () => paintCounts();
  $('#cardDir').value = state.cfg.settings.dir || 'h2m';
  $('#cardDir').onchange = () => { state.cfg.settings.dir = $('#cardDir').value; saveCfg(); };
  paintCounts();
}
/* Số từ mới còn được phép học trong hôm nay */
function newLeftToday() {
  const used = state.meta.newDay === todayKey() ? (state.meta.newCount || 0) : 0;
  return Math.max(0, (state.cfg.settings.newPerDay || 10) - used);
}
function paintCounts() {
  const c = countsOf(deckWords($('#deckPick').value));
  const doneToday = state.log[todayKey()] || 0;
  const left = newLeftToday();
  $('#cntNew').textContent = Math.min(c.nw, left);
  $('#cntLearn').textContent = c.lr;
  $('#cntDue').textContent = c.du;
  $('#btnStart').disabled = (Math.min(c.nw, left) + c.lr + c.du) === 0;
  $('#btnStart').textContent = (Math.min(c.nw, left) + c.lr + c.du) === 0
    ? (doneToday ? 'Hôm nay học xong rồi' : 'Chưa có thẻ nào đến hạn') : 'Bắt đầu học';
  paintDueDot();
}
function paintDueDot() {
  const c = countsOf(state.words);
  const left = newLeftToday();
  const n = Math.min(c.nw, left) + c.lr + c.du;
  ['#dotTop', '#dotBot'].forEach(s => { const d = $(s); if (d) { d.textContent = n > 99 ? '99+' : n; d.hidden = !n; } });
}
function startSession() {
  const words = deckWords($('#deckPick').value);
  const now = Date.now();
  const cap = state.cfg.settings.maxReview || 120;
  const newLeft = newLeftToday();

  const dues = [], news = [];
  words.forEach(w => {
    const st = state.prog[w.id];
    if (!st || st.s === 'new') news.push(w);
    else if (st.due <= now) dues.push(w);
  });
  dues.sort((a, b) => (state.prog[a.id].due) - (state.prog[b.id].due));
  const queue = dues.slice(0, cap).concat(news.slice(0, newLeft));
  // xáo nhẹ để không học liền tù tì cùng một chủ đề
  for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = queue[i]; queue[i] = queue[j]; queue[j] = t; }
  if (!queue.length) { toast('Không có thẻ nào để học', 'err'); return; }

  state.sess = { q: queue.map(w => w.id), total: queue.length, done: 0, seen: 0, newTaken: 0, flipped: false, dir: state.cfg.settings.dir || 'h2m' };
  $('#hocSetup').hidden = true; $('#hocDone').hidden = true; $('#hocSession').hidden = false;
  drawCard();
}
/* Tìm một thẻ theo id ở cả ba kho. Không đoán theo tiền tố nữa vì khi Sheet
   có cột id thật (TV-001 / BT-001) thì tiền tố r:/p: không còn. */
function findItem(id) {
  if (!id) return null;
  return state.words.find(w => w.id === id)
      || state.rads.find(w => w.id === id)
      || state.pins.find(w => w.id === id)
      || null;
}
function curWord() { return findItem(state.sess.q[0]); }
function cardDir() {
  const d = state.sess.dir;
  if (d !== 'mix') return d;
  return ['h2m', 'm2h', 'a2m'][Math.floor(Math.random() * 3)];
}
function drawCard() {
  const s = state.sess;
  if (!s.q.length) return finishSession();
  const w = curWord();
  if (!w) { s.q.shift(); return drawCard(); }
  s.flipped = false;
  s._dir = cardDir();

  $('#sessFill').style.width = Math.round(s.done / s.total * 100) + '%';
  $('#sessLeft').textContent = 'Còn ' + s.q.length + ' thẻ';
  $('#cardBack').hidden = true; $('#rateBox').hidden = true; $('#btnFlip').hidden = false;
  $('#card').classList.toggle('card--pin', !!w.isPin);

  const front = $('#cardFront'); front.innerHTML = '';
  if (s._dir === 'h2m') {
    front.appendChild(el('div', { class: 'q-han', text: w.f.hanzi }));
  } else if (s._dir === 'm2h') {
    front.appendChild(el('div', { class: 'q-vi', text: w.f.nghiaViet }));
  } else {
    front.appendChild(el('div', { class: 'q-audio' }, [icon('volume', 52)]));
    front.appendChild(el('div', { class: 'card__hint', text: 'Chạm để nghe lại' }));
    speak(spkText(w), w.f.audio);
  }
  front.appendChild(el('div', { class: 'card__hint', text: 'Chạm vào thẻ để xem đáp án' }));
}
function flipCard() {
  const s = state.sess;
  if (!s || s.flipped) return;
  s.flipped = true;
  const w = curWord();
  const back = $('#cardBack'); back.innerHTML = '';
  if (s._dir === 'm2h') back.appendChild(el('div', { class: 'a-han', text: w.f.hanzi }));
  if (w.isRad && w.r.name) back.appendChild(el('div', { class: 'a-name', text: w.r.name }));
  if (w.isPin) back.appendChild(el('div', { class: 'a-name', text: w.p.kind + ' · ' + w.p.group }));
  back.appendChild(el('div', { class: 'a-py', text: w.f.pinyin }));
  if (s._dir !== 'm2h') back.appendChild(el('div', { class: 'a-vi', text: w.f.nghiaViet }));
  if (s._dir === 'a2m') back.appendChild(el('div', { class: 'a-han', text: w.f.hanzi }));
  if (w.f.viDu) back.appendChild(el('div', { class: 'a-ex', html: '<span class="han">' + esc(w.f.viDu) + '</span>' + (w.f.nghiaViDu ? '<br>' + esc(w.f.nghiaViDu) : '') }));
  if (w.f.ghiChu) back.appendChild(el('div', { class: 'a-note', text: w.f.ghiChu }));
  back.appendChild(el('div', { class: 'detail__spk' }, [
    el('button', { class: 'btn', onclick: e => { e.stopPropagation(); speak(spkText(w), w.f.audio); } }, [icon('volume'), 'Nghe'])
  ]));
  back.hidden = false;
  $$('.card__hint', $('#cardFront')).forEach(h => h.hidden = true);
  $('#btnFlip').hidden = true;
  drawRateButtons();
}
function drawRateButtons() {
  const w = curWord(), st = getSrs(w.id);
  const box = $('#rateBox'); box.innerHTML = '';
  [['again', 'Lại', 1], ['hard', 'Khó', 2], ['good', 'Tốt', 3], ['easy', 'Dễ', 4]].forEach(r => {
    box.appendChild(el('button', { class: 'rbtn rbtn--' + r[0], onclick: () => rate(r[2]) }, [
      el('b', { text: r[1] }), el('span', { text: srsPreview(st, r[2]) })
    ]));
  });
  box.hidden = false;
}
function rate(r) {
  const s = state.sess, w = curWord();
  if (!w) return;
  const was = getSrs(w.id);
  const wasNew = (was.s === 'new');
  const next = srsApply(was, r);
  state.prog[w.id] = next; saveProg();

  if (wasNew) {
    // Phải so ngày TRƯỚC khi ghi đè newDay, nếu không thì điều kiện luôn đúng
    // và bộ đếm cộng dồn mãi -> học đủ 10 từ mới một lần là tắt hẳn từ mới.
    const today = todayKey();
    if (state.meta.newDay !== today) { state.meta.newDay = today; state.meta.newCount = 0; }
    state.meta.newCount = (state.meta.newCount || 0) + 1;
    LS.set(K.meta, state.meta);
  }
  const t = todayKey(); state.log[t] = (state.log[t] || 0) + 1; saveLog();
  s.seen++;
  queueProgressPush(w.id);
  queueLog(w, was, next);

  s.q.shift();
  // thẻ còn hạn ngắn (đang học) → đẩy lại vào giữa hàng đợi để gặp lại trong phiên
  if (next.due - Date.now() < 20 * MIN) s.q.splice(Math.min(s.q.length, 3), 0, w.id);
  else s.done++;

  if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  drawCard();
}
function finishSession() {
  $('#hocSession').hidden = true; $('#hocDone').hidden = false;
  $('#doneMsg').textContent = 'Đã ôn ' + state.sess.seen + ' lượt thẻ. Tổng hôm nay: ' + (state.log[todayKey()] || 0) + ' lượt.';
  state.sess = null;
  pushProgressNow();
  paintDueDot();
}
function quitSession() {
  state.sess = null;
  pushProgressNow();
  renderHocSetup();
}

/* ── Ghi tiến độ ra Google Sheet ────────────────────────────────
   Hai thứ khác nhau:
   · Tiến độ  — mỗi thẻ một dòng, ghi đè bằng trạng thái mới nhất
   · Nhật ký  — mỗi lượt bấm một dòng, chỉ thêm, để soi lại lịch sử
   Gom theo mẻ 15 giây cho khỏi gọi mạng giữa lúc đang học.            */

const RATING_VI = { 1: 'Lại', 2: 'Khó', 3: 'Tốt', 4: 'Dễ' };

function kindOf(w) { return w.isRad ? 'Bộ thủ' : w.isPin ? 'Pinyin' : 'Từ vựng'; }

/* Một dòng của tab Tiến độ, gồm cả cột chữ cho người đọc lẫn cột raw cho app */
function progRow(w, st) {
  return {
    id: st.id,
    label: w ? w.f.hanzi : '',
    kind: w ? kindOf(w) : '',
    stateVi: STATE_VI[wordState(st.id)] || '',
    ease: st.ease, ivl: st.ivl, due: st.due,
    reps: st.reps, lapses: st.lapses, last: st.last,
    ratingVi: RATING_VI[st.r] || '',
    raw: JSON.stringify(st)
  };
}

let progDirty = {}, logBuf = [], progTimer = null;

function queueProgressPush(id) {
  progDirty[id] = 1;
  clearTimeout(progTimer);
  progTimer = setTimeout(pushProgressNow, 15000);
}
function queueLog(w, before, after) {
  logBuf.push({
    ts: after.last,
    id: after.id,
    label: w ? w.f.hanzi : '',
    kind: w ? kindOf(w) : '',
    ratingVi: RATING_VI[after.r] || '',
    ivlBefore: before.s === 'new' ? 'thẻ mới' : fmtIvl(Math.max(MIN, (before.due || 0) - (before.last || 0)) || before.ivl * DAY),
    ivlAfter: fmtIvl(Math.max(MIN, after.due - after.last)),
    due: after.due
  });
}

async function pushProgressNow() {
  clearTimeout(progTimer);
  const ids = Object.keys(progDirty);
  const logs = logBuf.slice();
  if (!ids.length && !logs.length) return;
  progDirty = {}; logBuf = [];
  if (!hasWrite()) return;          // chưa nối Apps Script thì chỉ giữ ở máy

  const rows = ids.map(id => {
    const st = state.prog[id];
    return st ? progRow(findItem(id), st) : null;
  }).filter(Boolean);

  if (rows.length) {
    try { await callApi('saveProgress', { rows: rows }); }
    catch (e) { enqueue('saveProgress', { rows: rows }); }
  }
  if (logs.length) {
    try { await callApi('appendLog', { rows: logs }); }
    catch (e) { enqueue('appendLog', { rows: logs }); }
  }
}

/* ═══ 10. MÀN THỐNG KÊ ══════════════════════════════════════════ */

function renderStats() {
  const now = Date.now();
  let nw = 0, lr = 0, rv = 0, du = 0;
  state.words.forEach(w => {
    const st = state.prog[w.id];
    if (!st || st.s === 'new') nw++;
    else if (st.s === 'review') { rv++; if (st.due <= now) du++; }
    else { lr++; if (st.due <= now) du++; }
  });
  let streak = 0;
  for (let i = 0; ; i++) {
    const k = todayKey(now - i * DAY);
    if (state.log[k]) streak++;
    else if (i > 0) break;
    else if (i === 0) { /* hôm nay chưa học vẫn tính chuỗi từ hôm qua */ }
    if (i > 400) break;
  }
  const tiles = [
    { n: state.words.length, t: 'Từ trong kho', c: 'var(--text)' },
    { n: rv, t: 'Đã thuộc', c: 'var(--jade)' },
    { n: lr, t: 'Đang học', c: 'var(--gold)' },
    { n: du, t: 'Đến hạn ôn', c: 'var(--accent)' },
    { n: streak, t: 'Chuỗi ngày học', c: 'var(--blue)' },
    { n: state.log[todayKey()] || 0, t: 'Lượt ôn hôm nay', c: 'var(--text)' }
  ];
  const box = $('#statTiles'); box.innerHTML = '';
  tiles.forEach(t => box.appendChild(el('div', { class: 'stat' }, [
    el('b', { text: String(t.n), style: 'color:' + t.c }), el('span', { text: t.t })
  ])));

  const chart = $('#chart30'); chart.innerHTML = '';
  const days = [];
  for (let i = 29; i >= 0; i--) { const k = todayKey(now - i * DAY); days.push({ k, n: state.log[k] || 0 }); }
  const max = Math.max(1, ...days.map(d => d.n));
  days.forEach(d => {
    const b = el('div', { class: 'bar', 'data-n': d.n, style: 'height:' + Math.max(3, Math.round(d.n / max * 100)) + '%' },
      [el('span', { class: 'bar__tip', text: d.k.slice(5).replace('-', '/') + ': ' + d.n + ' lượt' })]);
    chart.appendChild(b);
  });

  const tot = Math.max(1, state.words.length);
  const brk = $('#statBreak'); brk.innerHTML = '';
  brk.appendChild(el('div', { class: 'brk' }, [
    el('div', { style: 'width:' + (rv / tot * 100) + '%;background:var(--jade)' }),
    el('div', { style: 'width:' + (lr / tot * 100) + '%;background:var(--gold)' }),
    el('div', { style: 'width:' + (nw / tot * 100) + '%;background:var(--faint);opacity:.4' })
  ]));
  brk.appendChild(el('div', { class: 'brklegend', html:
    '<span><i style="background:var(--jade)"></i>Đã thuộc ' + rv + '</span>' +
    '<span><i style="background:var(--gold)"></i>Đang học ' + lr + '</span>' +
    '<span><i style="background:var(--faint);opacity:.4"></i>Chưa học ' + nw + '</span>' }));
}

/* ═══ 11. MÀN CÀI ĐẶT & KHAI BÁO CỘT ════════════════════════════ */

let lastTable = null, lastLookupTable = null;

function fillLookupSelects(cols) {
  const lk = state.cfg.lookup;
  [['#lkKey', 'key', lk.keyCol], ['#lkVar', 'var', lk.varCol], ['#lkVal', 'val', lk.valCol]].forEach(x => {
    const sel = $(x[0]);
    sel.innerHTML = '';
    if (x[1] === 'var') sel.appendChild(el('option', { value: '', text: '— không dùng —' }));
    cols.forEach(c => sel.appendChild(el('option', { value: c, text: c })));
    let want = x[2];
    if (!want || cols.indexOf(want) < 0) {
      want = '';
      LOOKUP_HINTS[x[1]].forEach(h => {
        if (want) return;
        const m = cols.find(c => noAccent(c).indexOf(noAccent(h)) > -1);
        if (m) want = m;
      });
    }
    sel.value = want || (x[1] === 'var' ? '' : cols[0] || '');
  });
  $('#lkCols').hidden = false;
}
async function readLookupCols() {
  const st = $('#lookupStatus');
  const tab = $('#lkTab').value.trim();
  if (!state.cfg.sheetId) { setStatus(st, 'Khai báo nguồn dữ liệu ở mục 1 trước đã.', 'err'); return; }
  if (!tab) { setStatus(st, 'Chưa nhập tên tab bảng tra.', 'err'); return; }
  setStatus(st, 'Đang đọc tab "' + tab + '"…', 'info');
  try {
    const t = await readSheet(state.cfg.sheetId, tab, '');
    lastLookupTable = t;
    fillLookupSelects(t.cols);
    setStatus(st, 'Tab "' + tab + '" có ' + t.cols.length + ' cột, ' + t.rows.length + ' dòng. Chọn cột rồi bấm Lưu.', 'ok');
  } catch (e) {
    setStatus(st, 'Lỗi: ' + e.message, 'err');
  }
}
async function saveLookup() {
  const st = $('#lookupStatus');
  state.cfg.lookup = {
    tab: $('#lkTab').value.trim(),
    keyCol: $('#lkKey').value,
    varCol: $('#lkVar').value,
    valCol: $('#lkVal').value
  };
  saveCfg();
  setStatus(st, 'Đang dựng bảng tra…', 'info');
  try {
    const r = await loadLookup(true);
    if (!r) { setStatus(st, 'Thiếu thông tin, chưa dựng được bảng tra.', 'err'); return; }
    const missKeys = Object.keys(r.miss).sort((a, b) => r.miss[b] - r.miss[a]);
    let msg = 'Tra được ' + r.chars + ' bộ thủ thành ' + r.groups + ' phân loại. Gộp được ' +
              r.hit + '/' + r.total + ' từ.';
    if (missKeys.length) {
      msg += ' Chưa có trong bảng tra (' + (r.total - r.hit) + ' từ): ' + missKeys.slice(0, 15).join(', ') +
             '. Thêm các bộ thủ này vào tab "' + state.cfg.lookup.tab + '" là gộp nốt.';
    }
    setStatus(st, msg, missKeys.length ? 'info' : 'ok');
    state.meta.groupBy = LOOKUP_COL; LS.set(K.meta, state.meta);
    $('#groupBy').innerHTML = '';
    renderKho();
  } catch (e) {
    setStatus(st, 'Lỗi: ' + e.message, 'err');
  }
}

function fillSettings() {
  const c = state.cfg;
  $('#cfgUrl').value = c.sheetUrl || '';
  $('#cfgTab').value = c.tab || '';
  $('#cfgWebApp').value = c.webApp || '';
  $('#cfgNew').value = c.settings.newPerDay;
  $('#cfgMaxRev').value = c.settings.maxReview;
  $('#cfgMinGroup').value = c.settings.minGroup || 0;
  $('#cfgTts').value = c.settings.tts || 'auto';
  $('#lkTab').value = c.lookup.tab || '';
  fillVoiceSelect();
  if (state.rads.length) {
    setStatus($('#lookupStatus'),
      'Đã tìm thấy ' + state.rads.length + ' bộ thủ ngay trong bảng chính (các dòng có Chủ đề = "Bộ thủ") — không cần khai báo bảng tra ở đây.', 'ok');
  }
  if (c.cols && c.cols.length) { lastTable = lastTable || { cols: c.cols, rows: [] }; renderMapRows(c.cols, c.map); $('#panelMap').hidden = false; }
}
function fillVoiceSelect() {
  const sel = $('#cfgVoice'); if (!sel) return;
  const zh = zhVoices();
  sel.innerHTML = '';
  sel.appendChild(el('option', { value: '', text: zh.length ? 'Tự chọn giọng tiếng Trung' : 'Máy chưa có giọng tiếng Trung' }));
  zh.forEach(v => sel.appendChild(el('option', { value: v.voiceURI, text: v.name + ' (' + v.lang + ')' })));
  sel.value = state.cfg.settings.voice || '';
  sel.onchange = () => { state.cfg.settings.voice = sel.value; saveCfg(); };
  const st = $('#voiceStatus');
  if (!zh.length) setStatus(st, 'Chưa tìm thấy giọng tiếng Trung trên máy. Windows: Cài đặt → Thời gian & ngôn ngữ → Ngôn ngữ → Thêm 中文(简体) kèm gói giọng nói. Trong lúc chờ, app dùng giọng dự phòng qua mạng.', 'info');
  else setStatus(st, 'Tìm thấy ' + zh.length + ' giọng tiếng Trung.', 'ok');
}
function fillTabList(tabs) {
  const dl = $('#tabList'); if (!dl) return;
  dl.innerHTML = '';
  tabs.filter(t => t !== 'Progress' && t !== '_config')
      .forEach(t => dl.appendChild(el('option', { value: t })));
}
function setStatus(node, msg, kind) {
  node.className = 'status is-on ' + (kind || 'info');
  node.textContent = msg;
}
function guessMap(cols, taken) {
  const map = {}, used = {};
  (taken || []).forEach(c => used[c] = 1);
  FIELDS.forEach(f => {
    let best = null, bestScore = 0;
    cols.forEach(c => {
      if (used[c]) return;
      const n = noAccent(c);
      let sc = 0;
      f.hints.forEach(h => { const nh = noAccent(h); if (n === nh) sc = Math.max(sc, 3); else if (n.indexOf(nh) > -1) sc = Math.max(sc, 2); });
      if (sc > bestScore) { bestScore = sc; best = c; }
    });
    if (best) { map[f.key] = best; used[best] = 1; }
  });
  return map;
}
function renderMapRows(cols, map) {
  const box = $('#mapRows'); box.innerHTML = '';
  FIELDS.forEach(f => {
    const sel = el('select', { 'data-key': f.key });
    sel.appendChild(el('option', { value: '', text: '— không dùng —' }));
    cols.forEach(c => sel.appendChild(el('option', { value: c, text: c })));
    sel.value = map[f.key] || '';
    const row = el('div', { class: 'maprow' + (f.req && !sel.value ? ' maprow--miss' : '') }, [
      el('div', { class: 'maprow__lbl', html: esc(f.label) + (f.req ? ' <i>*</i>' : '') }), sel
    ]);
    sel.onchange = () => row.classList.toggle('maprow--miss', !!f.req && !sel.value);
    box.appendChild(row);
  });
  renderColList(cols, map);
  const gp = $('#groupPick'); gp.innerHTML = '';
  const chosen = new Set(state.cfg.groupBy || []);
  cols.forEach(c => {
    if (/^id$/i.test(c.trim())) return;
    const ch = el('button', { class: 'chip' + (chosen.has(c) ? ' is-on' : ''), text: c, 'data-col': c });
    ch.onclick = () => ch.classList.toggle('is-on');
    gp.appendChild(ch);
  });
}
/* Liệt kê MỌI cột trong Sheet kèm việc app đang dùng nó làm gì.
   Mục ghép cột phía trên chỉ có 12 dòng nên không thấy hết được. */
function renderColList(cols, map) {
  const box = $('#colList');
  if (!box) return;
  box.innerHTML = '';
  const used = {};
  Object.keys(map || {}).forEach(k => { if (map[k]) used[map[k]] = k; });
  const groups = state.cfg.groupBy || [];
  const sample = state.words[0] || state.rads[0] || null;

  cols.filter(Boolean).forEach(c => {
    const fk = used[c];
    const fd = fk && FIELDS.find(f => f.key === fk);
    const isGrp = groups.indexOf(c) > -1;
    const isId = /^id$/i.test(c.trim());
    // các cột được kho Bộ thủ dùng (tên bộ, số nét, biến thể, mẹo nhớ, ô ghi chú)
    const radUse = Object.keys(state.radCols || {}).some(k => state.radCols[k] === c);
    const tags = [];
    if (isId) tags.push(el('span', { class: 'colrow__use use-map', text: 'khoá nối tiến độ' }));
    if (fd) tags.push(el('span', { class: 'colrow__use use-map', text: '→ ' + fd.label }));
    if (isGrp) tags.push(el('span', { class: 'colrow__use use-grp', text: 'nhóm được' }));
    if (radUse && !fd) tags.push(el('span', { class: 'colrow__use use-grp', text: 'dùng cho kho Bộ thủ' }));
    if (!tags.length) tags.push(el('span', { class: 'colrow__use use-none', text: 'chỉ hiện ở chi tiết' }));
    const ex = sample ? String(sample.raw[c] || '').replace(/\s+/g, ' ').trim() : '';
    box.appendChild(el('div', { class: 'colrow' }, [
      el('span', { class: 'colrow__name', text: c })
    ].concat(tags).concat(ex ? [el('span', { class: 'colrow__ex', text: 'vd: ' + ex.slice(0, 90) })] : [])));
  });
  const t = $('#colListTitle');
  if (t) t.textContent = 'Tất cả cột trong Sheet (' + cols.filter(Boolean).length + ')';
}

async function readCols() {
  const url = $('#cfgUrl').value.trim();
  const id = parseSheetId(url);
  const st = $('#colsStatus');
  if (!id) { setStatus(st, 'Link không hợp lệ. Dán nguyên link trên thanh địa chỉ khi đang mở Sheet.', 'err'); return; }
  setStatus(st, 'Đang đọc Sheet…', 'info');
  try {
    const gid = parseGid(url);
    const t = await readSheet(id, $('#cfgTab').value.trim(), gid);
    lastTable = t;
    state.cfg.sheetUrl = url; state.cfg.sheetId = id;
    state.cfg.tab = $('#cfgTab').value.trim(); state.cfg.gid = gid;
    const map = (state.cfg.map && Object.keys(state.cfg.map).length && state.cfg.cols.join() === t.cols.join())
      ? state.cfg.map : guessMap(t.cols);
    if (!state.cfg.groupBy || !state.cfg.groupBy.length) {
      state.cfg.groupBy = [map.chuDe, map.hsk, map.boThu].filter(Boolean);
    }
    state.cfg.cols = t.cols; saveCfg();
    renderMapRows(t.cols, map);
    $('#panelMap').hidden = false;
    setStatus(st, 'Đọc được ' + t.cols.length + ' cột, ' + t.rows.length + ' dòng. Kiểm tra phần khai báo bên dưới rồi bấm Lưu.', 'ok');
    $('#panelMap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    setStatus(st, 'Lỗi: ' + e.message, 'err');
  }
}
async function saveMapping() {
  const map = {};
  $$('#mapRows select').forEach(s => { if (s.value) map[s.getAttribute('data-key')] = s.value; });
  const miss = FIELDS.filter(f => f.req && !map[f.key]);
  if (miss.length) { toast('Còn thiếu: ' + miss.map(f => f.label).join(', '), 'err'); return; }
  state.cfg.map = map;
  state.cfg.groupBy = $$('#groupPick .chip.is-on').map(c => c.getAttribute('data-col'));
  // khai báo mới → quay về nhóm theo cột đầu tiên vừa chọn
  state.meta.groupBy = state.cfg.groupBy[0] || '';
  LS.set(K.meta, state.meta);
  $('#groupBy').innerHTML = '';
  saveCfg();
  if (hasWrite()) { try { await callApi('saveConfig', { cfg: exportCfg() }); } catch (e) {} }
  await doSync(true);
  go('kho');
}
function exportCfg() {
  const c = JSON.parse(JSON.stringify(state.cfg));
  return c;
}
function shareLink() {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(exportCfg()))));
  const url = location.href.split('#')[0] + '#cfg=' + payload;
  navigator.clipboard ? navigator.clipboard.writeText(url).then(
    () => toast('Đã copy link — dán sang điện thoại là dùng được ngay', 'ok'),
    () => prompt('Copy link này:', url)
  ) : prompt('Copy link này:', url);
}
function readHashCfg() {
  const m = location.hash.match(/cfg=([^&]+)/);
  if (!m) return false;
  try {
    const c = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    state.cfg = Object.assign({}, DEFAULT_CFG, c);
    state.cfg.settings = Object.assign({}, DEFAULT_CFG.settings, c.settings || {});
    saveCfg();
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch (e) { return false; }
}
function exportBackup() {
  const data = { v: 1, at: new Date().toISOString(), cfg: state.cfg, prog: state.prog, log: state.log };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'kho-tu-hsk-' + todayKey() + '.json' });
  document.body.appendChild(a); a.click(); a.remove();
}
function importBackup(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (d.cfg) { state.cfg = Object.assign({}, DEFAULT_CFG, d.cfg); state.cfg.settings = Object.assign({}, DEFAULT_CFG.settings, d.cfg.settings || {}); saveCfg(); }
      if (d.prog) { state.prog = d.prog; saveProg(); }
      if (d.log) { state.log = d.log; saveLog(); }
      toast('Đã nhập sao lưu', 'ok');
      fillSettings(); doSync(true);
    } catch (e) { toast('File sao lưu không đọc được', 'err'); }
  };
  fr.readAsText(file);
}

/* Tiêu đề cột trong Sheet có thể bị đổi bất cứ lúc nào. Nếu cứ đồng bộ mù
   thì mọi trường thành rỗng và bản diff sẽ đòi xoá sạch kho. Hàm này dò lại
   những cột đã mất theo từ khoá; không cứu được thì báo lỗi chứ không ghi đè. */
function repairMap(cols) {
  const map = Object.assign({}, state.cfg.map);
  const lost = [];
  Object.keys(map).forEach(k => {
    if (map[k] && cols.indexOf(map[k]) < 0) { lost.push(k); delete map[k]; }
  });
  if (lost.length) {
    const taken = Object.keys(map).map(k => map[k]).filter(Boolean);
    const guess = guessMap(cols, taken);
    lost.forEach(k => { if (guess[k]) map[k] = guess[k]; });
  }
  const missing = FIELDS.filter(f => f.req && (!map[f.key] || cols.indexOf(map[f.key]) < 0));
  if (missing.length) return { ok: false, missing: missing.map(f => f.label), lost: lost };
  if (lost.length) {
    state.cfg.map = map; state.cfg.cols = cols; saveCfg();
    const fixed = lost.filter(k => map[k]);
    if (fixed.length) {
      const names = fixed.map(k => (FIELDS.find(f => f.key === k) || {}).label + ' → ' + map[k]);
      toast('Sheet đổi tên cột, đã tự khớp lại: ' + names.join(', '), 'ok');
    }
  }
  return { ok: true, lost: lost };
}

/* Bấm "Chuẩn hoá Sheet" xong thì id đổi từ khoá tạm (你|ni, r:大) sang mã
   trong Sheet (TV-001, BT-001). Tiến độ cũ đang gắn khoá tạm sẽ thành mồ côi,
   nên phải chuyển sang khoá mới một lần. Chạy im lặng, không đụng gì nếu
   không có gì để chuyển. */
function migrateProgIds(list) {
  let moved = 0;
  list.forEach(w => {
    if (state.prog[w.id]) return;                    // đã đúng khoá mới
    const old = w.isRad ? ('r:' + w.f.hanzi)
              : w.isPin ? null
              : (noAccent(w.f.hanzi) + '|' + noAccent(w.f.pinyin));
    if (!old || !state.prog[old]) return;
    const st = state.prog[old];
    delete state.prog[old];
    st.id = w.id;
    state.prog[w.id] = st;
    moved++;
  });
  if (moved) {
    saveProg();
    toast('Đã chuyển ' + moved + ' thẻ sang mã id mới của Sheet', 'ok');
  }
  return moved;
}

/* ═══ 12. ĐỒNG BỘ ═══════════════════════════════════════════════ */

async function doSync(silent) {
  if (!state.cfg.sheetId) { go('caidat'); if (!silent) toast('Chưa nối Google Sheet — khai báo ở mục 1', 'err'); return; }
  if (!state.cfg.map || !state.cfg.map.hanzi) { go('caidat'); if (!silent) toast('Chưa khai báo cột', 'err'); return; }
  const ico = $('#syncIco'); ico.classList.add('is-spin');
  try {
    await flushQueue(true);
    const t = await readSheet(state.cfg.sheetId, state.cfg.tab, state.cfg.gid);
    const fix = repairMap(t.cols);
    if (!fix.ok) {
      toast('Sheet đã đổi cấu trúc, không tìm thấy cột: ' + fix.missing.join(', ') + '. Khai báo lại ở Cài đặt.', 'err');
      go('caidat');
      return;
    }
    state.cfg.cols = t.cols; saveCfg();
    const split = splitTable(t, state.cfg.map);
    const fresh = split.words;
    const d = diffWords(state.demo ? [] : state.words, fresh);

    // chụp lại kho trước khi thay để biết lần này thêm những gì
    const before = {};
    const hadStore = !state.demo && (state.words.length > 0 || state.rads.length > 0);
    if (hadStore) {
      state.words.forEach(w => before[w.id] = 1);
      state.rads.forEach(r => before[r.id] = 1);
    }

    if (hasWrite()) { try { await pullProgress(); } catch (e) {} }
    // bộ thủ nằm ngay trong bảng chính; chỉ khi không có mới đi tìm ở tab riêng
    try { await loadLessons(true); } catch (e) { /* thiếu tab thì bỏ qua */ }
    if (split.rads.length) applyRads(split.rads);
    else if (state.cfg.lookup.tab) { try { state.words = fresh; await loadLookup(true); } catch (e) {} }

    const apply = () => {
      state.words = fresh; state.demo = false;
      refreshPinyin();
      migrateProgIds(state.words.concat(state.rads));
      state.meta.syncAt = Date.now();
      // Lần đồng bộ đầu (kho đang trống) thì cái gì cũng là "mới", ghi lại vô nghĩa.
      // Lần nào không thêm gì thì giữ nguyên mẻ trước cho còn cái mà xem.
      if (hadStore) {
        const added = state.words.concat(state.rads).filter(x => !before[x.id]).map(x => x.id);
        if (added.length) { state.meta.lastAdded = added; state.meta.lastAddedAt = Date.now(); }
      }
      LS.set(K.meta, state.meta);
      saveWords();
      renderKho(); paintDueDot();
      toast('Đã đồng bộ ' + fresh.length + ' từ' + (state.rads.length ? ' và ' + state.rads.length + ' bộ thủ' : ''), 'ok');
    };
    if (silent || (!d.added.length && !d.changed.length && !d.removed.length)) {
      apply();
      if (!silent) toast('Kho đã là mới nhất', 'ok');
    } else {
      showDiff(d, apply);
    }
  } catch (e) {
    toast('Đồng bộ hỏng: ' + e.message, 'err');
  } finally {
    ico.classList.remove('is-spin');
  }
}
function showDiff(d, onOk) {
  const sum = el('div', { class: 'diffsum' }, [
    d.added.length ? el('span', { class: 'tag tag--add', text: '+' + d.added.length + ' thêm' }) : null,
    d.changed.length ? el('span', { class: 'tag tag--edit', text: '~' + d.changed.length + ' sửa' }) : null,
    d.removed.length ? el('span', { class: 'tag tag--del', text: '−' + d.removed.length + ' xoá' }) : null
  ].filter(Boolean));
  const list = el('div', { class: 'difflist' });
  const push = (arr, cls, lbl) => arr.slice(0, 200).forEach(w => {
    const st = state.prog[w.id];
    const hasProg = cls === 'del' && st && st.reps;
    list.appendChild(el('div', { class: 'diffrow' }, [
      el('span', { class: 'tag tag--' + cls, text: lbl }),
      el('span', { class: 'han', text: w.f.hanzi }),
      el('span', { text: w.f.pinyin }),
      el('span', { style: 'color:var(--muted)', text: meaningOnly(w.f.nghiaViet) }),
      hasProg ? el('span', { class: 'tag tag--edit', style: 'margin-left:auto',
                             text: 'đã ôn ' + st.reps + ' lần' }) : null
    ]));
  });
  push(d.added, 'add', 'THÊM'); push(d.changed, 'edit', 'SỬA'); push(d.removed, 'del', 'XOÁ');

  const body = el('div', {}, [
    el('p', { text: 'Google Sheet có thay đổi so với kho trên máy:' }), sum, list,
    d.removed.length ? el('p', { class: 'hint', text:
      'Từ bị xoá khỏi Sheet sẽ biến khỏi kho. Lịch sử ôn của chúng vẫn nằm nguyên ở tab "Nhật ký học", '
      + 'và mã id đã cấp sẽ không bao giờ dùng lại cho từ khác.' }) : null
  ].filter(Boolean));
  let close;
  close = modalShell('Xem trước thay đổi', body, [
    el('button', { class: 'btn', text: 'Không áp dụng', onclick: () => close() }),
    el('button', { class: 'btn btn--primary', text: 'Áp dụng', onclick: () => { close(); onOk(); } })
  ]).close;
}
/* Kéo tiến độ từ Sheet về, bản nào ôn gần đây hơn thì thắng */
async function pullProgress() {
  const r = await callApi('getProgress', {});
  (r.rows || []).forEach(row => {
    const mine = state.prog[row.id];
    if (!mine || (row.last || 0) > (mine.last || 0)) state.prog[row.id] = row;
  });
  saveProg();
}

/* Trình duyệt trên điện thoại giữ cache khá dai; sau khi bạn đưa bản mới lên
   máy chủ nó vẫn chạy bản cũ. Hỏi version.json (kèm tham số chống cache) để
   biết có bản mới không, rồi tải lại kèm dấu thời gian cho chắc chắn sạch. */
async function checkUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (!j || !j.v || String(j.v) === APP_VER) return;
    const b = $('#btnUpdate');
    if (b) { b.hidden = false; b.title = 'Bản trên máy chủ: ' + j.v + ' · đang chạy: ' + APP_VER; }
  } catch (e) { /* chạy bằng file:// hoặc mất mạng thì thôi */ }
}
function doUpdate() {
  const u = location.pathname + '?u=' + Date.now();
  location.replace(u);
}

/* ═══ 13. KHỞI ĐỘNG ═════════════════════════════════════════════ */

function bind() {
  $('#btnSync').onclick = () => { doSync(false); checkUpdate(); };
  $('#btnUpdate').onclick = doUpdate;

  const reKho = debounce(renderKho, 180);
  const setSearch = open => {
    $('.search').classList.toggle('is-min', !open);
    if (open) setTimeout(() => $('#q').focus(), 60);
  };
  const clearSearch = () => {
    $('#q').value = ''; $('#qClear').hidden = true; renderKho(); setSearch(false);
  };
  setSearch(false);
  $('#qOpen').onclick = () => setSearch(true);
  $('#q').oninput = () => { $('#qClear').hidden = !$('#q').value; reKho(); };
  $('#q').onblur = () => { if (!$('#q').value.trim()) setSearch(false); };
  $('#q').onkeydown = e => { if (e.key === 'Escape') clearSearch(); };
  $('#qClear').onclick = clearSearch;
  $('#groupBy').onchange = () => {
    state.meta.groupBy = $('#groupBy').value;
    LS.set(K.meta, state.meta);
    renderKho();
  };
  $('#filterState').onchange = renderKho;
  $('#btnAdd').onclick = () => openWordForm(null);
  $$('.seg__btn').forEach(b => b.onclick = () => {
    stopSpeak();
    state.mode = b.getAttribute('data-mode');
    saveMode();
    $('#groupBy').innerHTML = '';
    delete state.meta.groupBy;
    renderKho();
  });

  $('#btnStart').onclick = startSession;
  $('#btnFlip').onclick = flipCard;
  $('#card').onclick = () => {
    if (!state.sess) return;
    if (!state.sess.flipped) flipCard();
    else if (state.sess._dir === 'a2m') speak(spkText(curWord()), curWord().f.audio);
  };
  $('#btnQuit').onclick = quitSession;
  $('#btnBackDeck').onclick = renderHocSetup;

  $('#btnReadCols').onclick = readCols;
  $('#btnReadLookup').onclick = readLookupCols;
  $('#btnSaveLookup').onclick = saveLookup;
  $('#cfgMinGroup').onchange = () => {
    state.cfg.settings.minGroup = Math.max(0, +$('#cfgMinGroup').value || 0);
    saveCfg(); renderKho();
  };
  $('#btnSaveMap').onclick = saveMapping;
  $('#cfgWebApp').onchange = () => { state.cfg.webApp = $('#cfgWebApp').value.trim(); saveCfg(); };
  $('#cfgNew').onchange = () => { state.cfg.settings.newPerDay = +$('#cfgNew').value || 0; saveCfg(); };
  $('#cfgMaxRev').onchange = () => { state.cfg.settings.maxReview = +$('#cfgMaxRev').value || 120; saveCfg(); };
  $('#btnTestVoice').onclick = () => { voiceWarned = false; speak('你好'); };
  $('#btnAudioCheck').onclick = audioCheck;
  $('#cfgTts').onchange = () => { state.cfg.settings.tts = $('#cfgTts').value; saveCfg(); voiceWarned = false; };

  $('#btnPing').onclick = async () => {
    state.cfg.webApp = $('#cfgWebApp').value.trim(); saveCfg();
    const st = $('#webAppStatus');
    setStatus(st, 'Đang gọi Web App…', 'info');
    try {
      const r = await callApi('ping', {});
      fillTabList(r.tabs || []);
      setStatus(st, 'Kết nối tốt. Sheet "' + (r.title || '?') + '". Bấm vào ô Tên tab ở mục 1 để chọn: ' + (r.tabs || []).join(' · '), 'ok');
      flushQueue(false);
    } catch (e) {
      setStatus(st, 'Không gọi được: ' + e.message + '. Kiểm tra lại bước Deploy (Execute as: Me · Who has access: Anyone) và dán đúng link kết thúc bằng /exec.', 'err');
    }
  };
  $('#btnPushAll').onclick = async () => {
    const st = $('#webAppStatus');
    if (!hasWrite()) { setStatus(st, 'Chưa có Web App URL.', 'err'); return; }
    const ids = Object.keys(state.prog);
    if (!ids.length) { setStatus(st, 'Chưa có tiến độ nào để đẩy.', 'info'); return; }
    setStatus(st, 'Đang đẩy ' + ids.length + ' thẻ lên Sheet…', 'info');
    try {
      const rows = ids.map(id => {
        const s2 = state.prog[id];
        return s2 ? progRow(findItem(id), s2) : null;
      }).filter(Boolean);
      // chia mẻ 60 dòng cho khỏi quá tải một lần gọi
      for (let i = 0; i < rows.length; i += 60) {
        await callApi('saveProgress', { rows: rows.slice(i, i + 60) });
      }
      setStatus(st, 'Xong: đã ghi ' + rows.length + ' dòng vào tab "Tiến độ".', 'ok');
    } catch (e) {
      setStatus(st, 'Lỗi: ' + e.message, 'err');
    }
  };
  $('#btnEnsure').onclick = async () => {
    const st = $('#webAppStatus');
    confirmBox('Chuẩn hoá Sheet?', 'App sẽ thêm cột "id" vào bảng từ vựng (nếu chưa có) và tạo 2 tab phụ "Progress", "_config". Dữ liệu hiện có không bị đụng vào.', 'Làm luôn', async () => {
      setStatus(st, 'Đang chuẩn hoá…', 'info');
      try {
        const r = await callApi('ensureSchema', {});
        setStatus(st, 'Xong: ' + (r.msg || 'đã chuẩn hoá'), 'ok');
        doSync(true);
      } catch (e) { setStatus(st, 'Lỗi: ' + e.message, 'err'); }
    });
  };

  $('#btnCopyLink').onclick = shareLink;
  $('#btnExport').onclick = exportBackup;
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; };
  $('#btnResetProg').onclick = () => confirmBox('Xoá tiến độ học?', 'Toàn bộ lịch ôn trên thiết bị này sẽ về 0. Kho từ và Google Sheet không bị ảnh hưởng.', 'Xoá', () => {
    state.prog = {}; state.log = {}; saveProg(); saveLog(); toast('Đã xoá tiến độ', 'ok'); paintDueDot();
  }, true);
  $('#btnResetAll').onclick = () => confirmBox('Xoá sạch trên thiết bị này?', 'Xoá cấu hình, kho đã tải và tiến độ. Google Sheet của bạn vẫn nguyên vẹn.', 'Xoá sạch', () => {
    [K.cfg, K.words, K.prog, K.log, K.queue, K.meta, K.lookup, K.rads, K.lessons].forEach(LS.del);
    location.reload();
  }, true);

  document.addEventListener('keydown', e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || ''))) return;
    if (state.view !== 'hoc' || !state.sess) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); state.sess.flipped ? rate(3) : flipCard(); }
    else if (state.sess.flipped && '1234'.indexOf(e.key) > -1) { e.preventDefault(); rate(+e.key); }
    else if (e.key.toLowerCase() === 's') { const w = curWord(); if (w) speak(spkText(w), w.f.audio); }
  });

  window.addEventListener('online', () => flushQueue(false));
  window.addEventListener('beforeunload', () => { if (Object.keys(progDirty).length) pushProgressNow(); });
}

function init() {
  loadState();
  readHashCfg() && loadStateAfterHash();
  buildNav();
  paintIcons();
  bind();
  watchVoices();
  refreshPinyin();
  paintQueueBadge();
  go(state.cfg.sheetId ? 'kho' : (state.demo ? 'kho' : 'caidat'));
  paintDueDot();
  checkUpdate();
  if (state.cfg.sheetId && state.cfg.map && state.cfg.map.hanzi) {
    doSync(true);
    flushQueue(true);
  }
}
function loadStateAfterHash() {
  state.words = []; state.demo = false;
  LS.del(K.words);
}

document.addEventListener('DOMContentLoaded', init);
})();
