export default {
  meta: { title: "Community Widget", description: "A safe mock build from the request queue.", width: 420, height: 160, x: 0, y: 0, anchor: "top-right" },
  mount(api) {
    const heading = document.createElement("h2");
    heading.textContent = "Community widget";
    const copy = document.createElement("p");
    copy.textContent = "Ready for the stream";
    api.root.replaceChildren(heading, copy);
    api.on("chat", (event) => { if (String(event.message || "").trim()) copy.textContent = "Chat is part of this widget"; });
  },
};
