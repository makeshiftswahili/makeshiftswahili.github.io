(() => {
  const host = document.getElementById("variableSections");
  if (!host) return;

  const configs = {
    Poverty: {
      unit: "%",
      colors: ["#fee5d9", "#fcae91", "#fb6a4a", "#de2d26", "#a50f15"],
      labels: ["<10%", "10–<20%", "20–<30%", "30–<40%", "40%+"]
    },
    "Residential Stability": {
      unit: "%",
      colors: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
      labels: ["<20%", "20–<40%", "40–<60%", "60–<80%", "80%+"]
    },
    "Racial-Ethnic Heterogeneity": {
      unit: "index",
      colors: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
      labels: ["<15", "15–<30", "30–<50", "50–<65", "65+"]
    }
  };

  const style = document.createElement("style");
  style.textContent = `
    .sdt-web-legend{width:min(560px,100%);align-self:flex-end}
    .sdt-web-legend-title{display:flex;justify-content:space-between;gap:12px;margin:0 0 7px;color:#aaa;font-size:.72rem;letter-spacing:.07em;text-transform:uppercase}
    .sdt-web-legend-scale{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid #4a4a4a;border-radius:5px;overflow:hidden;background:#171717}
    .sdt-web-legend-class{min-width:0;border-right:1px solid #4a4a4a}
    .sdt-web-legend-class:last-child{border-right:0}
    .sdt-web-legend-swatch{display:block;height:18px}
    .sdt-web-legend-label{display:block;padding:6px 4px 7px;color:#ddd;font-size:.72rem;line-height:1;text-align:center;white-space:nowrap}
    @media(max-width:820px){
      .sdt-web-legend{align-self:stretch;width:100%}
      .sdt-web-legend-label{font-size:.68rem;padding-left:2px;padding-right:2px}
    }
  `;
  document.head.appendChild(style);

  function buildLegend(config) {
    const legend = document.createElement("div");
    legend.className = "sdt-web-legend";
    legend.setAttribute("aria-label", "Map class legend");

    const title = document.createElement("div");
    title.className = "sdt-web-legend-title";
    title.innerHTML = `<span>Map classes</span><span>${config.unit === "%" ? "Percent" : "Heterogeneity index"}</span>`;
    legend.appendChild(title);

    const scale = document.createElement("div");
    scale.className = "sdt-web-legend-scale";
    config.colors.forEach((color, index) => {
      const cell = document.createElement("div");
      cell.className = "sdt-web-legend-class";
      cell.innerHTML = `<span class="sdt-web-legend-swatch" style="background:${color}"></span><span class="sdt-web-legend-label">${config.labels[index]}</span>`;
      scale.appendChild(cell);
    });
    legend.appendChild(scale);
    return legend;
  }

  function refresh() {
    host.querySelectorAll(".variable-section").forEach(section => {
      const header = section.querySelector(".variable-header");
      if (!header) return;

      const variableTitle = header.querySelector("h2")?.textContent?.trim();
      const config = configs[variableTitle];
      if (!config) return;

      // The vertical PNG remains available for Word/export previews, but it is
      // not the persistent web-page legend.
      header.querySelector("img.legend-preview")?.remove();
      if (!header.querySelector(".sdt-web-legend")) header.appendChild(buildLegend(config));
    });
  }

  const observer = new MutationObserver(refresh);
  observer.observe(host, { childList: true, subtree: true });
  refresh();
})();
