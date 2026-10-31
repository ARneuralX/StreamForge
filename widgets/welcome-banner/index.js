export default {
  meta: { title: "Welcome Banner", description: "A friendly welcome to the stream.", width: 460, height: 110, x: 0, y: 0, anchor: "top-left" },
  mount(api) {
    const text = document.createElement("div");
    text.textContent = "Welcome to the stream!";
    api.root.append(text);
    api.on("follow", (event) => { text.textContent = `Welcome, ${String(event?.name || "new friend")}!`; });
  },
};
