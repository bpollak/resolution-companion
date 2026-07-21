(() => {
  const menu = document.getElementById("mobileNav");
  const openButton = document.querySelector(".mobile-menu-btn");
  const closeButton = menu?.querySelector(".mobile-nav-close");

  if (!menu || !openButton || !closeButton) return;

  const closeMenu = (restoreFocus = true) => {
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
    openButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
    if (restoreFocus) openButton.focus();
  };

  openButton.addEventListener("click", () => {
    menu.classList.add("open");
    menu.setAttribute("aria-hidden", "false");
    openButton.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
    closeButton.focus();
  });

  closeButton.addEventListener("click", () => closeMenu());
  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMenu(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("open")) {
      closeMenu();
    }
  });
})();
