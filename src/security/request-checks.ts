const blocked = [/\bmalware\b/iu, /\bsteal\s+(?:a\s+)?token\b/iu, /\bkeylogger\b/iu];
const confusables:Record<string,string>={а:"a",е:"e",о:"o",р:"p",с:"c",х:"x",у:"y",і:"i",ј:"j",к:"k",м:"m",т:"t",в:"b",н:"h",Α:"a",Β:"b",Ε:"e",Ι:"i",Κ:"k",Μ:"m",Ν:"n",Ο:"o",Ρ:"p",Τ:"t",Χ:"x",Υ:"y","0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","@":"a","$":"s"};
export type RequestLanguage={normalized:string;script:string;english:boolean;manualReview:boolean};
export function normalizeRequestText(text:string):string{return text.normalize("NFKC").replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu,"").replace(/[\u0000-\u001f\u007f-\u009f\u00ad]/gu," ").replace(/\s+/gu," ").trim();}
export function detectRequestLanguage(text:string):RequestLanguage{
 const normalized=normalizeRequestText(text);const counts=[...normalized].reduce((result,char)=>{if(/[\p{Script=Bengali}]/u.test(char))result.Bengali++;else if(/[\p{Script=Arabic}]/u.test(char))result.Arabic++;else if(/[\p{Script=Cyrillic}]/u.test(char))result.Cyrillic++;else if(/[\p{Script=Han}]/u.test(char))result.CJK++;else if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char))result.Japanese++;else if(/[\p{Script=Latin}]/u.test(char))result.Latin++;return result;},{Latin:0,Bengali:0,Arabic:0,Cyrillic:0,CJK:0,Japanese:0} as Record<string,number>);const script=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[1]?Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]:"Unknown";
 const nonEnglishTerms=/\b(?:una|uno|para|por|que|quiero|haz|crear|barra|contagem|hacer|mais|uma|com|criar|faça|বাংলা|কি)\b/iu.test(normalized);const english=script==="Latin"&&!/[áéíóúñ¿¡ãõçàèìòù]/iu.test(normalized)&&!nonEnglishTerms;
 return{normalized,script,english,manualReview:!english};
}
function folded(text:string):string{return [...text.normalize("NFKD").toLocaleLowerCase().replace(/\p{M}/gu,"")].map((char)=>confusables[char]??char).join("").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/gu," ").trim();}
export function validateRequestText(text: string): { ok: boolean; reason?: string; language?:RequestLanguage } {
 const language=detectRequestLanguage(text);const value=language.normalized;
 if(!value)return {ok:false,reason:"Enter a widget request first."};
 if([...value].length>300)return {ok:false,reason:"Keep the request under 300 characters."};
 if(blocked.some((rule)=>rule.test(folded(value))))return {ok:false,reason:"That request needs a manual moderator review."};
 return {ok:true,language};
}
