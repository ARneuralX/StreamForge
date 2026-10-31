export default {
  meta: { title: "Prediction Scoreboard", description: "Chat votes with !a and !b.", width: 440, height: 210, x: 0, y: 0, anchor: "top-right" },
  mount(api) {
    let a = 0; let b = 0;
    const title = document.createElement("h2"); title.textContent = "🔮 Chat Prediction";
    const score = document.createElement("p");
    const draw = () => { score.textContent = `Option A  ${a}  ·  ${b}  Option B`; };
    api.root.append(title, score); draw();
    api.on("chat", (event) => { const message = String(event.message || "").trim().toLowerCase(); if (message === "!a") a++; if (message === "!b") b++; draw(); });
  },
};
