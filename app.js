const elements = {
  setupForm: document.querySelector("#setupForm"),
  startButton: document.querySelector("#startButton"),
  restartButton: document.querySelector("#restartButton"),
  startScreen: document.querySelector("#startScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  soloOptions: document.querySelector("#soloOptions"),
  tandemOptions: document.querySelector("#tandemOptions"),
  statusMessage: document.querySelector("#statusMessage"),
  modeLabel: document.querySelector("#modeLabel"),
  deckLabel: document.querySelector("#deckLabel"),
  turnBanner: document.querySelector("#turnBanner"),
  currentTurnLabel: document.querySelector("#currentTurnLabel"),
  currentGoalLabel: document.querySelector("#currentGoalLabel"),
  scoreboard: document.querySelector("#scoreboard"),
  board: document.querySelector("#board"),
  checkPanel: document.querySelector("#checkPanel"),
  checkKicker: document.querySelector("#checkKicker"),
  checkTitle: document.querySelector("#checkTitle"),
  checkPrompts: document.querySelector("#checkPrompts"),
  answerDetails: document.querySelector("#answerDetails"),
  showAnswerButton: document.querySelector("#showAnswerButton"),
  wrongButton: document.querySelector("#wrongButton"),
  correctButton: document.querySelector("#correctButton"),
};

const state = {
  vocabulary: [],
  config: null,
  deck: [],
  selectedCards: [],
  pendingMatch: null,
  pendingChallenge: null,
  lockBoard: false,
  attempts: 0,
  matchedPairs: 0,
  totalPairs: 0,
  players: [],
  currentPlayerIndex: 0,
  boardColumns: 4,
  scores: {
    solo: 0,
    thomas: 0,
    teacher: 0,
    team: 0,
  },
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireEvents();
  updateModeOptions();

  // Fetch keeps the vocabulary database local while still matching browser rules.
  try {
    const response = await fetch("vocabulary.json");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const vocabulary = await response.json();
    state.vocabulary = validateVocabulary(vocabulary);
    elements.startButton.disabled = false;
    elements.startButton.textContent = "Start Game";
    hideStatus();
  } catch (error) {
    showStatus(
      "Could not load vocabulary.json. Please run the app through a local server: python3 -m http.server",
      "error",
    );
    elements.startButton.textContent = "Vocabulary not loaded";
    console.error(error);
  }
}

function wireEvents() {
  document.querySelectorAll('input[name="playMode"]').forEach((input) => {
    input.addEventListener("change", updateModeOptions);
  });

  elements.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startGame();
  });

  elements.restartButton.addEventListener("click", () => {
    resetBoardState();
    elements.startScreen.hidden = false;
    elements.gameScreen.hidden = true;
    elements.restartButton.hidden = true;
    hideCheckPanel();
    hideStatus();
  });

  elements.board.addEventListener("click", (event) => {
    const cardButton = event.target.closest(".memory-card");
    if (!cardButton) return;
    handleCardClick(cardButton.dataset.uid);
  });

  elements.showAnswerButton.addEventListener("click", toggleAnswerDetails);
  elements.correctButton.addEventListener("click", acceptPendingMatch);
  elements.wrongButton.addEventListener("click", rejectPendingMatch);
  window.addEventListener("resize", updateBoardCoordinates);
}

function validateVocabulary(vocabulary) {
  if (!Array.isArray(vocabulary)) {
    throw new Error("vocabulary.json must contain an array.");
  }

  const requiredFields = [
    "id",
    "type",
    "category",
    "emoji",
    "de",
    "en",
    "thai",
    "thai_romanized",
    "difficulty",
  ];

  vocabulary.forEach((item, index) => {
    requiredFields.forEach((field) => {
      if (!(field in item)) {
        throw new Error(`Vocabulary item ${index + 1} is missing "${field}".`);
      }
    });
  });

  return vocabulary;
}

function updateModeOptions() {
  const mode = document.querySelector('input[name="playMode"]:checked').value;
  const isSolo = mode === "solo";
  elements.soloOptions.hidden = !isSolo;
  elements.tandemOptions.hidden = isSolo;
}

function startGame() {
  hideStatus();
  resetBoardState();

  state.config = readConfig();
  const concepts = chooseConcepts(state.config);

  if (state.config.mode === "tandem") {
    setupTandemPlayers(state.config);
    state.deck = shuffle(
      concepts.flatMap((concept) => buildTandemCardsForConcept(concept, state.config)),
    );
    state.totalPairs = state.deck.length;
  } else {
    // Solo mode keeps the classic memory rule: two cards per concept, match by id.
    state.totalPairs = concepts.length;
    state.deck = shuffle(concepts.flatMap((concept) => buildCardsForConcept(concept, state.config)));
  }

  elements.startScreen.hidden = true;
  elements.gameScreen.hidden = false;
  elements.restartButton.hidden = false;
  elements.modeLabel.textContent = getModeLabel(state.config);
  elements.deckLabel.textContent =
    state.config.mode === "tandem"
      ? `${concepts.length} concepts / ${state.deck.length} challenge cards`
      : `${concepts.length} concepts / ${concepts.length * 2} cards`;

  renderScoreboard();
  renderBoard();
  renderTurnBanner();
}

function readConfig() {
  return {
    mode: document.querySelector('input[name="playMode"]:checked').value,
    learningDirection: document.querySelector("#learningDirection").value,
    playerCount: Number(document.querySelector('input[name="playerCount"]:checked')?.value || 2),
    deckSize: Number(document.querySelector('input[name="deckSize"]:checked').value),
    category: document.querySelector("#category").value,
  };
}

function chooseConcepts(config) {
  const pool =
    config.category === "all"
      ? state.vocabulary
      : state.vocabulary.filter((item) => item.category === config.category);

  const selected = shuffle(pool).slice(0, config.deckSize);

  if (selected.length < config.deckSize) {
    showStatus(`Only ${selected.length} concepts are available for this category.`, "error");
  }

  return selected;
}

function buildCardsForConcept(concept, config) {
  const pair = getCardPair(concept, config);

  return pair.map((card, index) => ({
    uid: `${concept.id}-${index}-${makeId()}`,
    conceptId: concept.id,
    concept,
    flipped: false,
    matched: false,
    ...card,
  }));
}

function getCardPair(concept, config) {
  // The concept id is the real match key; the visible language sides can differ.
  switch (config.learningDirection) {
    case "de_en_to_thai":
      return [germanEnglishCard(concept), thaiRomanizedCard(concept)];
    case "en_to_thai":
      return [englishCard(concept), thaiRomanizedCard(concept)];
    case "thai_to_en":
      return [thaiOnlyCard(concept), englishCard(concept)];
    case "thai_to_de":
      return [thaiOnlyCard(concept), germanCard(concept)];
    case "de_to_thai":
      return [germanCard(concept), thaiRomanizedCard(concept)];
    default:
      return [germanEnglishCard(concept), thaiRomanizedCard(concept)];
  }
}

function germanEnglishCard(concept) {
  return {
    cardKind: "German + English",
    lines: [concept.de, concept.en],
  };
}

function thaiRomanizedCard(concept) {
  return {
    cardKind: "Thai",
    lines: [concept.thai, concept.thai_romanized],
  };
}

function thaiOnlyCard(concept) {
  return {
    cardKind: "Thai",
    lines: [concept.thai],
  };
}

function englishCard(concept) {
  return {
    cardKind: "English",
    lines: [concept.en],
  };
}

function germanCard(concept) {
  return {
    cardKind: "German",
    lines: [concept.de],
  };
}

function setupTandemPlayers(config) {
  const players = [
    {
      id: "thomas",
      name: "Thomas",
      scoreKey: "thomas",
      goal: "Say Thai",
    },
  ];

  if (config.playerCount === 2) {
    players.push({
      id: "teacher",
      name: "Teacher",
      scoreKey: "teacher",
      goal: "Say English",
    });
  }

  state.players = players;
  state.currentPlayerIndex = 0;
}

function buildTandemCardsForConcept(concept, config) {
  const thomasCard = {
    uid: `${concept.id}-thomas-${makeId()}`,
    conceptId: concept.id,
    concept,
    flipped: false,
    matched: false,
    feedback: "",
    mode: "tandem",
    playerId: "thomas",
    playerName: "Thomas",
    scoreKey: "thomas",
    goal: "Say Thai",
    frontKind: "English",
    frontLines: [concept.en],
    frontHelper: concept.de,
    backKind: "Thai answer",
    backLines: [concept.thai, concept.thai_romanized],
    backHelper: "Thomas says Thai",
  };

  if (config.playerCount === 1) {
    return [thomasCard];
  }

  return [
    thomasCard,
    {
      uid: `${concept.id}-teacher-${makeId()}`,
      conceptId: concept.id,
      concept,
      flipped: false,
      matched: false,
      feedback: "",
      mode: "tandem",
      playerId: "teacher",
      playerName: "Teacher",
      scoreKey: "teacher",
      goal: "Say English",
      frontKind: "Thai",
      frontLines: [concept.thai, concept.thai_romanized],
      frontHelper: "",
      backKind: "English answer",
      backLines: [concept.en],
      backHelper: `German helper: ${concept.de}`,
    },
  ];
}

function handleCardClick(uid) {
  if (state.config?.mode === "tandem") {
    handleTandemCardClick(uid);
    return;
  }

  if (state.lockBoard || state.pendingMatch) return;

  const card = state.deck.find((item) => item.uid === uid);
  if (!card || card.flipped || card.matched) return;

  card.flipped = true;
  state.selectedCards.push(card);
  renderBoard();

  if (state.selectedCards.length === 2) {
    resolveTurn();
  }
}

function handleTandemCardClick(uid) {
  if (state.lockBoard || state.pendingChallenge) return;

  const card = state.deck.find((item) => item.uid === uid);
  if (!card || card.flipped || card.matched) return;

  const currentPlayer = getCurrentPlayer();
  if (card.playerId !== currentPlayer.id) {
    showStatus(`${currentPlayer.name} is up. Pick a ${currentPlayer.name} card.`, "error");
    return;
  }

  hideStatus();
  card.flipped = true;
  state.pendingChallenge = { card };
  state.lockBoard = true;
  state.attempts += 1;

  renderBoard();
  renderScoreboard();
  renderTurnBanner();

  window.setTimeout(() => {
    showTandemPanel(card);
  }, 250);
}

function resolveTurn() {
  state.attempts += 1;
  const [firstCard, secondCard] = state.selectedCards;

  // Matching cards are held open until the learner or host confirms the spoken answer.
  if (firstCard.conceptId === secondCard.conceptId) {
    state.pendingMatch = {
      cards: [firstCard, secondCard],
      concept: firstCard.concept,
    };
    state.lockBoard = true;
    renderScoreboard();
    showCheckPanel(firstCard.concept);
    return;
  }

  state.lockBoard = true;
  renderScoreboard();

  window.setTimeout(() => {
    firstCard.flipped = false;
    secondCard.flipped = false;
    state.selectedCards = [];
    state.lockBoard = false;
    renderBoard();
  }, 850);
}

function showCheckPanel(concept) {
  const prompts = getPrompts(concept, state.config);

  elements.checkPanel.classList.remove("tandem-panel");
  // The panel is intentionally explicit for screen sharing: everyone can see who says what.
  elements.checkKicker.textContent = state.config.mode === "solo" ? "Self Check" : "Say-to-Win";
  elements.checkTitle.textContent = concept.emoji + " " + getPanelTitle(concept);
  elements.checkPrompts.innerHTML = prompts
    .map(
      (prompt) => `
        <div class="prompt-row">
          <span>${escapeHtml(prompt.label)}</span>
          <strong>${escapeHtml(prompt.value)}</strong>
          ${prompt.helper ? `<p class="helper-note">${escapeHtml(prompt.helper)}</p>` : ""}
        </div>
      `,
    )
    .join("");

  elements.answerDetails.innerHTML = buildAnswerDetails(concept);
  elements.answerDetails.hidden = true;
  elements.showAnswerButton.textContent = "Show Answer";
  elements.checkPanel.hidden = false;
}

function showTandemPanel(card) {
  elements.checkPanel.classList.add("tandem-panel");
  elements.checkKicker.textContent = "Tandem Check";
  elements.checkTitle.textContent = `${card.playerName}: ${card.goal}`;
  elements.checkPrompts.innerHTML = `
    <div class="prompt-row">
      <span>Card showed</span>
      <strong>${escapeHtml(card.frontLines.join(" / "))}</strong>
      ${card.frontHelper ? `<p class="helper-note">${escapeHtml(card.frontHelper)}</p>` : ""}
    </div>
    <div class="prompt-row">
      <span>Answer</span>
      <strong>${escapeHtml(card.backLines.join(" / "))}</strong>
      ${card.backHelper ? `<p class="helper-note">${escapeHtml(card.backHelper)}</p>` : ""}
    </div>
  `;
  elements.answerDetails.innerHTML = buildAnswerDetails(card.concept);
  elements.answerDetails.hidden = true;
  elements.showAnswerButton.textContent = "Show Answer";
  elements.correctButton.textContent = "Correct";
  elements.wrongButton.textContent = "Wrong";
  elements.checkPanel.hidden = false;
}

function getPrompts(concept, config) {
  const target = getSoloTarget(concept, config.learningDirection);

  return [
    {
      label: "Say this out loud",
      value: target.say,
    },
    {
      label: "Target answer",
      value: target.answer,
    },
    {
      label: "Thai romanized",
      value: concept.thai_romanized,
    },
  ];
}

function getSoloTarget(concept, learningDirection) {
  switch (learningDirection) {
    case "thai_to_en":
      return {
        say: concept.en,
        answer: concept.en,
      };
    case "thai_to_de":
      return {
        say: concept.de,
        answer: concept.de,
      };
    case "de_to_thai":
    case "en_to_thai":
    case "de_en_to_thai":
    default:
      return {
        say: `${concept.thai_romanized} (${concept.thai})`,
        answer: concept.thai,
      };
  }
}

function getPanelTitle(concept) {
  return state.config.mode === "solo" ? "Check your answer" : "Say the word";
}

function buildAnswerDetails(concept) {
  const rows = [
    ["German", concept.de],
    ["English", concept.en],
    ["Thai", concept.thai],
    ["Thai romanized", concept.thai_romanized],
    ["Category", concept.category],
    ["Difficulty", String(concept.difficulty)],
  ];

  return `
    <div class="answer-grid">
      ${rows
        .map(
          ([label, value]) => `
            <div>
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function toggleAnswerDetails() {
  const shouldShow = elements.answerDetails.hidden;
  elements.answerDetails.hidden = !shouldShow;
  elements.showAnswerButton.textContent = shouldShow ? "Hide Answer" : "Show Answer";
}

function acceptPendingMatch() {
  if (state.config?.mode === "tandem") {
    acceptPendingChallenge();
    return;
  }

  if (!state.pendingMatch) return;

  state.pendingMatch.cards.forEach((card) => {
    card.matched = true;
    card.flipped = true;
  });

  state.matchedPairs += 1;

  state.scores.solo += 10;

  clearPendingTurn();
  renderBoard();
  renderScoreboard();
  checkForFinishedGame();
}

function rejectPendingMatch() {
  if (state.config?.mode === "tandem") {
    rejectPendingChallenge();
    return;
  }

  if (!state.pendingMatch) return;

  state.pendingMatch.cards.forEach((card) => {
    card.flipped = false;
  });

  clearPendingTurn();
  renderBoard();
  renderScoreboard();
}

function acceptPendingChallenge() {
  if (!state.pendingChallenge) return;

  const { card } = state.pendingChallenge;
  card.matched = true;
  card.flipped = true;
  card.feedback = "";

  state.matchedPairs += 1;
  state.scores[card.scoreKey] += 1;
  state.scores.team += 1;

  clearPendingChallenge();
  advancePlayer();
  renderBoard();
  renderScoreboard();
  renderTurnBanner();
  checkForFinishedGame();
}

function rejectPendingChallenge() {
  if (!state.pendingChallenge) return;

  const { card } = state.pendingChallenge;
  card.feedback = "wrong";
  hideCheckPanel();
  renderBoard();

  window.setTimeout(() => {
    card.feedback = "";
    card.flipped = false;
    clearPendingChallenge();
    advancePlayer();
    renderBoard();
    renderScoreboard();
    renderTurnBanner();
  }, 700);
}

function clearPendingTurn() {
  state.selectedCards = [];
  state.pendingMatch = null;
  state.lockBoard = false;
  hideCheckPanel();
}

function clearPendingChallenge() {
  state.pendingChallenge = null;
  state.lockBoard = false;
  hideCheckPanel();
}

function hideCheckPanel() {
  elements.checkPanel.hidden = true;
  elements.answerDetails.hidden = true;
  elements.checkPanel.classList.remove("tandem-panel");
}

function checkForFinishedGame() {
  if (state.matchedPairs !== state.totalPairs) return;

  const message =
    state.config.mode === "solo"
      ? `Finished: ${state.scores.solo} points in ${state.attempts} attempts.`
      : `Finished: team score ${state.scores.team} in ${state.attempts} attempts.`;

  showStatus(message, "success");
}

function renderBoard() {
  elements.board.classList.toggle("tandem-board", state.config?.mode === "tandem");
  elements.board.innerHTML = state.deck
    .map((card, index) => renderCard(card, getCardCoordinate(index)))
    .join("");
  window.requestAnimationFrame(updateBoardCoordinates);
}

function renderCard(card, coordinate) {
  if (state.config?.mode === "tandem") {
    return renderTandemCard(card, coordinate);
  }

  const statusClass = [
    "memory-card",
    card.flipped ? "is-revealed" : "",
    card.matched ? "is-matched" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lineMarkup = card.lines
    .map(
      (line, index) =>
        `<span class="${index === 0 ? "primary" : "secondary"}">${escapeHtml(line)}</span>`,
    )
    .join("");

    return `
    <button class="${statusClass}" type="button" data-uid="${escapeHtml(card.uid)}" data-base-label="Memory card" aria-label="${escapeHtml(coordinate)} Memory card">
      <span class="card-inner">
        <span class="card-face card-front">
          <span class="card-coordinate">${escapeHtml(coordinate)}</span>
          <strong>?</strong>
        </span>
        <span class="card-face card-back">
          <span class="card-coordinate">${escapeHtml(coordinate)}</span>
          <span class="card-emoji" aria-hidden="true">${escapeHtml(card.concept.emoji)}</span>
          <span class="card-lines">${lineMarkup}</span>
          <span class="card-tag">${escapeHtml(card.cardKind)}</span>
        </span>
      </span>
    </button>
  `;
}

function renderTandemCard(card, coordinate) {
  const currentPlayer = getCurrentPlayer();
  const isCurrentPlayer = card.playerId === currentPlayer.id;
  const isWaiting = !card.matched && !isCurrentPlayer;
  const isDisabled = state.lockBoard || state.pendingChallenge || card.matched || !isCurrentPlayer;
  const statusClass = [
    "memory-card",
    "tandem-card",
    card.flipped ? "is-revealed" : "",
    card.matched ? "is-matched" : "",
    card.feedback === "wrong" ? "is-wrong" : "",
    isCurrentPlayer ? "is-current-player" : "",
    isWaiting ? "is-waiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <button class="${statusClass}" type="button" data-uid="${escapeHtml(card.uid)}" data-base-label="${escapeHtml(card.playerName)} challenge card" aria-label="${escapeHtml(coordinate)} ${escapeHtml(card.playerName)} challenge card" ${isDisabled ? "disabled" : ""}>
      <span class="card-inner">
        ${renderTandemFace("card-front", coordinate, card.concept.emoji, card.frontKind, card.frontLines, card.frontHelper, card.playerName)}
        ${renderTandemFace("card-back", coordinate, card.concept.emoji, card.backKind, card.backLines, card.backHelper, card.goal)}
      </span>
    </button>
  `;
}

function renderTandemFace(faceClass, coordinate, emoji, label, lines, helper, owner) {
  const lineMarkup = lines
    .map(
      (line, index) =>
        `<span class="${index === 0 ? "primary" : "secondary"}">${escapeHtml(line)}</span>`,
    )
    .join("");

  return `
    <span class="card-face ${faceClass}">
      <span class="card-coordinate">${escapeHtml(coordinate)}</span>
      <span class="challenge-owner">${escapeHtml(owner)}</span>
      <span class="card-emoji" aria-hidden="true">${escapeHtml(emoji)}</span>
      <span class="card-lines">${lineMarkup}</span>
      ${helper ? `<span class="card-helper">${escapeHtml(helper)}</span>` : ""}
      <span class="card-tag">${escapeHtml(label)}</span>
    </span>
  `;
}

function renderScoreboard() {
  const items =
    state.config?.mode === "tandem"
      ? [
          ["Turn", getCurrentPlayer().name],
          ["Thomas", state.scores.thomas],
          ...(state.config.playerCount === 2 ? [["Teacher", state.scores.teacher]] : []),
          ["Team", state.scores.team],
          ["Attempts", state.attempts],
          ["Solved", `${state.matchedPairs}/${state.totalPairs}`],
        ]
      : [
          ["Score", state.scores.solo],
          ["Attempts", state.attempts],
          ["Matched", `${state.matchedPairs}/${state.totalPairs}`],
        ];

  elements.scoreboard.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="score-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </div>
      `,
    )
    .join("");
}

function renderTurnBanner() {
  if (state.config?.mode !== "tandem") {
    elements.turnBanner.hidden = true;
    return;
  }

  const currentPlayer = getCurrentPlayer();
  elements.currentTurnLabel.textContent = currentPlayer.name;
  elements.currentGoalLabel.textContent = currentPlayer.goal;
  elements.turnBanner.hidden = false;
}

function getModeLabel(config) {
  if (config.mode === "tandem") {
    return config.playerCount === 2
      ? "Tandem Flip Game: Thomas + Teacher"
      : "Tandem Flip Game: Thomas";
  }

  const labels = {
    de_en_to_thai: "Solo: German/English -> Thai",
    en_to_thai: "Solo: English -> Thai",
    thai_to_en: "Solo: Thai -> English",
    thai_to_de: "Solo: Thai -> German",
    de_to_thai: "Solo: German -> Thai",
  };

  return labels[config.learningDirection];
}

function resetBoardState() {
  state.deck = [];
  state.selectedCards = [];
  state.pendingMatch = null;
  state.pendingChallenge = null;
  state.lockBoard = false;
  state.attempts = 0;
  state.matchedPairs = 0;
  state.totalPairs = 0;
  state.players = [];
  state.currentPlayerIndex = 0;
  state.boardColumns = 4;
  state.scores = {
    solo: 0,
    thomas: 0,
    teacher: 0,
    team: 0,
  };
  elements.turnBanner.hidden = true;
}

function updateBoardCoordinates() {
  if (!state.deck.length) return;

  const columns = getRenderedColumnCount();
  if (columns === state.boardColumns) return;

  state.boardColumns = columns;
  elements.board.querySelectorAll(".memory-card").forEach((cardElement, index) => {
    const coordinate = getCardCoordinate(index);
    const baseLabel = cardElement.dataset.baseLabel || "Memory card";
    cardElement.setAttribute("aria-label", `${coordinate} ${baseLabel}`);
    cardElement.querySelectorAll(".card-coordinate").forEach((badge) => {
      badge.textContent = coordinate;
    });
  });
}

function getRenderedColumnCount() {
  const columns = getComputedStyle(elements.board).gridTemplateColumns
    .split(" ")
    .filter(Boolean).length;

  return Math.max(1, columns || state.boardColumns || 1);
}

function getCardCoordinate(index) {
  const columnIndex = index % state.boardColumns;
  const rowIndex = Math.floor(index / state.boardColumns) + 1;
  return `${getColumnLabel(columnIndex)}${rowIndex}`;
}

function getColumnLabel(index) {
  let label = "";
  let number = index;

  do {
    label = String.fromCharCode(65 + (number % 26)) + label;
    number = Math.floor(number / 26) - 1;
  } while (number >= 0);

  return label;
}

function getCurrentPlayer() {
  return state.players[state.currentPlayerIndex] || {
    id: "thomas",
    name: "Thomas",
    scoreKey: "thomas",
    goal: "Say Thai",
  };
}

function advancePlayer() {
  if (state.players.length < 2) return;

  for (let step = 1; step <= state.players.length; step += 1) {
    const nextIndex = (state.currentPlayerIndex + step) % state.players.length;
    const nextPlayer = state.players[nextIndex];
    const hasOpenCard = state.deck.some(
      (card) => card.playerId === nextPlayer.id && !card.matched,
    );

    if (hasOpenCard) {
      state.currentPlayerIndex = nextIndex;
      return;
    }
  }
}

function showStatus(message, type = "") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`.trim();
  elements.statusMessage.hidden = false;
}

function hideStatus() {
  elements.statusMessage.hidden = true;
  elements.statusMessage.textContent = "";
  elements.statusMessage.className = "status-message";
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
