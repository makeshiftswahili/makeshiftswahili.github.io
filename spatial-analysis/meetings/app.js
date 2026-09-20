const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/spatial-analysis-meetings";

const slotGroups = document.getElementById("slotGroups");
const availabilityMessage = document.getElementById("availabilityMessage");
const bookingForm = document.getElementById("bookingForm");
const studentName = document.getElementById("studentName");
const questions = document.getElementById("questions");
const bookButton = document.getElementById("bookButton");
const bookingMessage = document.getElementById("bookingMessage");

let slots = [];
let selectedSlot = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSlots() {
  const groups = new Map();
  slots.forEach(slot => {
    if (!groups.has(slot.date)) groups.set(slot.date, []);
    groups.get(slot.date).push(slot);
  });

  slotGroups.innerHTML = [...groups.entries()].map(([date, dateSlots]) => `
    <section class="slot-group">
      <h3>${escapeHtml(date)}</h3>
      <div class="slot-list">
        ${dateSlots.map(slot => `
          <div class="slot-option">
            <input type="radio" name="slot" id="slot-${escapeHtml(slot.key)}" value="${escapeHtml(slot.key)}" ${slot.available ? "" : "disabled"}>
            <label for="slot-${escapeHtml(slot.key)}">
              <span class="slot-time">${escapeHtml(slot.time)}</span>
              <span class="slot-mode">${escapeHtml(slot.modality)}</span>
              ${slot.available ? "" : '<span class="slot-taken">Already reserved</span>'}
            </label>
          </div>`).join("")}
      </div>
    </section>`).join("");

  document.querySelectorAll('input[name="slot"]').forEach(input => {
    input.addEventListener("change", () => {
      selectedSlot = input.value;
      bookButton.disabled = false;
      bookingMessage.textContent = "";
      bookingMessage.classList.remove("error");
    });
  });

  const availableCount = slots.filter(slot => slot.available).length;
  availabilityMessage.textContent = availableCount
    ? `${availableCount} of ${slots.length} meeting times currently available.`
    : "All meeting times have been reserved.";
  bookButton.disabled = !selectedSlot;
}

async function loadAvailability() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load meeting availability.");
    slots = payload.slots || [];
    if (selectedSlot && !slots.find(slot => slot.key === selectedSlot && slot.available)) selectedSlot = "";
    renderSlots();
  } catch (error) {
    availabilityMessage.textContent = error.message;
    availabilityMessage.classList.add("error");
    bookButton.disabled = true;
  }
}

bookingForm.addEventListener("submit", async event => {
  event.preventDefault();
  const name = studentName.value.trim();
  const advanceQuestions = questions.value.trim();

  if (!selectedSlot) {
    bookingMessage.textContent = "Choose an available meeting time.";
    bookingMessage.classList.add("error");
    return;
  }
  if (name.length < 3 || !name.includes(" ")) {
    bookingMessage.textContent = "Enter your full name.";
    bookingMessage.classList.add("error");
    studentName.focus();
    return;
  }

  bookButton.disabled = true;
  bookingMessage.classList.remove("error");
  bookingMessage.textContent = "Reserving your meeting…";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotKey: selectedSlot, studentName: name, questions: advanceQuestions }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not reserve that meeting time.");

    sessionStorage.setItem("sa_meeting_confirmation", JSON.stringify({
      studentName: name,
      questions: advanceQuestions,
      ...payload.booking
    }));
    window.location.href = "confirmation.html";
  } catch (error) {
    bookingMessage.textContent = error.message;
    bookingMessage.classList.add("error");
    await loadAvailability();
  }
});

loadAvailability();