/**
 * 下载 TAPD 图片并返回本机绝对路径（DownloadItem.filename）。
 */

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi)(\?|$)/i;

function sanitizeDirSegment(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "export";
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const m = path.match(/\.(png|jpe?g|gif|webp|bmp|svg)(?:$|\?)/i);
    if (m) return "." + m[1].toLowerCase().replace("jpeg", "jpg");
  } catch (_) {}
  return ".png";
}

function waitForDownloadFinish(downloadId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(onChanged);
      reject(new Error("下载超时"));
    }, 120000);

    function onChanged(delta) {
      if (delta.id !== downloadId) return;

      if (delta.error?.current) {
        clearTimeout(timeout);
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(new Error(delta.error.current));
        return;
      }

      if (delta.state?.current === "complete") {
        clearTimeout(timeout);
        chrome.downloads.onChanged.removeListener(onChanged);
        chrome.downloads.search({ id: downloadId }, (results) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          const item = results && results[0];
          if (item?.filename) resolve(item.filename);
          else reject(new Error("无法获取保存路径"));
        });
        return;
      }

      if (delta.state?.current === "interrupted") {
        clearTimeout(timeout);
        chrome.downloads.onChanged.removeListener(onChanged);
        const reason = delta.error?.current || "interrupted";
        reject(new Error(reason));
      }
    }

    chrome.downloads.onChanged.addListener(onChanged);
  });
}

function downloadOne(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false,
        conflictAction: "overwrite",
      },
      (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (downloadId == null) {
          reject(new Error("downloadId 为空"));
          return;
        }
        waitForDownloadFinish(downloadId).then(resolve).catch(reject);
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TAPD_EXPORT_DOWNLOAD_IMAGES") {
    return false;
  }

  const { dialogPreviewId, imageUrls } = message;
  const safeId = sanitizeDirSegment(dialogPreviewId || "export");
  const base = `TapdExport/${safeId}/`;

  (async () => {
    const paths = [];
    const failures = [];

    const list = Array.isArray(imageUrls) ? imageUrls : [];
    const batchStamp = Date.now();
    for (let i = 0; i < list.length; i++) {
      const url = list[i];
      if (!url || typeof url !== "string" || VIDEO_EXT.test(url)) {
        continue;
      }
      const ext = extFromUrl(url);
      const name = `${base}img_${batchStamp}_${String(i + 1).padStart(2, "0")}${ext}`;
      try {
        const filename = await downloadOne(url, name);
        paths.push(filename);
      } catch (e) {
        failures.push({ url, error: e?.message || String(e) });
      }
    }

    sendResponse({ ok: true, paths, failures });
  })().catch((e) => {
    sendResponse({
      ok: false,
      error: e?.message || String(e),
      paths: [],
      failures: [],
    });
  });

  return true;
});
