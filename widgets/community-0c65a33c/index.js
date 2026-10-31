export default {
  meta: {
    title: "Hello Banner",
    description: "A simple hello banner",
    width: 420,
    height: 100,
    x: 0,
    y: 0,
    anchor: "top-left",
  },
  mount(api) {
    api.root.textContent = "Hello!";
    api.root.style.boxSizing = "border-box";
    api.root.style.display = "flex";
    api.root.style.alignItems = "center";
    api.root.style.justifyContent = "center";
    api.root.style.width = "100%";
    api.root.style.height = "100%";
    api.root.style.padding = "20px 28px";
    api.root.style.borderRadius = "var(--sf-radius, 16px)";
    api.root.style.background = "var(--sf-background, #171923)";
    api.root.style.color = "var(--sf-text, #ffffff)";
    api.root.style.fontFamily = "var(--sf-font, system-ui, sans-serif)";
    api.root.style.fontSize = "32px";
    api.root.style.fontWeight = "700";
    api.root.style.textAlign = "center";
    api.root.style.boxShadow = "0 0 24px var(--sf-glow, rgba(124, 92, 255, 0.35))";
  },
};
