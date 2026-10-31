export function computeLayout(items, options = {}) {
  const canvas = { width: 1920, height: 1080, padding: 32, gap: 12 };
  const placed = [];
  const reserved = (options.zones || []).filter((zone) => zone.width > 0 && zone.height > 0);
  const overlaps = (a, b) => a.x < b.x + b.width + canvas.gap && a.x + a.width + canvas.gap > b.x && a.y < b.y + b.height + canvas.gap && a.y + a.height + canvas.gap > b.y;
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const ordered = [...items].sort((a,b)=>Number(Boolean(b.position))-Number(Boolean(a.position)));
  for (const item of ordered) {
    const width = Math.min(Number(item.width) || 420, canvas.width - canvas.padding * 2);
    const height = Math.min(Number(item.height) || 180, canvas.height - canvas.padding * 2);
    const anchor = item.anchor || "top-left";
    const xs = Array.from({length: Math.floor((canvas.width - width - canvas.padding * 2) / 40) + 1}, (_, i) => canvas.padding + i * 40);
    const ys = Array.from({length: Math.floor((canvas.height - height - canvas.padding * 2) / 40) + 1}, (_, i) => canvas.padding + i * 40);
    const orderedX = anchor.includes("right") ? [...xs].reverse() : xs;
    const orderedY = anchor.includes("bottom") ? [...ys].reverse() : ys;
    let candidates = [];
    if (item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.y)) {
      candidates.push([Math.round(item.position.x), Math.round(item.position.y)]);
    }
    if (anchor === "center") {
      candidates.push([Math.round((canvas.width-width)/2),Math.round((canvas.height-height)/2)]);
      candidates.push(...ys.flatMap((y)=>orderedX.map((x)=>[x,y])));
    } else candidates.push(...orderedY.flatMap((y)=>orderedX.map((x)=>[x,y])));
    const chosen = candidates.find(([x,y]) => x >= canvas.padding && y >= canvas.padding && x+width <= canvas.width-canvas.padding && y+height <= canvas.height-canvas.padding && !placed.some((other)=>overlaps({x,y,width,height},other)) && !reserved.some((zone)=>intersects({x,y,width,height},zone)));
    if (chosen) placed.push({ id:item.id, x:chosen[0], y:chosen[1], width, height, manual:Boolean(item.position && chosen[0]===Math.round(item.position.x) && chosen[1]===Math.round(item.position.y)) });
  }
  return placed;
}
