const MODULE_API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/course-modules";

let availabilityNotice = null;

function setCardsNeutral() {
  document.querySelectorAll("[data-module]").forEach(card => {
    const status = card.querySelector(".status");
    const openLink = card.querySelector(".open-link");

    card.classList.remove("available", "locked");
    status?.classList.add("is-hidden");
    if (status) status.textContent = "";
    openLink?.classList.add("is-hidden");

    // Availability is unknown, so do not make any module actionable.
    card.removeAttribute("href");
    card.setAttribute("aria-disabled", "true");
  });
}

function clearAvailabilityNotice() {
  availabilityNotice?.remove();
  availabilityNotice = null;
}

function showAvailabilityNotice() {
  if (availabilityNotice) return;

  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:16px",
    "margin:0 0 28px",
    "padding:16px 18px",
    "border:1px solid var(--line)",
    "border-left:3px solid #d8a73c",
    "background:var(--panel)",
    "color:var(--text)"
  ].join(";");

  const message = document.createElement("span");
  message.textContent = "Couldn't check which modules are open — refresh to try again";
  message.style.lineHeight = "1.45";

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "Retry";
  retryButton.style.cssText = [
    "flex:0 0 auto",
    "padding:8px 14px",
    "border:1px solid #555",
    "background:#262626",
    "color:var(--text)",
    "font:inherit",
    "cursor:pointer"
  ].join(";");

  retryButton.addEventListener("mouseenter", () => { retryButton.style.background = "#303030"; });
  retryButton.addEventListener("mouseleave", () => { retryButton.style.background = "#262626"; });
  retryButton.addEventListener("click", async () => {
    retryButton.disabled = true;
    retryButton.textContent = "Retrying…";
    await loadModuleAvailability();
    if (availabilityNotice) {
      retryButton.disabled = false;
      retryButton.textContent = "Retry";
    }
  });

  notice.append(message, retryButton);
  const firstSection = document.querySelector(".course-section");
  if (firstSection) firstSection.before(notice);
  else document.querySelector("main")?.prepend(notice);
  availabilityNotice = notice;
}

async function loadModuleAvailability() {
  setCardsNeutral();

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
      if (status) {
        status.textContent = available ? "Available" : "Not yet available";
        status.classList.remove("is-hidden");
      }
      openLink?.classList.toggle("is-hidden", !available);

      if (available) {
        card.setAttribute("href", card.dataset.href);
        card.removeAttribute("aria-disabled");
      } else {
        card.removeAttribute("href");
        card.setAttribute("aria-disabled", "true");
      }
    });

    clearAvailabilityNotice();
    return true;
  } catch (error) {
    console.error(error);
    setCardsNeutral();
    showAvailabilityNotice();
    return false;
  }
}

loadModuleAvailability();
