/**
 * Offscreen 音频播放宿主：
 * 在扩展后台独立隐式运行，不受 popup 弹窗开关影响。
 * 负责根据消息挂载 iframe / 音频，支持 网易云音乐 / B站 / YouTube。
 */

interface PlayAudioMessage {
  type: "orca:music:play";
  embedUrl: string;
}

interface StopAudioMessage {
  type: "orca:music:stop";
}

type AudioHostMessage = PlayAudioMessage | StopAudioMessage;

const container = document.getElementById("audio-container")!;

chrome.runtime.onMessage.addListener((msg: AudioHostMessage, _sender, sendResponse) => {
  if (msg?.type === "orca:music:play") {
    container.textContent = "";
    const iframe = document.createElement("iframe");
    iframe.src = msg.embedUrl;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    container.appendChild(iframe);
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === "orca:music:stop") {
    container.textContent = "";
    sendResponse({ ok: true });
    return true;
  }
});
