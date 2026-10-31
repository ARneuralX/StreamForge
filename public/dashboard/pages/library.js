export async function library(root, state) {
  root.innerHTML = `<header class="page-head"><div><h1>Widget library</h1><p>Starter overlays are ready to preview.</p></div></header><section class="grid two">${state.widgets.map((widget)=>`<article class="card"><div class="widget-preview">${escapeText(widget.title)}</div><h2 style="margin-top:14px">${escapeText(widget.title)}</h2><p>${escapeText(widget.description)}</p><p class="small">Creator: StreamForge starter pack</p><button data-add="${widget.id}">Add to scene</button></article>`).join("")}</section>`;
  root.querySelectorAll("[data-add]").forEach((button)=>button.onclick=()=>{button.textContent="Already in scene";});
}
function escapeText(value) { const el=document.createElement("span");el.textContent=value;return el.innerHTML; }
