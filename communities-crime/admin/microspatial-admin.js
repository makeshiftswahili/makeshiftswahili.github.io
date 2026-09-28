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
    submissions.sort((a, b) => {
      const an = Number(String(a.resume_code || "").replace(/^group/i, "")) || 999999;
      const bn = Number(String(b.resume_code || "").replace(/^group/i, "")) || 999999;
      return an - bn;
    });
    count.textContent = `${submissions.length} group${submissions.length === 1 ? "" : "s"} with resume codes`;
    if (!submissions.length) {
      rows.innerHTML = `<tr><td colspan="5" class="empty">No Microspatial Convergence Lab groups with resume codes yet.</td></tr>`;
      return;
    }

    rows.innerHTML = submissions.map(item => {
      const submitted = item.status === "submitted";
      return `
        <tr>
          <td><div class="nh-pair">${(item.lsu_ids || []).map(id => `<span>${escape(id)}</span>`).join("")}</div></td>
          <td><strong>${escape(item.resume_code || "")}</strong></td>
          <td>${escape(submitted ? "Submitted" : "In progress")}</td>
          <td>${escape(item.submitted_at ? format(item.submitted_at) : "")}</td>
          <td>${submitted
            ? `<button type="button" class="secondary small" data-micro-download="${escape(item.id)}">Download .docx</button>`
            : `<span class="muted">Reopened for editing</span>`}
          </td>
        </tr>
      `;
    }).join("");

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
