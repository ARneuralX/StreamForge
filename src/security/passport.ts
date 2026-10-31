import type { WidgetCheckResult } from "./widget-checks.js";

export type WidgetPassport = {
  events:string[];usesSound:boolean;usesStorage:boolean;usesHype:boolean;usesTheme:boolean;
  declared:{width:number;height:number;anchor:string};
  scan:{passed:boolean;syntax:boolean;network:boolean;forbiddenApis:boolean;mockMount:boolean};
  motionRisk:"low"|"medium"|"high";riskBasis:string[];heuristic:true;
};
type Declared = {width:number;height:number;anchor:string};

export function createWidgetPassport(source:string,css:string,declared:Declared,scan:WidgetCheckResult):WidgetPassport{
  const events=[...source.matchAll(/\bapi\s*\.\s*on\s*\(\s*["']([^"']+)["']/gu)].map((match)=>match[1]);
  const uniqueEvents=[...new Set(events)].sort();
  const animationTimes=[...css.matchAll(/(?:animation(?:-duration)?\s*:[^;]*?)(\d+(?:\.\d*)?|\.\d+)\s*(ms|s)\b/giu)].map((match)=>Number(match[1])*(match[2].toLowerCase()==="s"?1000:1));
  const hasTimer=/\b(?:setInterval|setTimeout|api\s*\.\s*timers)\b/u.test(source);
  const fast=animationTimes.some((time)=>time<333);
  const fastInfinite=[...css.matchAll(/animation\s*:[^;]{0,140}?((?:\d+(?:\.\d*)?|\.\d+)\s*(?:ms|s))[^;]{0,60}\binfinite\b/giu)].some((match)=>{const value=parseFloat(match[1]);return match[1].toLowerCase().includes("ms")?value<333:value<.333;});
  const flashPattern=/(?:opacity|filter|background(?:-color)?)\s*:/iu.test(css)&&/(?:flash|blink|strobe|pulse)/iu.test(`${source}\n${css}`);
  const high=fastInfinite||(fast&&flashPattern);
  const riskBasis:string[]=[];if(hasTimer)riskBasis.push("timer or animated state detected");if(animationTimes.length)riskBasis.push(`CSS animation timing detected (${animationTimes.join(", ")} ms)`);if(high)riskBasis.push("fast repeating or flash-like visual pattern detected");if(!riskBasis.length)riskBasis.push("no obvious motion pattern detected");
  return {events:uniqueEvents,usesSound:/\bapi\s*\.\s*sound\b/u.test(source),usesStorage:/\bapi\s*\.\s*storage\b/u.test(source),usesHype:/\bapi\s*\.\s*hype\b|api\s*\.\s*on\s*\(\s*["']hype["']/u.test(source),usesTheme:/\bapi\s*\.\s*theme\b|var\(--(?:accent|text|glow)/u.test(source+css),declared:{width:declared.width,height:declared.height,anchor:declared.anchor},scan:{passed:scan.ok,syntax:scan.checks.syntax,network:scan.checks.network,forbiddenApis:scan.checks.forbiddenApis,mockMount:scan.checks.mockMount},motionRisk:high?"high":riskBasis.length>1||hasTimer?"medium":"low",riskBasis,heuristic:true};
}
