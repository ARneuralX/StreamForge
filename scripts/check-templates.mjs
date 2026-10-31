import { readFile } from "node:fs/promises";
import { validateRequestText } from "../dist/security/request-checks.js";

const templates=JSON.parse(await readFile(new URL("../templates.json",import.meta.url),"utf8"));
const library=JSON.parse(await readFile(new URL("../library/catalog.json",import.meta.url),"utf8"));
const categories=new Set(["Alerts","Games","Polls","Timers","Seasonal","Utility"]);
if(templates.length!==12)throw new Error(`Expected 12 templates, found ${templates.length}.`);
for(const template of templates){
  if(!template.id||!categories.has(template.category)||!template.title||!template.description||!template.time)throw new Error(`Incomplete template: ${template.id||"unknown"}.`);
  const validation=validateRequestText(template.prompt);
  if(!validation.ok)throw new Error(`Template ${template.id} failed request validation: ${validation.reason}`);
  if(template.widgetId&&!library.some((entry)=>entry.widgetId===template.widgetId))throw new Error(`Template ${template.id} points to a missing Library widget.`);
}
console.log(`PASS ${templates.length} templates pass the shared request validator and Library references.`);
