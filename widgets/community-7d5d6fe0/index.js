export default {
  meta: {
    title: "Seasonal Cheer",
    description: "A gentle seasonal celebration that responds to follows.",
    width: 360,
    height: 120,
    x: 0,
    y: 0,
    anchor: "top-left",
  },
  mount(api) {
    let follows = 0;

    const render = () => {
      api.root.textContent = follows
        ? `✦ Season of cheer · ${follows} ${follows === 1 ? "new friend" : "new friends"} ✦`
        : "✦ Season of cheer ✦";
    };

    render();
    api.on("follow", () => {
      follows = Math.min(follows + 1, 9999);
      render();
    });
  },
};
