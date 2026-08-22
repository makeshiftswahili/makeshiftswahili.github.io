window.ROUTINE_COLLISION_DATA = {status: {prototype: false,note: "Boston robbery point data are loaded from the course data directory and analyzed in the browser."},robberyDataUrl: "../../data/robbery_boston.geojson",hotspotAnalysis: {radiusMeters: 200,separationMeters: 500,topN: 6,comparisonRadiusMeters: 400},observations: ["Transit stop or station","Retail / commercial frontage","Food or nightlife activity","Parking or loading area","Residential entrances","Institutional / civic use","Places where people wait","Long or obstructed sight lines","Multiple routes in and out","Quiet side street nearby"],sites: {A: {id: "A",name: "Nubian Square",neighborhood: "Roxbury",lat: 42.32937,lng: -71.08397},B: {id: "B",name: "Uphams Corner",neighborhood: "Dorchester",lat: 42.31911,lng: -71.06863},C: {id: "C",name: "Fields Corner",neighborhood: "Dorchester",lat: 42.30000,lng: -71.06169}},timeline: [{label: "6:00 PM",recommended: 2,people: [{ name: "Commuters", detail: "Heavy arrivals, transfers, and pedestrian flow." },{ name: "Store workers", detail: "Most storefronts are open; employees and customers are present." },{ name: "Residents", detail: "People are returning home, running errands, and waiting for transit." },{ name: "Informal guardians", detail: "High visibility from workers, riders, drivers, and passersby." }],conditions: { targets: 4, guardians: 5, offenderAccess: 3, dwell: 3 }},{label: "9:00 PM",recommended: 3,people: [{ name: "Evening customers", detail: "Restaurants and convenience businesses still generate foot traffic." },{ name: "Transit riders", detail: "Service continues, but crowding is lower than rush hour." },{ name: "Closing workers", detail: "Some employees begin leaving individually." },{ name: "Guardians", detail: "Still present, but fewer storefronts and passersby provide surveillance." }],conditions: { targets: 4, guardians: 3, offenderAccess: 3, dwell: 3 }},{label: "11:30 PM",recommended: 4,people: [{ name: "Late-shift workers", detail: "A small number leave work and walk toward transit or parked cars." },{ name: "Waiting riders", detail: "Longer headways increase the time some people remain at the node." },{ name: "Late-night customers", detail: "A few businesses still attract people who are not all local residents." },{ name: "Guardians", detail: "Fewer workers and pedestrians remain; surveillance is more intermittent." }],conditions: { targets: 4, guardians: 2, offenderAccess: 4, dwell: 5 }},{label: "1:00 AM",recommended: 3,people: [{ name: "Sparse riders", detail: "Fewer targets are present, but those who remain may wait longer." },{ name: "Closing staff", detail: "The last workers leave a shrinking number of open businesses." },{ name: "Through traffic", detail: "Vehicles continue through the corridor with little pedestrian activity." },{ name: "Guardians", detail: "Very low pedestrian guardianship, but also fewer potential targets." }],conditions: { targets: 2, guardians: 1, offenderAccess: 3, dwell: 4 }}],collision: {offender: {name: "Marcus",routine: [["4:30 PM", "Home"],["5:00–9:00", "Auto shop job"],["9:30–11:00", "Friend's apartment"],["11:15", "Convenience store"],["11:35", "Transit hub"],["12:05 AM", "Home"]]},target: {name: "Elena",routine: [["3:00–5:00", "College"],["5:30–11:20", "Restaurant job"],["11:35", "Transit hub"],["12:10 AM", "Home"]]},nodes: [{ id: "home-west", label: "Home", x: 95, y: 260 },{ id: "auto", label: "Auto shop", x: 230, y: 95 },{ id: "friend", label: "Friend", x: 390, y: 80 },{ id: "store", label: "Store", x: 535, y: 150 },{ id: "hub", label: "Transit hub", x: 670, y: 205 },{ id: "college", label: "College", x: 225, y: 285 },{ id: "restaurant", label: "Restaurant", x: 470, y: 285 },{ id: "home-east", label: "Home", x: 820, y: 285 }],offenderPath: ["home-west", "auto", "friend", "store", "hub", "home-west"],targetPath: ["college", "restaurant", "hub", "home-east"],answer: "hub",explanation: "Both routine paths place Marcus and Elena at the transit hub at about 11:35 PM. Crime Pattern Theory makes the node important because it lies within Marcus's routine awareness space; Routine Activities Theory makes the timing important because a suitable target and reduced guardianship can converge there."},interventions: [{id: "frequent-transit",title: "Transit runs every 10 minutes until midnight",detail: "Late-shift workers spend less time waiting at the node.",answer: "lower",explanation: "Lower expected opportunity: shorter target dwell time reduces the window for convergence, even though the physical node is unchanged."},{id: "group-exit",title: "Restaurant staff leave together after closing",detail: "Instead of walking to transit individually, four employees leave as a group.",answer: "lower",explanation: "Lower expected opportunity: co-workers can function as capable guardians for one another during the trip to and wait at transit."},{id: "store-closes",title: "The convenience store begins closing at 9 PM",detail: "Late-night customers and store employees disappear from the node.",answer: "ambiguous",explanation: "Ambiguous: there may be fewer targets, but the loss of workers and customers can also reduce informal guardianship. A land-use change can alter several RAT elements at once."},{id: "late-food",title: "A late-night food counter opens until 2 AM",detail: "More people stop at the node after 11 PM, and employees remain visible inside.",answer: "ambiguous",explanation: "Ambiguous: additional activity can create more potential targets while simultaneously increasing guardianship and pedestrian presence. 'More activity' is not mechanically criminogenic."}],comparison: {siteIds: ["B", "C"],crimeReveal: null}};

// Group identity uses full names rather than LSU IDs.
(() => {
  if (window.__ccGroupNamesMode) return;
  window.__ccGroupNamesMode = true;

  const replaceCopy = value => String(value || "")
    .replace(/Group LSU IDs/g, "Group members")
    .replace(/LSU IDs/g, "full names")
    .replace(/LSU ID/g, "full name")
    .replace(/group member IDs/gi, "group members")
    .replace(/Edit IDs/g, "Edit names")
    .replace(/IDs updated/g, "Names updated")
    .replace(/Saving full names/g, "Saving names");

  function patchNode(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const next = replaceCopy(root.nodeValue);
      if (next !== root.nodeValue) root.nodeValue = next;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    const element = root.nodeType === Node.ELEMENT_NODE ? root : null;
    if (element?.matches?.("input")) {
      if (/LSU ID/i.test(element.placeholder || "")) element.placeholder = "Full name";
      element.inputMode = "text";
      element.maxLength = 120;
      element.autocomplete = "off";
    }
    root.querySelectorAll?.("input").forEach(input => {
      if (/LSU ID/i.test(input.placeholder || "")) input.placeholder = "Full name";
      input.inputMode = "text";
      if (input.maxLength > 0 && input.maxLength < 120) input.maxLength = 120;
      input.autocomplete = "off";
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const next = replaceCopy(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  patchNode(document.body);
  new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(patchNode));
    mutations.forEach(mutation => {
      if (mutation.type === "characterData") patchNode(mutation.target);
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    let nextInit = init;
    if (url.includes("/functions/v1/microspatial-convergence") && typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body);
        if (body.action === "start" || body.action === "updateMembers") {
          const names = [...document.querySelectorAll("#memberRows input")]
            .map(input => input.value.trim().replace(/\s+/g, " "))
            .filter(Boolean);
          if (names.length) body.lsuIds = names;
          nextInit = { ...init, body: JSON.stringify(body) };
        }
      } catch {}
    }
    return originalFetch(input, nextInit);
  };
})();
