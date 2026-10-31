export default {
  meta: { title: "Follow & Sub Goals", description: "Live follower and subscriber progress.", width: 500, height: 230, x: 40, y: 300, anchor: "top-left" },
  mount(api) {
    let follows = 0; let subs = 0;
    const title = document.createElement("h2"); title.textContent = "🌟 Community goals";
    const followLabel = document.createElement("p");
    const followBar = document.createElement("progress"); followBar.max = 50;
    const subLabel = document.createElement("p");
    const subBar = document.createElement("progress"); subBar.max = 10;
    const draw = () => { followBar.value = follows; subBar.value = subs; followLabel.textContent = `Followers  ${follows} / 50`; subLabel.textContent = `Subscribers  ${subs} / 10`; };
    api.root.append(title, followLabel, followBar, subLabel, subBar); draw();
    api.on("follow", () => { follows = Math.min(50, follows + 1); draw(); });
    api.on("sub", () => { subs = Math.min(10, subs + 1); draw(); });
  },
};
