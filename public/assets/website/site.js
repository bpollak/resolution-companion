const menuButton = document.querySelector(".menu-toggle");
const menu = document.getElementById("site-nav");
function closeMenu(returnFocus = false) {
  menuButton?.setAttribute("aria-expanded", "false");
  menu?.setAttribute("data-open", "false");
  if (returnFocus) menuButton?.focus();
}
menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menu.setAttribute("data-open", String(open));
});
menu?.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuButton?.getAttribute("aria-expanded") === "true"
  )
    closeMenu(true);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".header-inner")) closeMenu();
});
const screens = {
  today: {
    alt: "Today screen with a sample reading plan and full and two-minute action controls",
  },
  journey: {
    alt: "Journey screen showing a sample reading habit, consistency, and calendar",
  },
  coach: {
    alt: "Coach screen with a conversation entry point, monthly allowance, and weekly read",
  },
  plan: {
    alt: "Plan review showing a reading habit, daily schedule, two-minute alternative, and Start button",
  },
};
const screenStatus = document.getElementById("screen-status");
let selection = 0;
for (const button of document.querySelectorAll("[data-screen]"))
  button.addEventListener("click", async () => {
    const token = ++selection;
    const key = button.dataset.screen;
    const src = "/assets/website/screen-" + key + "-v5.png";
    const img = new Image();
    img.src = src;
    try {
      await img.decode();
      if (token !== selection) return;
      document.getElementById("app-screen").src = src;
      document.getElementById("app-screen").alt = screens[key].alt;
      if (screenStatus) {
        screenStatus.textContent = "";
        screenStatus.hidden = true;
      }
      for (const other of document.querySelectorAll("[data-screen]"))
        other.setAttribute("aria-pressed", String(other === button));
    } catch {
      if (token === selection && screenStatus) {
        screenStatus.textContent =
          "This screen could not load. Please try again.";
        screenStatus.hidden = false;
      }
    }
  });
