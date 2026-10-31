import { readFile } from "node:fs/promises";
import { createWidgetPassport } from "../dist/security/passport.js";
import { contrastRatio, nearestAccessibleText } from "../dist/security/contrast.js";
import { checkWidgetSource } from "../dist/security/widget-checks.js";

const source=`export default { meta:{title:"Example",description:"Test",width:420,height:180,x:0,y:0,anchor:"top-left"}, mount(api){ api.on("chat",()=>{}); api.sound.play(); api.storage.get("x"); api.theme.accent; } };`;
const declared={width:420,height:180,anchor:"top-left"};const scan=await checkWidgetSource(source);if(!scan.ok)throw new Error(`Passport fixture did not pass checks: ${scan.reason}`);
const passport=createWidgetPassport(source,"",declared,scan);
if(passport.events.join(",")!=="chat"||!passport.usesSound||!passport.usesStorage||!passport.usesTheme||passport.motionRisk!=="low"||!passport.scan.passed||!passport.heuristic)throw new Error("Passport did not report the declared capabilities and safety summary.");
const highCss="@keyframes pulse { from { opacity: 0 } to { opacity: 1 } } .effect { animation: pulse .2s infinite; }";
if(createWidgetPassport(source,highCss,declared,scan).motionRisk!=="high")throw new Error("Fast flash heuristic did not flag high motion risk.");
const fixed=nearestAccessibleText("#ffffff","#ffffff");if(contrastRatio(fixed,"#ffffff")<4.5)throw new Error("Contrast auto-fix did not meet 4.5:1.");
const runner=await readFile(new URL("../widgets/chat-runner/index.js",import.meta.url),"utf8");const runnerScan=await checkWidgetSource(runner);if(!runnerScan.ok)throw new Error(`Chat Runner failed the safety scan: ${runnerScan.reason}`);
console.log("PASS Passport capabilities, risk heuristic, scan summary and WCAG contrast repair.");
