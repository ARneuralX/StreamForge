export default {
  meta: { title: "Dice Roller", description: "Roll a die with chat using !roll d20.", width: 440, height: 190, x: 32, y: 32, anchor: "top-left" },
  mount(api) {
    const title = document.createElement("h2");
    title.textContent = "🎲 Chat Dice";
    const result = document.createElement("div");
    result.textContent = "Type !roll d20 to roll";
    api.root.append(title, result);
    api.on("chat", (event) => {
      const message = String(event.message || "").trim().toLowerCase();
      if (!message.startsWith("!roll")) return;
      const roll = Math.floor(Math.random() * 20) + 1;
      result.textContent = `Rolled ${roll}${roll === 20 ? " — Critical! ✨" : ""}`;
      if (roll === 20) api.sound?.play?.("sparkle");
    });
  },
};
