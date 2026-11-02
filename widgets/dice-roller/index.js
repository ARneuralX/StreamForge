export default {
  meta: {
    title: "D20 Roller",
    description: "Roll a twenty-sided die with !roll d20.",
    width: 420,
    height: 180,
    x: 32,
    y: 32,
    anchor: "top-left",
  },
  mount(api) {
    const heading = document.createElement("h2");
    heading.textContent = "🎲 D20 Roller";

    const result = document.createElement("p");
    result.setAttribute("aria-live", "polite");
    result.textContent = "Type !roll d20 to roll";

    api.root.replaceChildren(heading, result);

    api.on("chat", (event) => {
      const message = String(event?.message || "").trim().toLowerCase();
      if (!/^!roll(?:\s+d20)?\s*$/.test(message)) return;

      const roll = Math.floor(Math.random() * 20) + 1;
      result.textContent = roll === 20
        ? "Rolled 20 — Critical! ✨"
        : `Rolled ${roll}`;

      if (roll === 20) {
        api.emit?.("moment", { kind: "natural20", label: "Natural 20" });
      }
    });
  },
};
