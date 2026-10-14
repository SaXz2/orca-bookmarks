/**
 * 封面渲染（封面 / favicon 降级）。
 * 类名规范（BEM，与 popup.css 头注释一致）：
 *   .cover-img / .cover-placeholder / .favicon-img / .favicon-fallback
 * 主题色用 currentColor / CSS 变量，见 popup.css。
 */
const PLACEHOLDER_CLASS = "cover-placeholder";

/**
 * favicon 渲染（无封面时的降级）：取条目 URL 源站 /favicon.ico，
 * 加载失败降级为 host 文字块。
 */
export function renderFavicon(container: HTMLElement, url: string): void {
  container.textContent = "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const fallback = (): HTMLElement => {
    const d = document.createElement("div");
    d.className = "favicon-fallback";
    d.textContent = host || "🔗";
    return d;
  };
  if (!host) {
    container.appendChild(fallback());
    return;
  }
  const img = document.createElement("img");
  img.className = "favicon-img";
  img.loading = "lazy";
  img.alt = "";
  img.src = `${new URL(url).origin}/favicon.ico`;
  img.addEventListener("error", () => container.replaceChildren(fallback()));
  container.appendChild(img);
}

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
