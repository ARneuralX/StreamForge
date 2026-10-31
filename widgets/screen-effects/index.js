export default {
  meta: { title: "Celebration Effects", description: "Celebrate follows, subs and raids.", width: 420, height: 260, x: 0, y: 0, anchor: "center" },
  mount(api) {
    const title = document.createElement("h2"); title.textContent = "✨ Stream Celebration";
    const message = document.createElement("p"); message.textContent = "The next celebration starts here";
    const effect = document.createElement("div"); effect.className = "celebration";
    api.root.append(title, message, effect);
    for (const type of ["follow", "sub", "raid"]) api.on(type, (event) => {
      message.textContent = `${type} celebration${event?.name ? ` for ${String(event.name)}` : "!"} ✨`;
      effect.textContent = type === "raid" ? "🌧️ ✨ 🌧️ ✨ 🌧️" : type === "sub" ? "🎆 ✦ 🎇 ✦ 🎆" : "🎉 ✨ 🎊 ✨ 🎉";
      effect.className = `celebration ${type}`;
      api.sound?.play?.(type === "raid" ? "fanfare" : "sparkle");
    });
  },
};
