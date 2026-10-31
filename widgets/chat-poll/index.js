export default {
  meta: { title: "Live Chat Poll", description: "Chat votes in a live A/B poll.", width: 440, height: 230, x: 0, y: 300, anchor: "top-right" },
  mount(api) {
    let a = 0; let b = 0; let closed = false;
    const title = document.createElement("h2"); title.textContent = "🗳️ Chat poll";
    const prompt = document.createElement("p"); prompt.textContent = "Which should we try next?";
    const result = document.createElement("p");
    const draw = () => { result.textContent = `${closed ? "Final · " : "Live · "} A ${a}  —  B ${b}`; };
    api.root.append(title, prompt, result); draw();
    api.on("chat", (event) => {
      const message = String(event.message || "").trim().toLowerCase();
      if (message === "!vote a" && !closed) a++;
      if (message === "!vote b" && !closed) b++;
      if (message === "!poll reset") { a = 0; b = 0; closed = false; }
      if (message === "!poll close") closed = true;
      draw();
    });
  },
};
