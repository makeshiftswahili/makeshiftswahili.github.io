const MODULE_API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/course-modules";

async function loadModuleAvailability() {
  try {
    const response = await fetch(MODULE_API_URL, { method: "GET", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load module availability");

    const moduleState = payload.modules instanceof Array
      ? new Map(payload.modules.map(module => [module.module_key, !!module.is_available]))
      : new Map(Object.entries(payload.modules || {}).map(([key, value]) => [key, value === true]));

    document.querySelectorAll("[data-module]").forEach(card => {
      const available = moduleState.get(card.dataset.module) === true;
      const status = card.querySelector(".status");
      const openLink = card.querySelector(".open-link");

      card.classList.toggle("available", available);
      card.classList.toggle("locked", !available);
      status.textContent = available ? "Available" : "Not yet available";
      openLink?.classList.toggle("is-hidden", !available);

      if (available) {
        card.setAttribute("href", card.dataset.href);
        card.removeAttribute("aria-disabled");
      } else {
        card.removeAttribute("href");
        card.setAttribute("aria-disabled", "true");
      }
    });
  } catch (error) {
    console.error(error);
  }
}

loadModuleAvailability();
