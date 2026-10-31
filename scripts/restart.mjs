import { spawn } from "node:child_process";

const stop = spawn("pkill", ["-f", "dist/server.js"], { stdio: "ignore" });
stop.on("exit", () => {
  const start = spawn("npm", ["start"], { stdio: "inherit", shell: process.platform === "win32" });
  start.on("exit", (code) => process.exit(code ?? 0));
});
