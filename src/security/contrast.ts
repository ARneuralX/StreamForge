function channel(value:number):number{const normalized=value/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4;}
function luminance(hex:string):number{const rgb=hex.slice(1).match(/.{2}/gu)!.map((part)=>parseInt(part,16));return .2126*channel(rgb[0])+.7152*channel(rgb[1])+.0722*channel(rgb[2]);}
export function contrastRatio(foreground:string,background:string):number{const a=luminance(foreground);const b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
export function nearestAccessibleText(foreground:string,background:string):string{
  if(contrastRatio(foreground,background)>=4.5)return foreground;
  const rgb=foreground.slice(1).match(/.{2}/gu)!.map((part)=>parseInt(part,16));const candidates:string[]=[];
  for(const target of [0,255])for(let step=1;step<=100;step++){const ratio=step/100;const color="#"+rgb.map((value)=>Math.round(value+(target-value)*ratio).toString(16).padStart(2,"0")).join("");if(contrastRatio(color,background)>=4.5){candidates.push(color);break;}}
  return candidates.sort((left,right)=>{const distance=(candidate:string)=>candidate.slice(1).match(/.{2}/gu)!.map((part,index)=>parseInt(part,16)-rgb[index]).reduce((sum,value)=>sum+value*value,0);return distance(left)-distance(right);})[0]||"#000000";
}
