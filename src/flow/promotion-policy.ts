export type PromotionSetting = "ask" | "eligible" | "never";
export type PromotionSource = "dashboard" | "moderator" | "chat" | "points" | "other";

export function mayPromoteAutomatically(input: {
  setting: PromotionSetting;
  source: PromotionSource;
  requested: boolean;
  checks: Record<string, unknown>;
}): boolean {
  const checksPassed=["syntax","network","forbiddenApis","mockMount"].every(name=>input.checks[name]===true);
  if (input.setting !== "eligible" || !checksPassed) return false;
  if (input.source === "moderator") return true;
  return input.source === "dashboard" && input.requested;
}
