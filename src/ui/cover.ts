/** 封面渲染：有封面显示缩略图，无封面显示占位块 */
const PLACEHOLDER_CLASS = "cover-placeholder";

export function renderCover(container: HTMLElement, coverUrl: string | null): void {
  container.textContent = "";
  if (!coverUrl) {
    const ph = document.createElement("div");
    ph.className = PLACEHOLDER_CLASS;
    ph.textContent = "🔗";
    container.appendChild(ph);
    return;
  }
  const img = document.createElement("img");
  img.className = "cover-img";
  img.loading = "lazy";
  img.src = coverUrl;
  img.alt = "";
  img.addEventListener("error", () => {
    // 封面加载失败降级为占位块
    const ph = document.createElement("div");
    ph.className = PLACEHOLDER_CLASS;
    ph.textContent = "🔗";
    container.replaceChildren(ph);
  });
  container.appendChild(img);
}
