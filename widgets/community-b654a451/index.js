export default {
  meta: {
    title: "D20 Roll",
    description: "Roll a twenty-sided die with !roll d20",
    width: 360,
    height: 150,
    x: 0,
    y: 0,
    anchor: "top-left",
  },
  mount(api) {
    const heading = document.createElement("h2");
    heading.textContent = "Twenty-sided die";
    const result = document.createElement("p");
    result.textContent = "Type !roll d20 in chat";
    api.root.replaceChildren(heading, result);

    api.on("chat", (event) => {
      const message = typeof event?.text === "string" ? event.text : "";
      if (!/^\s*!roll\s+d20\s*$/i.test(message)) return;

      const roll = Math.floor(Math.random() * 20) + 1;
      result.textContent = `You rolled ${roll}`;
      if (roll === 20) api.emit?.("moment", { kind: "natural20", label: "Natural 20" });
    });
  },
};
