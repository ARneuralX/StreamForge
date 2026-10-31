export default {
  meta: { title: "Boss Bar", description: "Chat attacks the boss with !attack.", width: 500, height: 180, x: 0, y: 0, anchor: "bottom-left" },
  mount(api) {
    let hp = 100;
    const title = document.createElement("h2"); title.textContent = "🐉 The Chat Boss";
    const meter = document.createElement("progress"); meter.max = 100; meter.value = hp;
    const label = document.createElement("p");
    const draw = () => { meter.value = hp; label.textContent = `Boss health ${hp}%`; };
    api.root.append(title, meter, label); draw();
    api.on("chat", (event) => { const text = String(event.message || "").toLowerCase(); if (text === "!attack") hp = hp <= 10 ? 100 : hp - 10; draw(); });
  },
};
