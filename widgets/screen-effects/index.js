export default {
  meta: { title: "Celebration Effects", description: "Celebrate follows, subs and raids.", width: 420, height: 260, x: 0, y: 0, anchor: "center" },
  mount(api) {
    const title = document.createElement("h2"); title.textContent = "✨ Stream Celebration";
    const message = document.createElement("p"); message.textContent = "The next celebration starts here";
    api.root.append(title, message);
    for (const type of ["follow", "sub", "raid", "redeem"]) api.on(type, (event) => { message.textContent = `${type} celebration${event?.name ? ` for ${String(event.name)}` : "!"} ✨`; });
  },
};
