const heading = document.createElement("h2");
const status = document.createElement("p");

function render(api, reached) {
  heading.textContent = "Goal";
  status.textContent = reached ? "Goal reached!" : "Waiting for the goal";
  status.style.fontSize = "clamp(1rem, 4vw, 1.4rem)";
  status.style.overflowWrap = "anywhere";
  api.root.replaceChildren(heading, status);
  api.root.style.boxShadow = reached ? "0 0 1.25rem #a855f7" : "";
}

export default {
  meta: {
    title: "Goal Glow",
    description: "Show a purple glow when the goal is reached.",
    width: 320,
    height: 120,
    x: 0,
    y: 0,
    anchor: "top-left",
  },
  mount(api) {
    let reached = false;
    render(api, reached);
    api.on("chat", (event) => {
      if (typeof event?.message !== "string") return;
      const command = event.message.trim().toLowerCase();
      if (command === "!goal reached") reached = true;
      else if (command === "!goal reset") reached = false;
      else return;
      render(api, reached);
    });
  },
};
