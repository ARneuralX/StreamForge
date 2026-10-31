export default {
  meta: { title: "Chat Countdown", description: "A stream countdown chat can extend.", width: 420, height: 170, x: 0, y: 0, anchor: "bottom-right" },
  mount(api) {
    let remaining = 300;
    const title = document.createElement("h2"); title.textContent = "⏳ Stream countdown";
    const clock = document.createElement("p"); clock.setAttribute("aria-live", "polite");
    const hint = document.createElement("span"); hint.textContent = "Extend with !extend 10";
    const draw = () => { clock.textContent = `${Math.floor(remaining / 60).toString().padStart(2,"0")}:${(remaining % 60).toString().padStart(2,"0")}`; };
    api.root.append(title, clock, hint); draw();
    api.on("hype",(hype)=>{if(!hype?.reactive||hype.muted)return;title.dataset.hype=hype.level;title.style.setProperty("--hype-glow-size",`${5+8*hype.value/100}px`);});
    api.timers.setInterval(() => { remaining = Math.max(0, remaining - 1); draw(); }, 1000);
    api.on("chat", (event) => {
      const match = /^!extend\s+(\d{1,3})$/iu.exec(String(event.message || "").trim());
      if (match) { remaining = Math.min(3600, remaining + Math.max(1, Number(match[1]))); draw(); }
    });
  },
};
