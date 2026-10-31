const params = new URLSearchParams(location.search);
const bg = params.get("bg");
const backgrounds = { dark: "#17151f", bright: "#f5f5f5", green: "#00ff00", transparent: "transparent" };
if (bg === "checker") document.body.style.backgroundImage = "conic-gradient(#777 25%, #fff 0 50%, #777 0 75%, #fff 0) 0 / 24px 24px";
else if (backgrounds[bg]) document.body.style.background = backgrounds[bg];
if (params.has("feed")) document.querySelector("#feed").hidden = false;
const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
let frames = new Map();
async function load() {
  const data = await (await fetch("/api/state")).json();
  const region = document.querySelector("#widgets"); region.replaceChildren(); frames = new Map();
  for (const widget of data.widgets.filter((item)=>item.enabled)) {
    const frame = document.createElement("iframe");
    frame.className = "widget-frame"; frame.title = widget.title; frame.width = String(widget.width); frame.height = String(widget.height);
    frame.setAttribute("sandbox", "allow-scripts"); frame.src = `/widgets/frame.html?id=${encodeURIComponent(widget.id)}`;
    region.append(frame); frames.set(widget.id, frame);
  }
}
load();
socket.addEventListener("message", (event) => {
  let message; try { message = JSON.parse(event.data); } catch { return; }
  if (message.type === "event") {
    for (const frame of frames.values()) frame.contentWindow?.postMessage({kind:"streamforge:event",event:message.event},"*");
  }
  if (message.type === "widgets") load();
  if (message.type === "event" && document.querySelector("#feed").hidden === false) {
    const item=document.createElement("div");item.className="feed-item";item.textContent=`SIMULATED · ${message.event.type} event received`;document.querySelector("#feed-items").prepend(item);
  }
});
