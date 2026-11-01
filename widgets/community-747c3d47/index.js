export default {
  meta: {
    title: "Hello Dashboard",
    description: "A cheerful dashboard with a red rose.",
    width: 360,
    height: 180,
    x: 0,
    y: 0,
    anchor: "top-left",
  },
  mount(api) {
    const root = api.root;
    root.textContent = "🌹  HELLO\nYour little corner of the stream";
    root.style.boxSizing = "border-box";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.padding = "28px 24px";
    root.style.borderRadius = "var(--sf-radius, 20px)";
    root.style.background = "linear-gradient(135deg, #fff5f5, #ffe3e7)";
    root.style.color = "#8f1833";
    root.style.fontFamily = "var(--sf-font, system-ui)";
    root.style.fontSize = "20px";
    root.style.fontWeight = "700";
    root.style.lineHeight = "1.8";
    root.style.whiteSpace = "pre-line";
    root.style.textAlign = "center";
    root.style.boxShadow = "0 10px 30px rgba(143, 24, 51, 0.18)";
  },
};
