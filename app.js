const elements = {
  setupForm: document.querySelector("#setupForm"),
  startButton: document.querySelector("#startButton"),
  restartButton: document.querySelector("#restartButton"),
  startMenuButton: document.querySelector("#startMenuButton"),
  searchMenuButton: document.querySelector("#searchMenuButton"),
  impressumMenuButton: document.querySelector("#impressumMenuButton"),
  privacyMenuButton: document.querySelector("#privacyMenuButton"),
  startScreen: document.querySelector("#startScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  searchScreen: document.querySelector("#searchScreen"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  searchResults: document.querySelector("#searchResults"),
  impressumScreen: document.querySelector("#impressumScreen"),
  privacyScreen: document.querySelector("#privacyScreen"),
  memoryOptions: document.querySelector("#memoryOptions"),
  tandemOptions: document.querySelector("#tandemOptions"),
  lessonOptions: document.querySelector("#lessonOptions"),
  lessonTree: document.querySelector("#lessonTree"),
  statusMessage: document.querySelector("#statusMessage"),
  modeLabel: document.querySelector("#modeLabel"),
  deckLabel: document.querySelector("#deckLabel"),
  turnBanner: document.querySelector("#turnBanner"),
  currentTurnLabel: document.querySelector("#currentTurnLabel"),
  currentGoalLabel: document.querySelector("#currentGoalLabel"),
  scoreboard: document.querySelector("#scoreboard"),
  board: document.querySelector("#board"),
  reviewSummary: document.querySelector("#reviewSummary"),
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
  curriculum: null,
  lessonEntries: [],
  lessonCache: new Map(),
  searchIndexReady: false,
  vocabulary: [],
  config: null,
  currentView: "start",
  deck: [],
  selectedCards: [],
  pendingMatch: null,
  pendingPrompt: null,
  lockBoard: false,
  attempts: 0,
  matchedPairs: 0,
  totalPairs: 0,
  players: [],
  currentPlayerIndex: 0,
  boardColumns: 4,
  reviewDeck: [],
  reviewIndex: 0,
  reviewResults: [],
  scores: {
    thomas: 0,
    teacher: 0,
    team: 0,
    memory: 0,
    flashcardCorrect: 0,
    flashcardWrong: 0,
  },
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireEvents();
  updateModeOptions();

  // Fetch keeps the lesson catalog local while still matching browser rules.
  try {
    const response = await fetch("curriculum.json");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const curriculum = await response.json();
    state.curriculum = validateCurriculum(curriculum);
    state.lessonEntries = buildLessonEntries(state.curriculum);
    renderLessonTree(state.curriculum);
    updateModeOptions();
    setActiveView("start");
    elements.startButton.disabled = false;
    elements.startButton.textContent = "Start Game";
    hideStatus();
  } catch (error) {
    showStatus(
      "Could not load curriculum.json. Please run the app through a local server: python3 -m http.server",
      "error",
    );
    elements.startButton.textContent = "Lesson data not loaded";
    console.error(error);
  }
}

function wireEvents() {
  elements.startMenuButton.addEventListener("click", () => setActiveView("start"));
  elements.searchMenuButton.addEventListener("click", () => setActiveView("search"));
  elements.impressumMenuButton.addEventListener("click", () => setActiveView("impressum"));
  elements.privacyMenuButton.addEventListener("click", () => setActiveView("privacy"));

  document.querySelectorAll('input[name="playMode"]').forEach((input) => {
    input.addEventListener("change", updateModeOptions);
  });

  elements.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void startGame().catch((error) => {
      showStatus(
        "Could not load one of the selected lesson files. Please run the app through a local server: python3 -m http.server",
        "error",
      );
      console.error(error);
    });
  });

  elements.restartButton.addEventListener("click", () => {
    resetBoardState();
    hideCheckPanel();
    hideStatus();
    setActiveView("start");
  });

  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void searchLessons().catch((error) => {
      showSearchResults(
        [],
        "Search failed. Please run the app through a local server: python3 -m http.server",
      );
      console.error(error);
    });
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
    throw new Error("Lesson files must contain an array.");
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
        throw new Error(`Lesson item ${index + 1} is missing "${field}".`);
      }
    });
  });

  return vocabulary;
}

function validateCurriculum(curriculum) {
  if (!curriculum || typeof curriculum !== "object" || !Array.isArray(curriculum.courses)) {
    throw new Error("curriculum.json must contain a courses array.");
  }

  curriculum.courses.forEach((course, courseIndex) => {
    if (!course.id || !course.label || !Array.isArray(course.teachers)) {
      throw new Error(`Course ${courseIndex + 1} is missing id, label, or teachers.`);
    }

    course.teachers.forEach((teacher, teacherIndex) => {
      if (!teacher.id || !teacher.label || !Array.isArray(teacher.lessons)) {
        throw new Error(`Teacher ${teacherIndex + 1} in ${course.id} is missing data.`);
      }

      teacher.lessons.forEach((lesson, lessonIndex) => {
        if (!lesson.id || !lesson.label || !lesson.file) {
          throw new Error(`Lesson ${lessonIndex + 1} in ${course.id}/${teacher.id} is missing data.`);
        }
      });
    });
  });

  return curriculum;
}

function buildLessonEntries(curriculum) {
  const entries = [];

  curriculum.courses.forEach((course) => {
    course.teachers.forEach((teacher) => {
      teacher.lessons.forEach((lesson) => {
        entries.push({
          courseLabel: course.label,
          teacherLabel: teacher.label,
          lessonLabel: lesson.label,
          file: lesson.file,
          count: lesson.count,
        });
      });
    });
  });

  return entries;
}

function renderLessonTree(curriculum) {
  const courseMarkup = curriculum.courses
    .map((course) => {
      const teacherMarkup = course.teachers
        .map((teacher) => {
          const lessonMarkup = teacher.lessons
            .map((lesson) => {
              const checkboxId = `lesson-${course.id}-${teacher.id}-${lesson.id}`;
              return `
                <label class="lesson-option" for="${escapeHtml(checkboxId)}">
                  <input
                    id="${escapeHtml(checkboxId)}"
                    type="checkbox"
                    name="lessonSet"
                    value="${escapeHtml(lesson.file)}"
                    checked
                  />
                  <span>
                    <strong>${escapeHtml(lesson.label)}</strong>
                    <em>${escapeHtml(teacher.label)} · ${escapeHtml(String(lesson.count || 0))} cards</em>
                  </span>
                </label>
              `;
            })
            .join("");

          return `
            <div class="lesson-teacher">
              <h4>${escapeHtml(teacher.label)}</h4>
              <div class="lesson-list">${lessonMarkup}</div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="lesson-course">
          <h3>${escapeHtml(course.label)}</h3>
          <div class="lesson-course-grid">${teacherMarkup}</div>
        </section>
      `;
    })
    .join("");

  elements.lessonTree.innerHTML = courseMarkup;
}

async function loadSelectedLessons(lessonFiles) {
  const loadedLessons = await Promise.all(lessonFiles.map((file) => loadLessonFile(file)));
  const unique = new Map();

  loadedLessons.flat().forEach((concept) => {
    unique.set(concept.id, concept);
  });

  return Array.from(unique.values());
}

async function loadLessonFile(file) {
  if (state.lessonCache.has(file)) {
    return state.lessonCache.get(file);
  }

  const response = await fetch(file);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${file}`);
  }

  const lessonItems = validateVocabulary(await response.json());
  state.lessonCache.set(file, lessonItems);
  return lessonItems;
}

async function ensureSearchIndex() {
  if (state.searchIndexReady) {
    return;
  }

  await Promise.all(state.lessonEntries.map((entry) => loadLessonFile(entry.file)));
  state.searchIndexReady = true;
}

function updateModeOptions() {
  const mode = document.querySelector('input[name="playMode"]:checked').value;
  const showMemory = mode === "memory";
  const showTandem = mode === "tandem";
  elements.memoryOptions.hidden = !showMemory;
  elements.tandemOptions.hidden = !showTandem;
  elements.lessonOptions.hidden = !state.curriculum;
}

function setActiveView(view) {
  state.currentView = view;

  const isStart = view === "start";
  const isGame = view === "game";
  const isSearch = view === "search";
  const isImpressum = view === "impressum";
  const isPrivacy = view === "privacy";

  elements.startScreen.hidden = !isStart;
  elements.gameScreen.hidden = !isGame;
  elements.searchScreen.hidden = !isSearch;
  elements.impressumScreen.hidden = !isImpressum;
  elements.privacyScreen.hidden = !isPrivacy;
  elements.restartButton.hidden = !isGame;

  document.querySelectorAll(".menu-button").forEach((button) => {
    button.classList.remove("is-active");
  });

  const activeButton =
    view === "start"
      ? elements.startMenuButton
      : view === "search"
        ? elements.searchMenuButton
        : view === "impressum"
          ? elements.impressumMenuButton
          : view === "privacy"
            ? elements.privacyMenuButton
            : null;

  if (activeButton) {
    activeButton.classList.add("is-active");
  }
}

function normalizeSearchText(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ɔ]/g, "o")
    .replace(/[ə]/g, "e")
    .replace(/[ʉ]/g, "u")
    .replace(/[ŋ]/g, "ng")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function searchLessons() {
  const query = elements.searchInput.value.trim();

  if (!query) {
    showSearchResults([], "Type a word or phrase first.");
    return;
  }

  await ensureSearchIndex();

  const normalizedQuery = normalizeSearchText(query);
  const results = [];

  for (const entry of state.lessonEntries) {
    const words = state.lessonCache.get(entry.file) || [];

    words.forEach((concept) => {
      const haystack = [
        concept.de,
        concept.en,
        concept.thai,
        concept.thai_romanized,
        concept.id,
      ]
        .map(normalizeSearchText)
        .join(" ");

      if (haystack.includes(normalizedQuery)) {
        results.push({ entry, concept });
      }
    });
  }

  showSearchResults(results, query);
}

function showSearchResults(results, query) {
  if (!query) {
    elements.searchResults.innerHTML = "";
    return;
  }

  if (!results.length) {
    elements.searchResults.innerHTML = `
      <div class="search-empty">
        <strong>No lesson found</strong>
        <p>Search term: ${escapeHtml(query)}</p>
      </div>
    `;
    return;
  }

  elements.searchResults.innerHTML = `
    <div class="search-meta">
      <strong>${results.length} match${results.length === 1 ? "" : "es"}</strong>
      <span>Search term: ${escapeHtml(query)}</span>
    </div>
    <div class="search-result-list">
      ${results
        .map(({ entry, concept }) => {
          const fileName = entry.file.split("/").pop();
          return `
            <article class="search-result">
              <div class="search-result-head">
                <strong>${escapeHtml(concept.en)}</strong>
                <span>${escapeHtml(entry.teacherLabel)} · ${escapeHtml(fileName)}</span>
              </div>
              <div class="search-result-body">
                <span>${escapeHtml(concept.de)}</span>
                <span>${escapeHtml(concept.thai)} · ${escapeHtml(concept.thai_romanized)}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

async function startGame() {
  hideStatus();
  resetBoardState();

  state.config = readConfig();
  const lessons = state.config.selectedLessons;

  if (!lessons.length) {
    showStatus("Please choose at least one lesson.", "error");
    return;
  }

  const lessonPool = await loadSelectedLessons(lessons);
  state.vocabulary = lessonPool;
  const concepts = chooseConcepts(state.config, lessonPool);

  if (state.config.mode === "memory") {
    // Memory mode keeps the classic rule: two cards per concept, match by id.
    state.totalPairs = concepts.length;
    state.deck = shuffle(concepts.flatMap((concept) => buildCardsForConcept(concept, state.config)));
  } else if (state.config.mode === "tandem") {
    setupTandemPlayers(state.config);
    state.deck = shuffle(
      concepts.flatMap((concept, index) => buildPromptDeck(concept, index, "tandem")),
    );
    state.totalPairs = state.deck.length;
  } else {
    state.reviewDeck = shuffle(
      concepts.flatMap((concept, index) => buildPromptDeck(concept, index, "flashcards")),
    );
    state.reviewIndex = 0;
    state.reviewResults = [];
    state.totalPairs = state.reviewDeck.length;
    state.deck = [];
  }

  setActiveView("game");
  elements.modeLabel.textContent = getModeLabel(state.config);
  elements.deckLabel.textContent = getDeckLabel(state.config, concepts.length);

  renderScoreboard();
  renderBoard();
  renderTurnBanner();
  renderReviewSummary();
}

function readConfig() {
  return {
    mode: document.querySelector('input[name="playMode"]:checked').value,
    learningDirection: document.querySelector("#learningDirection").value,
    playerCount: Number(document.querySelector('input[name="playerCount"]:checked')?.value || 2),
    deckSize: Number(document.querySelector('input[name="deckSize"]:checked').value),
    selectedLessons: Array.from(document.querySelectorAll('input[name="lessonSet"]:checked')).map(
      (input) => input.value,
    ),
  };
}

function chooseConcepts(config, pool) {
  const selected = shuffle(pool).slice(0, config.deckSize);

  if (selected.length < config.deckSize) {
    showStatus(`Only ${selected.length} concepts are available in the selected lessons.`, "error");
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

function buildPromptDeck(concept, index, mode) {
  const promptDirection = index % 2 === 0 ? "en_to_thai" : "thai_to_en";
  const promptCard = createPromptCard(concept, promptDirection, mode);
  return [promptCard];
}

function createPromptCard(concept, promptDirection, mode) {
  const isEnglishPrompt = promptDirection === "en_to_thai";
  const frontLines = isEnglishPrompt ? [concept.en] : [concept.thai, concept.thai_romanized];
  const answerLines = isEnglishPrompt ? [concept.thai, concept.thai_romanized] : [concept.en];
  const answerLanguage = isEnglishPrompt ? "Thai" : "English";

  return {
    uid: `${concept.id}-${promptDirection}-${makeId()}`,
    conceptId: concept.id,
    concept,
    flipped: false,
    matched: false,
    feedback: "",
    mode,
    promptDirection,
    promptLanguage: isEnglishPrompt ? "English" : "Thai",
    answerLanguage,
    frontKind: isEnglishPrompt ? "English" : "Thai",
    frontLines,
    frontHelper: "",
    backKind: `${answerLanguage} answer`,
    backLines: answerLines,
    backHelper: isEnglishPrompt
      ? `Romanized: ${concept.thai_romanized} / German helper: ${concept.de}`
      : `German helper: ${concept.de}`,
  };
}

function handleCardClick(uid) {
  if (state.config?.mode === "tandem") {
    handleTandemCardClick(uid);
    return;
  }

  if (state.config?.mode === "flashcards") {
    handleFlashcardClick(uid);
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
  if (state.lockBoard || state.pendingPrompt) return;

  const card = state.deck.find((item) => item.uid === uid);
  if (!card || card.flipped || card.matched) return;

  hideStatus();
  card.flipped = true;
  state.pendingPrompt = { card };
  state.lockBoard = true;
  state.attempts += 1;

  renderBoard();
  renderScoreboard();
  renderTurnBanner();

  window.setTimeout(() => {
    showTandemPanel(card);
  }, 250);
}

function handleFlashcardClick(uid) {
  if (state.lockBoard || state.pendingPrompt) return;

  const card = state.reviewDeck[state.reviewIndex];
  if (!card || card.uid !== uid || card.flipped || card.matched) return;

  hideStatus();
  card.flipped = true;
  state.pendingPrompt = { card, reviewMode: true };
  state.lockBoard = true;
  state.attempts += 1;
  renderBoard();
  renderScoreboard();

  window.setTimeout(() => {
    showFlashcardPanel(card);
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
  elements.checkKicker.textContent = "Self Check";
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
  const currentPlayer = getCurrentPlayer();
  elements.checkKicker.textContent = "Tandem Check";
  elements.checkTitle.textContent = `${currentPlayer.name} should answer`;
  elements.checkPrompts.innerHTML = `
    <div class="prompt-row">
      <span>Card prompt</span>
      <strong>${escapeHtml(card.frontLines.join(" / "))}</strong>
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

function showFlashcardPanel(card) {
  elements.checkPanel.classList.add("tandem-panel");
  elements.checkKicker.textContent = "Flashcard Review";
  elements.checkTitle.textContent = "Check yourself";
  elements.checkPrompts.innerHTML = `
    <div class="prompt-row">
      <span>Prompt</span>
      <strong>${escapeHtml(card.frontLines.join(" / "))}</strong>
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
  return state.config.mode === "tandem" ? "Say the word" : "Check your answer";
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
    acceptPendingPrompt();
    return;
  }

  if (state.config?.mode === "flashcards") {
    acceptPendingFlashcard();
    return;
  }

  if (!state.pendingMatch) return;

  state.pendingMatch.cards.forEach((card) => {
    card.matched = true;
    card.flipped = true;
  });

  state.matchedPairs += 1;
  state.scores.memory += 10;

  clearPendingTurn();
  renderBoard();
  renderScoreboard();
  checkForFinishedGame();
}

function rejectPendingMatch() {
  if (state.config?.mode === "tandem") {
    rejectPendingPrompt();
    return;
  }

  if (state.config?.mode === "flashcards") {
    rejectPendingFlashcard();
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

function acceptPendingPrompt() {
  if (!state.pendingPrompt) return;

  const { card } = state.pendingPrompt;
  card.matched = true;
  card.flipped = true;
  card.feedback = "";

  state.matchedPairs += 1;
  state.scores[getCurrentPlayer().scoreKey] += 1;
  state.scores.team += 1;

  clearPendingPrompt();
  advancePlayer();
  renderBoard();
  renderScoreboard();
  renderTurnBanner();
  checkForFinishedGame();
}

function rejectPendingPrompt() {
  if (!state.pendingPrompt) return;

  const { card } = state.pendingPrompt;
  card.feedback = "wrong";
  hideCheckPanel();
  renderBoard();

  window.setTimeout(() => {
    card.feedback = "";
    card.flipped = false;
    clearPendingPrompt();
    advancePlayer();
    renderBoard();
    renderScoreboard();
    renderTurnBanner();
  }, 700);
}

function acceptPendingFlashcard() {
  if (!state.pendingPrompt) return;

  const { card } = state.pendingPrompt;
  card.matched = true;
  card.flipped = true;
  card.feedback = "";

  state.reviewResults.push({
    card,
    result: "correct",
  });
  state.scores.flashcardCorrect += 1;

  clearPendingPrompt();
  advanceFlashcard();
}

function rejectPendingFlashcard() {
  if (!state.pendingPrompt) return;

  const { card } = state.pendingPrompt;
  card.feedback = "wrong";
  hideCheckPanel();
  renderBoard();

  window.setTimeout(() => {
    card.feedback = "";
    card.flipped = false;
    state.reviewResults.push({
      card,
      result: "wrong",
    });
    state.scores.flashcardWrong += 1;
    clearPendingPrompt();
    advanceFlashcard();
  }, 700);
}

function clearPendingTurn() {
  state.selectedCards = [];
  state.pendingMatch = null;
  state.lockBoard = false;
  hideCheckPanel();
}

function clearPendingPrompt() {
  state.pendingPrompt = null;
  state.lockBoard = false;
  hideCheckPanel();
}

function hideCheckPanel() {
  elements.checkPanel.hidden = true;
  elements.answerDetails.hidden = true;
  elements.checkPanel.classList.remove("tandem-panel");
}

function checkForFinishedGame() {
  if (state.config?.mode !== "memory") return;
  if (state.matchedPairs !== state.totalPairs) return;

  const message =
    `Finished: ${state.scores.memory} points in ${state.attempts} attempts.`;

  showStatus(message, "success");
}

function renderBoard() {
  elements.board.classList.toggle("tandem-board", state.config?.mode === "tandem");
  elements.board.classList.toggle("flashcard-board", state.config?.mode === "flashcards");

  if (state.config?.mode === "flashcards") {
    const card = state.reviewDeck[state.reviewIndex];
    elements.board.innerHTML = card ? renderFlashcard(card, getCardCoordinate(0)) : "";
    elements.board.hidden = !card && state.reviewResults.length === 0;
    window.requestAnimationFrame(updateBoardCoordinates);
    renderReviewSummary();
    return;
  }

  elements.board.hidden = false;
  elements.board.innerHTML =
    state.config?.mode === "memory"
      ? state.deck.map((card, index) => renderCard(card, getCardCoordinate(index))).join("")
      : state.deck.map((card, index) => renderCard(card, getCardCoordinate(index))).join("");
  window.requestAnimationFrame(updateBoardCoordinates);
  renderReviewSummary();
}

function renderCard(card, coordinate) {
  if (state.config?.mode === "tandem") {
    return renderTandemCard(card, coordinate);
  }

  if (state.config?.mode === "flashcards") {
    return renderFlashcard(card);
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
  const statusClass = [
    "memory-card",
    "tandem-card",
    card.flipped ? "is-revealed" : "",
    card.matched ? "is-matched" : "",
    card.feedback === "wrong" ? "is-wrong" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <button class="${statusClass}" type="button" data-uid="${escapeHtml(card.uid)}" data-base-label="Tandem card" aria-label="${escapeHtml(coordinate)} Tandem card">
      <span class="card-inner">
        ${renderTandemFace("card-front", coordinate, card.concept.emoji, card.frontKind, card.frontLines, card.frontHelper)}
        ${renderTandemFace("card-back", coordinate, card.concept.emoji, card.backKind, card.backLines, card.backHelper)}
      </span>
    </button>
  `;
}

function renderTandemFace(faceClass, coordinate, emoji, label, lines, helper) {
  const isFront = faceClass.includes("card-front");
  const lineMarkup = lines
    .map(
      (line, index) =>
        `<span class="${index === 0 ? "primary" : "secondary"}">${escapeHtml(line)}</span>`,
    )
    .join("");

  return `
      <span class="card-face ${faceClass}">
      <span class="card-coordinate">${escapeHtml(coordinate)}</span>
      <span class="card-emoji" aria-hidden="true">${escapeHtml(emoji)}</span>
      <span class="card-lines">${lineMarkup}</span>
      ${!isFront && helper ? `<span class="card-helper">${escapeHtml(helper)}</span>` : ""}
      ${isFront ? "" : `<span class="card-tag">${escapeHtml(label)}</span>`}
    </span>
  `;
}

function renderFlashcard(card, coordinate) {
  const statusClass = [
    "memory-card",
    "flashcard-card",
    card.flipped ? "is-revealed" : "",
    card.matched ? "is-matched" : "",
    card.feedback === "wrong" ? "is-wrong" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lineMarkup = card.frontLines
    .map(
      (line, index) =>
        `<span class="${index === 0 ? "primary" : "secondary"}">${escapeHtml(line)}</span>`,
    )
    .join("");

  const answerMarkup = card.backLines
    .map(
      (line, index) =>
        `<span class="${index === 0 ? "primary" : "secondary"}">${escapeHtml(line)}</span>`,
    )
    .join("");

  return `
    <button class="${statusClass}" type="button" data-uid="${escapeHtml(card.uid)}" data-base-label="Flashcard" aria-label="${escapeHtml(coordinate)} Flashcard">
      <span class="card-inner">
        <span class="card-face card-front">
          <span class="card-coordinate">${escapeHtml(coordinate)}</span>
          <span class="card-emoji" aria-hidden="true">${escapeHtml(card.concept.emoji)}</span>
          <span class="card-lines">${lineMarkup}</span>
        </span>
        <span class="card-face card-back">
          <span class="card-coordinate">${escapeHtml(coordinate)}</span>
          <span class="card-emoji" aria-hidden="true">${escapeHtml(card.concept.emoji)}</span>
          <span class="card-lines">${answerMarkup}</span>
          ${card.backHelper ? `<span class="card-helper">${escapeHtml(card.backHelper)}</span>` : ""}
          <span class="card-tag">${escapeHtml(card.answerLanguage)}</span>
        </span>
      </span>
    </button>
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
      : state.config?.mode === "flashcards"
        ? [
            ["Correct", state.scores.flashcardCorrect],
            ["Wrong", state.scores.flashcardWrong],
            ["Remaining", `${Math.max(0, state.totalPairs - state.reviewResults.length)}`],
            ["Reviewed", `${state.reviewResults.length}/${state.totalPairs}`],
          ]
      : [
          ["Score", state.scores.memory],
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
      ? "Tandem Practice: Thomas + Teacher"
      : "Tandem Practice: Thomas";
  }

  if (config.mode === "flashcards") {
    return "Flashcard Review";
  }

  const labels = {
    memory: "Memory Match",
    de_en_to_thai: "Memory: German/English -> Thai",
    en_to_thai: "Memory: English -> Thai",
    thai_to_en: "Memory: Thai -> English",
    thai_to_de: "Memory: Thai -> German",
    de_to_thai: "Memory: German -> Thai",
  };

  return labels[config.learningDirection];
}

function getDeckLabel(config, conceptCount) {
  const lessonCount = config.selectedLessons?.length || 0;
  const lessonSuffix = lessonCount ? ` from ${lessonCount} lesson${lessonCount === 1 ? "" : "s"}` : "";

  if (config.mode === "flashcards") {
    return `${conceptCount} flashcards${lessonSuffix}`;
  }

  if (config.mode === "tandem") {
    return `${conceptCount} tandem prompts${lessonSuffix}`;
  }

  return `${conceptCount} concepts${lessonSuffix}`;
}

function resetBoardState() {
  state.deck = [];
  state.selectedCards = [];
  state.pendingMatch = null;
  state.pendingPrompt = null;
  state.lockBoard = false;
  state.attempts = 0;
  state.matchedPairs = 0;
  state.totalPairs = 0;
  state.players = [];
  state.currentPlayerIndex = 0;
  state.boardColumns = 4;
  state.reviewDeck = [];
  state.reviewIndex = 0;
  state.reviewResults = [];
  state.scores = {
    thomas: 0,
    teacher: 0,
    team: 0,
    memory: 0,
    flashcardCorrect: 0,
    flashcardWrong: 0,
  };
  elements.turnBanner.hidden = true;
  elements.reviewSummary.hidden = true;
}

function advanceFlashcard() {
  state.reviewIndex += 1;
  state.pendingPrompt = null;
  state.lockBoard = false;
  renderBoard();
  renderScoreboard();
  renderReviewSummary();
  hideCheckPanel();

  if (state.reviewIndex >= state.reviewDeck.length) {
    showReviewFinished();
    return;
  }
}

function renderReviewSummary() {
  if (state.config?.mode !== "flashcards") {
    elements.reviewSummary.hidden = true;
    elements.reviewSummary.innerHTML = "";
    return;
  }

  if (!state.reviewResults.length && state.reviewIndex === 0) {
    elements.reviewSummary.hidden = true;
    elements.reviewSummary.innerHTML = "";
    return;
  }

  const items = state.reviewResults
    .map((entry, index) => {
      const front = entry.card.frontLines.join(" / ");
      const back = entry.card.backLines.join(" / ");
      return `
        <div class="review-item ${entry.result}">
          <strong>${index + 1}. ${escapeHtml(front)}</strong>
          <span>${escapeHtml(back)}</span>
          <em>${entry.result === "correct" ? "Correct" : "Wrong"}</em>
        </div>
      `;
    })
    .join("");

  elements.reviewSummary.hidden = false;
  elements.reviewSummary.innerHTML = `
    <div class="review-summary-head">
      <strong>${state.scores.flashcardCorrect} correct</strong>
      <strong>${state.scores.flashcardWrong} wrong</strong>
      <strong>${Math.max(0, state.totalPairs - state.reviewResults.length)} remaining</strong>
    </div>
    <div class="review-summary-list">${items}</div>
  `;
}

function showReviewFinished() {
  elements.board.innerHTML = "";
  elements.reviewSummary.hidden = false;
  elements.reviewSummary.innerHTML = `
    <div class="review-finished">
      <h3>Review complete</h3>
      <p>${state.scores.flashcardCorrect} correct, ${state.scores.flashcardWrong} wrong.</p>
    </div>
    <div class="review-summary-list">
      ${state.reviewResults
        .map((entry, index) => `
          <div class="review-item ${entry.result}">
            <strong>${index + 1}. ${escapeHtml(entry.card.frontLines.join(" / "))}</strong>
            <span>${escapeHtml(entry.card.backLines.join(" / "))}</span>
            <em>${entry.result === "correct" ? "Correct" : "Wrong"}</em>
          </div>
        `)
        .join("")}
    </div>
  `;
  showStatus(`Flashcard review finished: ${state.scores.flashcardCorrect} correct, ${state.scores.flashcardWrong} wrong.`, "success");
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
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
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
