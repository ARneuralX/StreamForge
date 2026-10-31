export default {
  meta: { title: "Boss Bar", description: "Chat attacks the boss with !attack.", width: 500, height: 180, x: 0, y: 0, anchor: "bottom-left" },
  mount(api) {
    let hp = 100;
    const title = document.createElement("h2"); title.textContent = "🐉 The Chat Boss";
    const meter = document.createElement("progress"); meter.max = 100; meter.value = hp;
    const label = document.createElement("p");
    let status = "";
    const draw = () => { meter.value = hp; label.textContent = status || `Boss health ${hp}%`; };
    api.root.append(title, meter, label); draw();
    api.on("hype",(hype)=>{if(!hype?.reactive||hype.muted)return;api.root.dataset.hype=hype.level;api.root.style.setProperty("--hype-glow-size",`${5+8*hype.value/100}px`);meter.style.setProperty("--hype-glow-size",`${3+6*hype.value/100}px`);});
    api.on("chat", (event) => {
      const text = String(event.message || "").trim().toLowerCase(); status = "";
      if (text === "!attack") { hp = Math.max(0, hp - 10); if (hp === 0) { status = "Boss defeated! A new round begins."; hp = 100; } }
      if (text === "!heal") { hp = Math.min(100, hp + 10); if (hp === 100) status = "Boss fully healed. Keep the fight going!"; }
      draw();
    });
  },
};
