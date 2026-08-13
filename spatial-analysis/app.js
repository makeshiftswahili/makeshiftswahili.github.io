const MODULE_API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/course-modules";

function moduleMap(payload) {
  const raw = payload?.modules || {};
  if (Array.isArray(raw)) return new Map(raw.map(m => [m.module_key, !!m.is_available]));
  return new Map(Object.entries(raw).map(([key, value]) => [key, typeof value === 'object' ? !!value.is_available : !!value]));
}

async function loadModuleAvailability() {
  try {
    const response = await fetch(MODULE_API_URL, { method: "GET", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load module availability");
    const state = moduleMap(payload);

    document.querySelectorAll("[data-module]").forEach(card => {
      const available = state.get(card.dataset.module) === true;
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
    document.querySelectorAll("[data-module] .status").forEach(el => { el.textContent = "Unavailable"; });
  }
}

loadModuleAvailability();
