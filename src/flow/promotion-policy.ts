export type PromotionSetting = "ask" | "eligible" | "never";
export type PromotionSource = "dashboard" | "moderator" | "chat" | "points" | "other";

export function mayPromoteAutomatically(input: {
  setting: PromotionSetting;
  source: PromotionSource;
  requested: boolean;
  checksPassed: boolean;
}): boolean {
  if (input.setting !== "eligible" || !input.checksPassed) return false;
  if (input.source === "moderator") return true;
  return input.source === "dashboard" && input.requested;
}
