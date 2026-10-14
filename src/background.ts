/**
 * background service worker（MV3, module）。
 * 骨架阶段仅做安装初始化；后续如需后台定时同步/角标再扩展。
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("[orca-bookmarks] installed");
});
