(() => {
  const MICRO_API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/microspatial-convergence-admin";
  const rows = document.getElementById("microspatialRows");
  const count = document.getElementById("microspatialCount");
  const message = document.getElementById("microspatialMessage");
  if (!rows || !count || !message) return;

  let loading = false;

  function escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function format(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Chicago"
    }).format(date);
  }

  function headers() {
    return {
      "Content-Type": "application/json",
      "x-admin-key": adminKey
    };
  }

  function render(submissions) {
    count.textContent = `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`;
    if (!submissions.length) {
      rows.innerHTML = `<tr><td colspan="3" class="empty">No Microspatial Convergence Lab submissions yet.</td></tr>`;
      return;
    }

    rows.innerHTML = submissions.map(item => `
      <tr>
        <td><div class="nh-pair">${(item.lsu_ids || []).map(id => `<span>${escape(id)}</span>`).join("")}</div></td>
        <td>${escape(format(item.submitted_at))}</td>
        <td><button type="button" class="secondary small" data-micro-download="${escape(item.id)}">Download .docx</button></td>
      </tr>
    `).join("");

    rows.querySelectorAll("[data-micro-download]").forEach(button => {
      button.addEventListener("click", () => downloadSubmission(button.dataset.microDownload, button));
    });
  }

  async function load() {
    if (loading || !adminKey || adminPanel.classList.contains("is-hidden")) return;
    loading = true;
    message.textContent = "Loading activity submissions…";
    try {
      const response = await fetch(MICRO_API_URL, { method: "GET", headers: headers(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load activity submissions");
      render(payload.submissions || []);
      message.textContent = "";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      loading = false;
    }
  }

  async function downloadSubmission(sessionId, button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing…";
    message.textContent = "Preparing group summary…";
    try {
      const response = await fetch(MICRO_API_URL, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action: "download", sessionId })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not prepare group summary");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename=([^;]+)/i);
      const filename = match ? match[1].replaceAll('"', "").trim() : `microspatial_convergence_${sessionId}.docx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.textContent = "";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  const observer = new MutationObserver(() => {
    if (!adminPanel.classList.contains("is-hidden")) load();
  });
  observer.observe(adminPanel, { attributes: true, attributeFilter: ["class"] });

  refreshButton.addEventListener("click", () => window.setTimeout(load, 0));
  if (!adminPanel.classList.contains("is-hidden")) load();
})();
