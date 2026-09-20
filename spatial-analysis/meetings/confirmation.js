const confirmationCard = document.getElementById("confirmationCard");
const missingCard = document.getElementById("missingCard");
const studentName = document.getElementById("studentName");
const meetingDate = document.getElementById("meetingDate");
const meetingTime = document.getElementById("meetingTime");
const meetingFormat = document.getElementById("meetingFormat");
const zoomDetails = document.getElementById("zoomDetails");
const outlookButton = document.getElementById("outlookButton");

function loadConfirmation() {
  let booking = null;
  try {
    booking = JSON.parse(sessionStorage.getItem("sa_meeting_confirmation") || "null");
  } catch {
    booking = null;
  }

  if (!booking?.studentName || !booking?.key) {
    confirmationCard.classList.add("is-hidden");
    missingCard.classList.remove("is-hidden");
    return;
  }

  studentName.textContent = booking.studentName;
  meetingDate.textContent = booking.date;
  meetingTime.textContent = booking.time;
  meetingFormat.textContent = booking.modality;

  const isZoom = booking.modality === "Zoom";
  zoomDetails.classList.toggle("is-hidden", !isZoom);

  const body = isZoom
    ? "SOCL7213 meeting with Dr. Williams.\n\nZoom meeting ID: 828 756 0198.\nYou will be placed in a waiting room when you join."
    : "SOCL7213 in-person meeting with Dr. Williams.";

  outlookButton.href = window.SACalendar.outlookUrl({
    slotKey: booking.key,
    subject: "SOCL7213 meeting with Dr. Williams",
    body,
    location: isZoom ? "Zoom — Meeting ID 828 756 0198" : "In person"
  });
}

loadConfirmation();