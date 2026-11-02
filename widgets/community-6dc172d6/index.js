export default {
  meta: {
    title: "Rose Welcome",
    description: "A warm welcome banner with a rose.",
    width: 420,
    height: 180,
    x: 0,
    y: 0,
    anchor: "top-left",
  },
  mount(api) {
    const heading = document.createElement("h2");
    heading.textContent = "Welcome 🌹";
    heading.style.color = api.theme.accent;
    heading.style.fontSize = "clamp(1.5rem, 5vw, 2.5rem)";
    heading.style.overflowWrap = "anywhere";

    const message = document.createElement("p");
    message.textContent = "So glad you're here.";
    message.style.color = api.theme.text;
    message.style.fontSize = "clamp(1rem, 3vw, 1.25rem)";
    message.style.overflowWrap = "anywhere";

    api.root.replaceChildren(heading, message);
  },
};
