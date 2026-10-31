export const previewBackgrounds = Object.freeze({
  dark: { color: "#17151f", image: "none" },
  bright: { color: "#f5f5f5", image: "none" },
  checker: { color: "#ffffff", image: "conic-gradient(#777777 25%, #ffffff 0 50%, #777777 0 75%, #ffffff 0)", size: "24px 24px" },
  green: { color: "#00ff00", image: "none" },
  transparent: { color: "transparent", image: "none" },
});
const previewFrames = new WeakMap();

export function applyPreviewBackground(element, name) {
  const background = previewBackgrounds[name];
  if (!element || !background) return false;
  element.dataset.previewBackground = name;
  element.style.backgroundColor = background.color;
  element.style.backgroundImage = background.image;
  element.style.backgroundSize = background.size || "auto";
  if (element.matches?.("body")) element.classList.add("preview-background");
  return true;
}

export function setPreviewFrameBackground(frame, name) {
  const background = previewBackgrounds[name];
  if (!frame || !background) return false;
  previewFrames.set(frame, { name, background });
  frame.dataset.previewBackground = name;
  frame.style.backgroundColor = background.color;
  frame.style.backgroundImage = background.image;
  frame.style.backgroundSize = background.size || "auto";
  if (!frame.dataset.previewBackgroundBound) {
    frame.dataset.previewBackgroundBound = "true";
    frame.addEventListener("load", () => {
      const current = previewFrames.get(frame);
      if (current) frame.contentWindow?.postMessage({ kind: "streamforge:preview-background", ...current }, "*");
    });
  }
  frame.contentWindow?.postMessage({ kind: "streamforge:preview-background", name, background }, "*");
  return true;
}

export function readPreviewBackground(surface, fallback = "dark") {
  const saved = localStorage.getItem(`streamforge-preview-background:${surface}`);
  return Object.hasOwn(previewBackgrounds, saved) ? saved : fallback;
}

export function savePreviewBackground(surface, name) {
  if (!Object.hasOwn(previewBackgrounds, name)) return false;
  localStorage.setItem(`streamforge-preview-background:${surface}`, name);
  return true;
}

export function withPreviewBackground(value, name) {
  const url = new URL(value, location.origin);
  url.searchParams.set("preview", "1");
  url.searchParams.set("bg", Object.hasOwn(previewBackgrounds, name) ? name : "dark");
  return `${url.pathname}${url.search}${url.hash}`;
}
