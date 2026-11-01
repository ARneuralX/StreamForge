const eventDetails = {
  follow: { title: "A new follower!", icon: "💜", color: "var(--sf-accent, #a855f7)" },
  sub: { title: "Subscription celebration!", icon: "⭐", color: "var(--sf-accent2, #f59e0b)" },
  raid: { title: "A raid has arrived!", icon: "🎉", color: "var(--sf-glow, #22d3ee)" },
};

function displayName(event) {
  if (!event || typeof event !== "object") return "A community member";
  const value = event.displayName ?? event.username ?? event.name;
  return typeof value === "string" && value.trim() ? value.trim() : "A community member";
}

export default {
  meta: {
    title: "Celebration",
    description: "Colorful follow, subscription and raid celebrations with synthesized sound.",
    width: 420,
    height: 190,
    x: 0,
    y: 0,
    anchor: "top-left",
  },

  mount(api) {
    let motionScale = [1, 0.5, 0.15].includes(api.motionScale) ? api.motionScale : 1;
    let safeMode = ["off", "reduced", "minimal"].includes(api.safeMode) ? api.safeMode : "off";

    const heading = document.createElement("h2");
    heading.textContent = "The celebration starts here!";

    const message = document.createElement("p");
    message.textContent = "Your community moments will shine here.";

    const confetti = document.createElement("p");
    confetti.setAttribute("aria-hidden", "true");
    confetti.style.color = "var(--sf-accent, #a855f7)";
    confetti.style.fontSize = "clamp(1.5rem, 6vw, 2.5rem)";
    confetti.style.overflowWrap = "anywhere";
    confetti.textContent = "✨ 🎊 💜 🎉 ⭐";

    api.root.replaceChildren(confetti, heading, message);

    const celebrate = (type, event) => {
      const detail = eventDetails[type];
      if (!detail) return;

      const name = displayName(event);
      const count = type === "raid" && event && Number.isFinite(event.viewers) && event.viewers > 0
        ? ` with ${Math.floor(event.viewers)} raiders`
        : "";

      heading.textContent = detail.title;
      heading.style.color = detail.color;
      message.textContent = `${name}${count} — thanks for making this moment special!`;

      const reduced = safeMode === "minimal" ? 0 : safeMode === "reduced" ? 2 : Math.max(2, Math.round(5 * motionScale));
      const symbols = [detail.icon, "✨", "🎊", "💫", "🎉"];
      confetti.textContent = reduced === 0 ? detail.icon : symbols.slice(0, reduced).join("  ");
      confetti.style.color = detail.color;

      if (safeMode !== "minimal") api.sound.play("celebration");
    };

    api.on("follow", (event) => celebrate("follow", event));
    api.on("sub", (event) => celebrate("sub", event));
    api.on("raid", (event) => celebrate("raid", event));
    api.on("safeMode", ({ level, motionScale: scale } = {}) => {
      if (["off", "reduced", "minimal"].includes(level)) safeMode = level;
      if ([1, 0.5, 0.15].includes(scale)) motionScale = scale;
    });
  },
};
