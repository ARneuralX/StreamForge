const blocked = [/\bmalware\b/iu, /\bsteal\s+(?:a\s+)?token\b/iu, /\bkeylogger\b/iu];
export function validateRequestText(text: string): { ok: boolean; reason?: string } {
  const value=text.trim();
  if(!value)return {ok:false,reason:"Enter a widget request first."};
  if(value.length>300)return {ok:false,reason:"Keep the request under 300 characters."};
  if(blocked.some((rule)=>rule.test(value)))return {ok:false,reason:"That request needs a manual moderator review."};
  return {ok:true};
}
