(() => {
  const slotTimes = {
    "2026-09-22-1330-inperson": { start: "2026-09-22T13:30:00-05:00", end: "2026-09-22T14:00:00-05:00" },
    "2026-09-22-1400-inperson": { start: "2026-09-22T14:00:00-05:00", end: "2026-09-22T14:30:00-05:00" },
    "2026-09-23-1500-zoom": { start: "2026-09-23T15:00:00-05:00", end: "2026-09-23T15:30:00-05:00" },
    "2026-09-23-1530-zoom": { start: "2026-09-23T15:30:00-05:00", end: "2026-09-23T16:00:00-05:00" },
    "2026-09-23-1600-zoom": { start: "2026-09-23T16:00:00-05:00", end: "2026-09-23T16:30:00-05:00" },
    "2026-09-23-1630-zoom": { start: "2026-09-23T16:30:00-05:00", end: "2026-09-23T17:00:00-05:00" },
    "2026-09-24-1630-inperson": { start: "2026-09-24T16:30:00-05:00", end: "2026-09-24T17:00:00-05:00" },
    "2026-09-24-1700-inperson": { start: "2026-09-24T17:00:00-05:00", end: "2026-09-24T17:30:00-05:00" },
    "2026-09-25-1400-zoom": { start: "2026-09-25T14:00:00-05:00", end: "2026-09-25T14:30:00-05:00" },
    "2026-09-25-1430-zoom": { start: "2026-09-25T14:30:00-05:00", end: "2026-09-25T15:00:00-05:00" },
    "2026-09-25-1500-zoom": { start: "2026-09-25T15:00:00-05:00", end: "2026-09-25T15:30:00-05:00" },
    "2026-09-25-1530-zoom": { start: "2026-09-25T15:30:00-05:00", end: "2026-09-25T16:00:00-05:00" }
  };

  function eventTimes(slotKey) {
    return slotTimes[slotKey] || null;
  }

  function outlookUrl({ slotKey, subject, body, location }) {
    const times = eventTimes(slotKey);
    if (!times) return "#";

    const params = new URLSearchParams({
      rru: "addevent",
      path: "/calendar/action/compose",
      allday: "false",
      startdt: new Date(times.start).toISOString(),
      enddt: new Date(times.end).toISOString(),
      subject,
      body,
      location
    });

    return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  window.SACalendar = { eventTimes, outlookUrl };
})();