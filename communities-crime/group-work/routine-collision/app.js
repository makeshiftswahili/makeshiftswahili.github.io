(() => {
  const data = window.ROUTINE_COLLISION_DATA;
  if (!data) {
    document.body.innerHTML = '<p style="padding:40px;color:white">Activity data failed to load.</p>';
    return;
  }

  const state = {
    stage: 1,
    initialRisk: 3,
    selectedTime: 0,
    clockRisk: 3,
    collisionChoice: null,
    interventionAnswers: {},
    prediction: null,
    predictionReason: null
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function streetViewUrl(site) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(site.lat + ',' + site.lng)}`;
  }

  function showStage(stageNumber) {
    state.stage = stageNumber;
    $$('.stage').forEach(panel => panel.classList.toggle('active', Number(panel.dataset.stagePanel) === stageNumber));
    $$('.stage-tab').forEach(tab => tab.classList.toggle('active', Number(tab.dataset.stage) === stageNumber));
    window.scrollTo({ top: Math.max(0, $('.stage-nav').offsetTop - 16), behavior: 'smooth' });
  }

  function initHeader() {
    if (data.status?.prototype) $('#prototypeBadge').classList.remove('is-hidden');
  }

  function initStageOne() {
    const site = data.sites.A;
    $('#siteAName').textContent = `${site.name} · ${site.neighborhood}`;
    $('#siteACoordinates').textContent = `${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}`;
    $('#siteAStreetView').href = streetViewUrl(site);

    $('#observationGrid').innerHTML = data.observations.map((label, index) => `
      <label class="choice-chip">
        <input type="checkbox" value="${index}">
        <span>${label}</span>
      </label>
    `).join('');

    $('#initialRisk').addEventListener('input', event => {
      state.initialRisk = Number(event.target.value);
      $('#initialRiskValue').textContent = `${state.initialRisk} / 5`;
    });
  }

  function renderTimeline() {
    $('#timeLabels').innerHTML = data.timeline.map(item => `<span>${item.label}</span>`).join('');
    const item = data.timeline[state.selectedTime];
    $('#selectedTime').textContent = item.label;
    $('#peopleList').innerHTML = item.people.map(person => `
      <div class="person-row">
        <strong>${person.name}</strong>
        <span>${person.detail}</span>
      </div>
    `).join('');

    const meters = [
      ['Potential target presence', item.conditions.targets, 'targets'],
      ['Capable guardianship', item.conditions.guardians, 'guardians'],
      ['Offender access / familiarity', item.conditions.offenderAccess, 'access'],
      ['Target dwell time', item.conditions.dwell, 'dwell']
    ];
    $('#conditionMeters').innerHTML = meters.map(([label, value, cls]) => `
      <div class="condition-meter ${cls}">
        <div class="meter-label"><span>${label}</span><span>${value}/5</span></div>
        <div class="meter-track"><div class="meter-fill" style="width:${value * 20}%"></div></div>
      </div>
    `).join('');

    $('#clockFeedback').classList.add('is-hidden');
    $('#clockContinue').classList.add('is-hidden');
  }

  function initStageTwo() {
    renderTimeline();
    $('#timeSlider').addEventListener('input', event => {
      state.selectedTime = Number(event.target.value);
      renderTimeline();
    });
    $('#clockRisk').addEventListener('input', event => {
      state.clockRisk = Number(event.target.value);
      $('#clockRiskValue').textContent = `${state.clockRisk} / 5`;
    });
    $('#checkClock').addEventListener('click', () => {
      const item = data.timeline[state.selectedTime];
      const delta = state.clockRisk - item.recommended;
      let comparison = 'Your rating matches the scenario cue.';
      if (delta >= 1) comparison = 'Your group rated the opportunity conditions higher than the scenario cue.';
      if (delta <= -1) comparison = 'Your group rated the opportunity conditions lower than the scenario cue.';
      $('#clockFeedback').innerHTML = `<strong>${item.label}:</strong> ${comparison} The scenario reference is ${item.recommended}/5. Pay attention to the joint pattern: targets, guardianship, offender access, and dwell time can move in different directions.`;
      $('#clockFeedback').classList.remove('is-hidden');
      $('#clockContinue').classList.remove('is-hidden');
    });
  }

  function routineMarkup(routine) {
    return routine.map(([time, place]) => `<div class="routine-stop"><time>${time}</time><span>${place}</span></div>`).join('');
  }

  function drawCollisionDiagram(showAnswer = false) {
    const collision = data.collision;
    const lookup = new Map(collision.nodes.map(node => [node.id, node]));
    const svg = $('#collisionDiagram');

    function pathPoints(ids) {
      return ids.map(id => {
        const node = lookup.get(id);
        return `${node.x},${node.y}`;
      }).join(' ');
    }

    svg.innerHTML = `
      <title id="collisionDiagramTitle">Schematic activity-space diagram</title>
      <desc id="collisionDiagramDesc">A simplified diagram showing the routine paths of Marcus and Elena through several activity nodes.</desc>
      <polyline class="offender-path" points="${pathPoints(collision.offenderPath)}"></polyline>
      <polyline class="target-path" points="${pathPoints(collision.targetPath)}"></polyline>
      ${collision.nodes.map(node => `
        <g>
          <circle class="diagram-node ${showAnswer && node.id === collision.answer ? 'answer' : ''}" cx="${node.x}" cy="${node.y}" r="34"></circle>
          <text class="diagram-label" x="${node.x}" y="${node.y}">${node.label}</text>
        </g>
      `).join('')}
      <line x1="44" y1="25" x2="94" y2="25" class="offender-path"></line>
      <text x="104" y="30" class="diagram-legend">Marcus routine path</text>
      <line x1="255" y1="25" x2="305" y2="25" class="target-path"></line>
      <text x="315" y="30" class="diagram-legend">Elena routine path</text>
    `;
  }

  function initStageThree() {
    $('#offenderName').textContent = data.collision.offender.name;
    $('#targetName').textContent = data.collision.target.name;
    $('#offenderRoutine').innerHTML = routineMarkup(data.collision.offender.routine);
    $('#targetRoutine').innerHTML = routineMarkup(data.collision.target.routine);
    drawCollisionDiagram(false);

    const uniqueLabels = [...new Map(data.collision.nodes.map(node => [node.label, node])).values()];
    $('#collisionChoices').innerHTML = uniqueLabels.map(node => `<button class="collision-choice" type="button" data-collision-choice="${node.id}">${node.label}</button>`).join('');

    $$('.collision-choice').forEach(button => {
      button.addEventListener('click', () => {
        state.collisionChoice = button.dataset.collisionChoice;
        const correctNode = data.collision.answer;
        $$('.collision-choice').forEach(choice => {
          choice.classList.remove('selected', 'correct', 'incorrect');
          if (choice.dataset.collisionChoice === correctNode) choice.classList.add('correct');
        });
        button.classList.add(state.collisionChoice === correctNode ? 'correct' : 'incorrect');
        drawCollisionDiagram(true);
        $('#collisionFeedback').innerHTML = state.collisionChoice === correctNode
          ? `<strong>Yes.</strong> ${data.collision.explanation}`
          : `<strong>Not the strongest convergence.</strong> ${data.collision.explanation}`;
        $('#collisionFeedback').classList.remove('is-hidden');
      });
    });
  }

  function initStageFour() {
    $('#interventionList').innerHTML = data.interventions.map(item => `
      <article class="intervention-card" data-intervention="${item.id}">
        <h3>${item.title}</h3>
        <p>${item.detail}</p>
        <div class="effect-row" role="group" aria-label="Predicted effect of ${item.title}">
          <button class="effect-choice" type="button" data-effect="lower">Lower opportunity</button>
          <button class="effect-choice" type="button" data-effect="higher">Higher opportunity</button>
          <button class="effect-choice" type="button" data-effect="ambiguous">Ambiguous / mixed</button>
        </div>
        <div class="intervention-result is-hidden"></div>
      </article>
    `).join('');

    $$('.intervention-card').forEach(card => {
      const item = data.interventions.find(entry => entry.id === card.dataset.intervention);
      card.querySelectorAll('.effect-choice').forEach(button => {
        button.addEventListener('click', () => {
          const selected = button.dataset.effect;
          state.interventionAnswers[item.id] = selected;
          card.querySelectorAll('.effect-choice').forEach(choice => choice.classList.toggle('selected', choice === button));
          const result = card.querySelector('.intervention-result');
          const correct = selected === item.answer;
          result.className = `intervention-result ${correct ? 'correct' : 'incorrect'}`;
          result.textContent = item.explanation;
          card.classList.add('answered');
        });
      });
    });
  }

  function renderComparison() {
    const ids = data.comparison.siteIds;
    $('#comparisonSites').innerHTML = ids.map(id => {
      const site = data.sites[id];
      return `
        <article class="comparison-card">
          <div class="site-label">Site ${site.id} · ${site.neighborhood}</div>
          <h3>${site.name}</h3>
          <p class="coordinate-text">${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}</p>
          <a class="streetview-button" href="${streetViewUrl(site)}" target="_blank" rel="noopener noreferrer">Open Street View ↗</a>
          <p class="comparison-prompt">Look for nodes, paths, waiting, visibility, activity generators, and how routine populations may differ by time.</p>
        </article>
      `;
    }).join('');

    $('#predictionChoices').innerHTML = ids.map(id => {
      const site = data.sites[id];
      return `<button class="prediction-choice" type="button" data-prediction="${id}">Site ${id} · ${site.name}</button>`;
    }).join('');

    $$('.prediction-choice').forEach(button => {
      button.addEventListener('click', () => {
        state.prediction = button.dataset.prediction;
        $$('.prediction-choice').forEach(choice => choice.classList.toggle('selected', choice === button));
      });
    });

    $('#predictionReason').addEventListener('change', event => {
      state.predictionReason = event.target.value || null;
    });

    $('#lockPrediction').addEventListener('click', () => {
      const reveal = $('#crimeReveal');
      if (!state.prediction || !state.predictionReason) {
        reveal.className = 'crime-reveal pending';
        reveal.innerHTML = '<h3>Finish the prediction first</h3><p>Choose a site and a mechanism before locking your answer.</p>';
        reveal.classList.remove('is-hidden');
        return;
      }

      const crime = data.comparison.crimeReveal;
      if (!crime) {
        reveal.className = 'crime-reveal pending';
        reveal.innerHTML = `
          <h3>Prediction locked: Site ${state.prediction}</h3>
          <p>Your mechanism: <strong>${$('#predictionReason').selectedOptions[0].textContent}</strong>.</p>
          <p><strong>Crime-data reveal is not loaded yet.</strong> The instructor will add the point-level Boston crime data after the activity shell is finalized. Your prediction is still useful: it forces the mechanism to come before the outcome.</p>
        `;
      } else {
        const predicted = data.sites[state.prediction];
        const outcome = crime.winner === state.prediction ? 'matched' : 'did not match';
        reveal.className = 'crime-reveal';
        reveal.innerHTML = `
          <h3>Crime-data reveal</h3>
          <p>Your prediction for <strong>${predicted.name}</strong> ${outcome} the instructor dataset.</p>
          <div class="reveal-grid">
            ${ids.map(id => {
              const site = data.sites[id];
              const stat = crime.sites[id];
              return `<div class="reveal-stat"><span>Site ${id} · ${site.name}</span><strong>${stat.display}</strong><span>${stat.label}</span></div>`;
            }).join('')}
          </div>
          <p>${crime.explanation}</p>
        `;
      }
      reveal.classList.remove('is-hidden');
    });
  }

  function initNavigation() {
    $$('.stage-tab').forEach(tab => tab.addEventListener('click', () => showStage(Number(tab.dataset.stage))));
    $$('[data-next-stage]').forEach(button => button.addEventListener('click', () => showStage(Number(button.dataset.nextStage))));
    $$('[data-prev-stage]').forEach(button => button.addEventListener('click', () => showStage(Number(button.dataset.prevStage))));
    $('#restartActivity').addEventListener('click', () => window.location.reload());
  }

  initHeader();
  initStageOne();
  initStageTwo();
  initStageThree();
  initStageFour();
  renderComparison();
  initNavigation();
})();
