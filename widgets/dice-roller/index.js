export default {
  meta: {
    title: "Dice Roller",
    description: "Roll a twenty-sided die with !roll d20.",
    width: 440,
    height: 190,
    x: 32,
    y: 32,
    anchor: "top-left",
  },
  mount(api) {
    const heading = document.createElement("h2");
    heading.textContent = "🎲 Chat Dice";

    const result = document.createElement("p");
    result.textContent = "Type !roll d20 to roll";
    result.setAttribute("aria-live", "polite");
    api.root.replaceChildren(heading, result);

    const showRoll = (sides) => {
      const roll = Math.floor(Math.random() * sides) + 1;
      result.textContent = `Rolled ${roll}${sides === 20 && roll === 20 ? " — Critical! ✨" : ""}`;
      if (sides === 20 && roll === 20) {
        api.sound?.play?.("sparkle");
        api.emit?.("moment", { kind: "natural20", label: "Natural 20" });
      }
    };

    api.on("chat", (event) => {
      const message = String(event?.message ?? "").trim().toLowerCase();
      const match = message.match(/^!\s*roll\s+d(\d+|2o)$/);
      if (!match) return;
      const sides = match[1] === "2o" ? 20 : Number(match[1]);
      if (!Number.isSafeInteger(sides) || sides < 2 || sides > 1000) return;
      showRoll(sides);
    });
  },
};
