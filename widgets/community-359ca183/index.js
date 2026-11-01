export default {
  meta: {
    title: "D20 Roller",
    description: "Roll a twenty-sided die in chat with !roll d20.",
    width: 360,
    height: 160,
    x: 0,
    y: 0,
    anchor: "top-left",
  },
  mount(api) {
    const heading = document.createElement("h2");
    heading.textContent = "D20 Roller";

    const result = document.createElement("p");
    result.textContent = "Say !roll d20 in chat to roll.";
    api.root.replaceChildren(heading, result);

    api.on("chat", (event) => {
      const message = typeof event?.message === "string"
        ? event.message
        : typeof event?.message?.text === "string"
          ? event.message.text
          : typeof event?.text === "string"
            ? event.text
            : "";

      if (!/^!roll\s+d20\s*$/i.test(message.trim())) return;

      const roll = Math.floor(Math.random() * 20) + 1;
      result.textContent = roll === 20
        ? "Natural 20! You rolled 20."
        : `You rolled ${roll}.`;
      if (roll === 20) api.emit?.("moment", { kind: "natural20", label: "Natural 20" });
    });
  },
};
