(function () {
  "use strict";

  const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi)(\?|$)/i;

  const MODAL_SELECTORS = [
    '[role="dialog"]',
    ".ant-modal-content",
    ".ant-drawer-content-wrapper",
    ".ant-drawer-body",
    ".ant-drawer-content",
    '[class*="modal"][class*="content"]',
    '[class*="Modal"]',
    '[class*="dialog-preview"]',
    '[class*="DialogPreview"]',
    '[class*="workitem-detail"]',
    '[class*="WorkitemDetail"]',
    '[class*="story-detail"]',
    '[class*="bug-detail"]',
    '[class*="preview-panel"]',
    '[class*="PreviewDrawer"]',
    '[class*="detail-drawer"]',
    '[class*="DetailDrawer"]',
    '[class*="wic-"]',
    '[data-testid*="preview"]',
    '[data-testid*="detail"]',
  ];

  /** 富文本/说明正文（不参与「整表单最长 innerText」竞争） */
  const BODY_SELECTORS = [
    ".ProseMirror",
    ".tiptap",
    '[class*="rich-text"]',
    '[class*="RichText"]',
    '[class*="html-content"]',
    '[class*="HtmlContent"]',
    '[class*="description"]',
    '[class*="Description"]',
    '[class*="detail-content"]',
    '[class*="DetailContent"]',
    '[class*="remark"]',
    '[class*="Remark"]',
    '[class*="markdown-body"]',
    "article",
  ];

  const DESCRIPTION_SELECTORS = BODY_SELECTORS.concat([
    '[class*="content-body"]',
    '[class*="main-content"]',
  ]);

  const TAB_PANEL_SELECTORS = [
    '[role="tabpanel"]:not([hidden])',
    ".ant-tabs-tabpane-active",
    '[class*="tab-pane-active"]',
    '[class*="TabPane"][class*="active"]',
  ];

  const TITLE_SELECTORS = [
    '[class*="workitem-title"]',
    '[class*="WorkitemTitle"]',
    '[class*="title-text"]',
    '[class*="TitleText"]',
    '[class*="preview-title"]',
    '[class*="name-field"]',
    "h1",
    "h2",
  ];

  /** 整行可丢弃的 TAPD UI 文案（精确匹配，trim 后） */
  const NOISE_LINE_EXACT = new Set([
    "详细信息",
    "变更历史",
    "更多",
    "编辑",
    "标签",
    "附件",
    "评论",
    "工作流",
    "查看流程图",
    "基础信息",
    "状态",
    "创建模板",
    "系统默认模板",
    "发现版本",
    "模块",
    "优先级",
    "严重程度",
    "处理人",
    "创建人",
    "创建时间",
    "修复人",
    "解决方法",
    "插入",
    "正文",
    "流转",
    "苹果苹方",
    "STORY",
    "BUG",
    "需求",
    "缺陷",
    "新",
    "高",
    "中",
    "低",
    "紧急",
    "评论",
    "子需求",
    "父需求",
    "分类",
    "未分类",
    "迭代",
    "预计开始",
    "预计结束",
    "实际开始",
    "实际结束",
    "完成时间",
    "开始时间",
    "结束时间",
    "发布计划",
    "规模",
    "工时",
    "故事点",
    "需求类型",
    "来源",
    "版本",
    "负责人",
    "抄送人",
    "参与者",
    "待启动",
    "规划中",
    "开发中",
    "测试中",
    "评审中",
    "已完成",
    "已关闭",
    "已取消",
    "已暂停",
    "新建",
    "TEC",
  ]);

  const NOISE_LINE_RE =
    /^(接受\/处理|已拒绝|当前|查看流程图|系统默认|\d+px)$/i;

  /** 用于下载目录名：dialog_preview_id 或从详情页路径解析 story_/bug_<数字> */
  function getExportWorkItemId() {
    const q = new URLSearchParams(window.location.search);
    const fromQuery = (q.get("dialog_preview_id") || "").trim();
    if (
      fromQuery &&
      (fromQuery.startsWith("story_") || fromQuery.startsWith("bug_"))
    ) {
      return fromQuery;
    }
    const m = window.location.pathname.match(/\/(story|bug)\/detail\/(\d+)/i);
    if (m) {
      return `${m[1].toLowerCase()}_${m[2]}`;
    }
    return "";
  }

  function isStandaloneDetailPage() {
    return /\/(story|bug)\/detail\/\d+/i.test(window.location.pathname);
  }

  /** 弹窗预览用弹层；独立详情页用主内容区或 body，避免无弹窗时不显示按钮 */
  function findExportRootContainer() {
    const modal = findModalRoot();
    if (modal) return modal;
    if (isStandaloneDetailPage()) {
      const main = document.querySelector(
        "main, [class*='detail-layout'], [class*='DetailLayout'], [class*='page-content'], [class*='PageContent'], #root > div"
      );
      return main || document.body;
    }
    return null;
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0)
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function walkElements(root, visit) {
    if (!root) return;
    visit(root);
    const children = root.children;
    for (let i = 0; i < children.length; i++) walkElements(children[i], visit);
    const sr = root.shadowRoot;
    if (sr) walkElements(sr, visit);
  }

  function findModalRoot() {
    for (const sel of MODAL_SELECTORS) {
      const nodes = document.querySelectorAll(sel);
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (isVisible(el)) return el;
      }
    }
    const bodyChildren = document.body ? Array.from(document.body.children) : [];
    let best = null;
    let bestArea = 0;
    for (const el of bodyChildren) {
      if (!isVisible(el)) continue;
      const st = window.getComputedStyle(el);
      if (st.position !== "fixed" && st.position !== "absolute") continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && area > window.innerWidth * window.innerHeight * 0.2) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  function findPrimaryScope(container) {
    const candidates = [];
    for (const sel of TAB_PANEL_SELECTORS) {
      try {
        const nodes = container.querySelectorAll(sel);
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          if (!isVisible(el)) continue;
          candidates.push(el);
        }
      } catch (_) {}
    }
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const hasEditor = el.querySelector(
        ".ProseMirror, .tiptap, [class*='rich-text'], [class*='RichText']"
      );
      const len = (el.innerText || "").trim().length;
      const score = (hasEditor ? 200000 : 0) + Math.min(len, 80000);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best && bestScore > 50) return best;
    return container;
  }

  function extractTitle(container) {
    for (const sel of TITLE_SELECTORS) {
      let nodes;
      try {
        nodes = container.querySelectorAll(sel);
      } catch (_) {
        continue;
      }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!isVisible(n)) continue;
        const line = (n.innerText || "").trim().split(/\r?\n/)[0] || "";
        if (line.length < 4 || line.length > 800) continue;
        if (NOISE_LINE_EXACT.has(line)) continue;
        if (NOISE_LINE_RE.test(line)) continue;
        if (isNoiseLine(line)) continue;
        if (/^BUG$|^STORY$|^需求$/i.test(line)) continue;
        return line;
      }
    }
    return "";
  }

  function scoreBodyCandidate(el, text) {
    const t = (text || "").trim();
    if (t.length < 1 || t.length >= 120000) return -1;
    let score = Math.min(t.length, 60000);
    if (el.closest?.("[class*='comment'], [class*='Comment'], [class*='reply']")) score -= 500000;
    if (el.closest?.("[class*='description'], [class*='Description']")) score += 80000;
    if (el.closest?.("[class*='detail'], [class*='Detail'], [class*='field']")) score += 20000;
    if (t.length < 20 && /输入评论|请输入|ctrl\s*\+\s*enter/.test(t)) score -= 400000;
    const inDescTable = el.closest?.(
      ".ant-descriptions, [class*='ant-descriptions'], [class*='Descriptions']"
    );
    const isRichEditor =
      el.matches?.(".ProseMirror, .tiptap") ||
      el.querySelector?.(".ProseMirror, .tiptap");
    if (inDescTable && !isRichEditor) {
      const lines = t.split(/\r?\n/).filter((x) => x.trim());
      if (lines.length > 6) score -= 400000;
    }
    return score;
  }

  function findBodyText(scope) {
    let best = "";
    let bestScore = -1;

    function consider(el, t) {
      const sc = scoreBodyCandidate(el, t);
      if (sc > bestScore) {
        bestScore = sc;
        best = t.trim();
      }
    }

    for (const sel of BODY_SELECTORS) {
      let nodes;
      try {
        nodes = scope.querySelectorAll(sel);
      } catch (_) {
        continue;
      }
      for (let i = 0; i < nodes.length; i++) {
        const found = nodes[i];
        if (!isVisible(found)) continue;
        consider(found, (found.innerText || "").trim());
      }
    }

    walkElements(scope, (el) => {
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT")
        return;
      if (!isVisible(el)) return;
      for (const sel of BODY_SELECTORS) {
        try {
          if (el.matches(sel)) {
            consider(el, (el.innerText || "").trim());
            break;
          }
        } catch (_) {}
      }
    });

    return best.trim();
  }

  function isNoiseLine(line) {
    const s = line.trim();
    if (!s) return true;
    if (NOISE_LINE_EXACT.has(s)) return true;
    if (NOISE_LINE_RE.test(s)) return true;
    if (/ctrl\s*\+\s*enter|@通知他人|输入评论，/.test(s)) return true;
    if (/^(BUG|STORY|需求)$/i.test(s)) return true;
    if (/^\d+$/.test(s)) return true;
    if (/^\(\d+\)$/.test(s)) return true;
    if (/^[^:]+:\s*$/.test(s)) return true;
    if (/^新\s*\(/.test(s)) return true;
    if (s.length < 40 && /工作流|查看流程图/.test(s)) return true;
    if (/^[\-–—‐\s]+$/.test(s)) return true;
    if (/^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(s)) return true;
    if (/^[\u4e00-\u9fff\w·.]{1,24};$/.test(s)) return true;
    if (/^系统默认模板[_\d]/.test(s)) return true;
    if (/^TEC$/i.test(s)) return true;
    if (/（当前迭代）/.test(s)) return true;
    if (/\(当前\)/.test(s) && /待启动|开发中|规划中|测试中|评审中|已完成/.test(s)) return true;
    if (/^[\-–—‐\s\d:]+$/.test(s) && s.length < 40) return true;
    return false;
  }

  /** 从整段文本中去掉侧栏/Tab/表单项标签等行，保留可读说明 */
  function sanitizeLines(text) {
    const lines = (text || "").split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      if (/^ID:\s*\d+$/i.test(raw)) continue;
      if (isNoiseLine(raw)) continue;
      out.push(raw);
    }
    return out.join("\n").trim();
  }

  function findWorkItemSummary(container) {
    let title = extractTitle(container);
    if (title && isNoiseLine(title)) title = "";
    const scope = findPrimaryScope(container);
    let body = findBodyText(scope);

    if (!body || body.length < 4) {
      let fallback = "";
      let fbScore = -1;
      for (const sel of DESCRIPTION_SELECTORS) {
        let nodes;
        try {
          nodes = scope.querySelectorAll(sel);
        } catch (_) {
          continue;
        }
        for (let i = 0; i < nodes.length; i++) {
          const found = nodes[i];
          if (!isVisible(found)) continue;
          const t = (found.innerText || "").trim();
          const sc = scoreBodyCandidate(found, t);
          if (sc > fbScore) {
            fbScore = sc;
            fallback = t;
          }
        }
      }
      body = fallback.trim();
    }

    if (!body || body === title) {
      body = sanitizeLines(scope.innerText || "");
    }

    body = sanitizeLines(body);

    if (title && body && body.startsWith(title)) {
      body = body.slice(title.length).trim();
    }

    const idLine = extractIdLine(container, scope);
    const parts = [];
    if (idLine) parts.push(idLine);
    if (title) parts.push(title);
    if (body) parts.push(body);
    let joined = parts.filter(Boolean).join("\n\n").trim();
    joined = dedupeIdAndClean(joined, idLine);
    if (!joined) {
      let rough = sanitizeLines(container.innerText || "");
      rough = dedupeIdAndClean(rough, idLine);
      joined =
        rough.length > 10000 ? rough.slice(0, 10000) + "\n…（内容过长已截断）" : rough;
    }
    return appendCommentSection(container, joined);
  }

  function extractIdLine(container, scope) {
    const text = `${container.innerText || ""}\n${scope.innerText || ""}`;
    const idm =
      text.match(/\bID:\s*(\d+)\b/i) ||
      text.match(/\b(?:单号|编号)[：:\s]*(\d{6,})\b/);
    return idm ? `ID: ${idm[1]}` : "";
  }

  function dedupeConsecutiveLines(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (out.length && out[out.length - 1] === lines[i]) continue;
      out.push(lines[i]);
    }
    return out;
  }

  /**
   * 在已有较长说明时，去掉单独成行的 2～4 字纯中文（多为创建人/处理人姓名），
   * 若短行含需求描述常见字则保留（如「删掉下」「看一下」）。
   */
  const SHORT_LINE_KEEP_HINT = /[删改建修查看试填加减说明图效闪界面需题能会的了吗吧呢着呀呗么嗯噢额蓝框色攻击血生命科研等级次数参数接口数据前后端错异按钮列表特效详情英雄网页端日志请求]/;

  function stripLikelyOrphanNameLines(lines) {
    const merged = lines.map((l) => l.trim()).filter(Boolean);
    const hasLong = merged.some((l) => l.length >= 10);
    if (!hasLong) return merged;
    return merged.filter((t) => {
      if (!/^[\u4e00-\u9fff·]{2,4}$/.test(t)) return true;
      if (SHORT_LINE_KEEP_HINT.test(t)) return true;
      return false;
    });
  }

  /** 去掉重复的 ID 行与仅含占位符的行 */
  function dedupeIdAndClean(text, idLine) {
    if (!text) return "";
    const idNum = idLine ? idLine.replace(/^ID:\s*/i, "").trim() : "";
    let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines = dedupeConsecutiveLines(lines);
    if (idNum) {
      const idPat = new RegExp(`^ID:\\s*${idNum}\\s*$`, "i");
      let seenId = false;
      lines = lines.filter((l) => {
        if (idPat.test(l)) {
          if (seenId) return false;
          seenId = true;
          return true;
        }
        return true;
      });
    }
    lines = lines.filter((l) => !isNoiseLine(l));
    lines = stripLikelyOrphanNameLines(lines);
    return lines.join("\n").trim();
  }

  function isCommentComposerRoot(el) {
    if (!el) return false;
    const ph = el.querySelector?.(
      "[placeholder], textarea[placeholder], [data-placeholder]"
    );
    if (ph) {
      const p = (
        ph.getAttribute("placeholder") ||
        ph.getAttribute("data-placeholder") ||
        ""
      ).trim();
      if (/评论|回复|输入|说点什么|@/i.test(p)) return true;
    }
    const t = (el.innerText || "").trim();
    if (t.length < 100 && /输入评论[,，]|@通知他人|ctrl\s*\+\s*enter/.test(t)) return true;
    return false;
  }

  function isImgInCommentBlock(img) {
    const c = img.closest?.(
      ".ant-comment, [class*='comment-list'], [class*='CommentList'], [class*='comment-item'], [class*='CommentItem'], [class*='reply-list'], [class*='ReplyList']"
    );
    return !!c;
  }

  /** 评论里的文字（不含底部输入框占位） */
  function extractCommentsSummary(container) {
    const chunks = [];
    const seen = new Set();

    function pushChunk(text) {
      const t = (text || "").trim();
      if (t.length < 2) return;
      if (t.length < 90 && /输入评论[,，]|@通知他人|ctrl\s*\+\s*enter/.test(t)) return;
      const h = t.slice(0, 160);
      if (seen.has(h)) return;
      seen.add(h);
      chunks.push(t);
    }

    let nodes;
    try {
      nodes = container.querySelectorAll(".ant-comment-content-detail");
    } catch (_) {
      nodes = [];
    }
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!isVisible(node)) continue;
      const item = node.closest(".ant-comment");
      if (item && isCommentComposerRoot(item)) continue;
      pushChunk(node.innerText || "");
    }

    if (chunks.length === 0) {
      const richSel =
        ".ant-comment .ProseMirror, .ant-comment .tiptap, [class*='comment-list'] .ProseMirror, [class*='CommentList'] .ProseMirror, [class*='comment-item'] .ProseMirror, [class*='CommentItem'] .ProseMirror, [class*='reply-list'] .ProseMirror, [class*='ReplyList'] .ProseMirror";
      try {
        nodes = container.querySelectorAll(richSel);
      } catch (_) {
        nodes = [];
      }
      for (let i = 0; i < nodes.length; i++) {
        const rich = nodes[i];
        if (!isVisible(rich)) continue;
        const root = rich.closest(
          ".ant-comment, [class*='comment-list'], [class*='CommentList'], [class*='comment-item'], [class*='CommentItem'], [class*='reply-list'], [class*='ReplyList']"
        );
        if (!root) continue;
        if (isCommentComposerRoot(root)) continue;
        pushChunk(rich.innerText || "");
      }
    }

    return chunks.join("\n\n---\n\n").trim();
  }

  function lightCleanCommentText(text) {
    const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = lines.filter((l) => !/^ctrl\s*\+\s*enter$/i.test(l));
    return dedupeConsecutiveLines(out).join("\n").trim();
  }

  function appendCommentSection(container, baseText) {
    const raw = extractCommentsSummary(container);
    if (!raw) return baseText || "";
    const polished = lightCleanCommentText(raw);
    if (!polished) return baseText || "";
    if (baseText && baseText.trim()) {
      return `${baseText.trim()}\n\n【评论】\n${polished}`;
    }
    return `【评论】\n${polished}`;
  }

  /** 先详情/说明区图片，再评论图片，各自去重 */
  function collectImageUrls(container) {
    const seenMain = new Set();
    const seenComment = new Set();
    const main = [];
    const comment = [];

    walkElements(container, (el) => {
      if (el.tagName !== "IMG") return;
      const ist = window.getComputedStyle(el);
      if (ist.display === "none" || ist.visibility === "hidden") return;
      let src = el.getAttribute("src") || el.src || "";
      src = (src || "").trim();
      if (!src || src.startsWith("data:")) return;
      if (VIDEO_EXT.test(src)) return;
      let parent = el.parentElement;
      while (parent) {
        if (parent.tagName === "VIDEO") return;
        parent = parent.parentElement;
      }
      let abs;
      try {
        abs = new URL(src, window.location.href).href;
      } catch (_) {
        return;
      }
      if (VIDEO_EXT.test(abs)) return;
      const key = abs.split("#")[0];
      const inComment = isImgInCommentBlock(el);
      const bucket = inComment ? seenComment : seenMain;
      const arr = inComment ? comment : main;
      if (bucket.has(key)) return;
      bucket.add(key);
      arr.push(abs);
    });

    return main.concat(comment);
  }

  function buildClipboardText(description, paths, failures) {
    const plist = Array.isArray(paths) ? paths : [];
    const flist = Array.isArray(failures) ? failures : [];
    const lines = [
      "【TAPD 需求/缺陷说明】",
      description || "（未抓取到说明文本，请手动补充）",
    ];
    const hasImages = plist.length > 0;
    const hasFails = flist.length > 0;
    if (hasImages) {
      lines.push("", "【本机图片路径】");
      plist.forEach((p) => lines.push(p));
    }
    if (hasFails) {
      lines.push("", "【下载失败】");
      flist.forEach((f) => lines.push(`${f.url} -> ${f.error}`));
    }
    return lines.join("\n");
  }

  function showToast(message, isError) {
    let toast = document.getElementById("tapd-export-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "tapd-export-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle("tapd-export-toast--error", !!isError);
    toast.classList.add("tapd-export-toast--visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("tapd-export-toast--visible");
    }, 4500);
  }

  function removeUi() {
    document.getElementById("tapd-export-root")?.remove();
  }

  function syncUi() {
    if (!getExportWorkItemId()) {
      removeUi();
      return;
    }
    if (!findExportRootContainer()) {
      removeUi();
      return;
    }
    ensureUi();
  }

  function ensureUi() {
    if (document.getElementById("tapd-export-root")) return;

    const root = document.createElement("div");
    root.id = "tapd-export-root";
    const btn = document.createElement("button");
    btn.id = "tapd-export-btn";
    btn.type = "button";
    btn.textContent = "一键转为需求单";
    root.appendChild(btn);
    document.documentElement.appendChild(root);

    btn.addEventListener("click", onExportClick);
  }

  async function onExportClick() {
    const btn = document.getElementById("tapd-export-btn");
    const previewId = getExportWorkItemId();
    if (!previewId) {
      showToast("当前页面不是可导出的需求/缺陷（预览或详情）", true);
      return;
    }

    if (!previewId.startsWith("story_") && !previewId.startsWith("bug_")) {
      showToast("仅支持需求 story 或缺陷 bug", true);
      return;
    }

    btn.disabled = true;
    try {
      const container = findExportRootContainer();
      if (!container) {
        showToast("未找到页面内容区域，请刷新后重试", true);
        return;
      }
      const description = findWorkItemSummary(container);
      const imageUrls = collectImageUrls(container);

      const res = await chrome.runtime.sendMessage({
        type: "TAPD_EXPORT_DOWNLOAD_IMAGES",
        dialogPreviewId: previewId,
        imageUrls,
      });

      if (!res || !res.ok) {
        showToast(res?.error || "扩展通信失败", true);
        return;
      }

      const text = buildClipboardText(description, res.paths || [], res.failures || []);
      await navigator.clipboard.writeText(text);
      const n = (res.paths || []).length;
      const failN = (res.failures || []).length;
      const tip =
        n === 0 && failN === 0
          ? "已复制到剪贴板"
          : `已复制到剪贴板（图片 ${n} 张${failN ? `，${failN} 张失败` : ""}）`;
      showToast(tip, failN > 0 && n === 0);
    } catch (e) {
      showToast(e?.message || String(e), true);
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    syncUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  const obs = new MutationObserver(() => {
    syncUi();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
