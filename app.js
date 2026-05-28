// ============================================================
//  app.js — Головна логіка ПДР Тест
// ============================================================

// Clean questions data (filter out empty/header questions)
if (typeof QUESTIONS_DATA !== 'undefined' && QUESTIONS_DATA.blocks) {
  QUESTIONS_DATA.blocks.forEach(block => {
    block.questions = block.questions.filter(q => q.question && q.answers && q.answers.length > 0);
  });
}

// ─── State ───────────────────────────────────────────────────
const state = {
  currentBlock: null,
  currentQuestions: [],
  currentIndex: 0,
  studyMode: 'cards',  // 'cards' | 'quiz'
  // quiz state
  quizAnswered: false,
  quizCorrect: 0,
  // test state
  testQuestions: [],
  testIndex: 0,
  testAnswers: [],
  timerInterval: null,
  timeLeft: 20 * 60,
  testStartTime: null,
  isFullTest: false,
  isSimulation: false,
  simMistakes: 0,
};

// ─── LocalStorage helpers ─────────────────────────────────────
const LS = {
  get(key, def = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  getProgress() { return LS.get('pdr_progress', {}); },
  setProgress(p) { LS.set('pdr_progress', p); },
  getResults() { return LS.get('pdr_results', {}); },
  setResults(r) { LS.set('pdr_results', r); },
  getLearnedCards() { return LS.get('pdr_learned', {}); },
  setLearnedCards(l) { LS.set('pdr_learned', l); },
  getMistakes() { return LS.get('pdr_mistakes', []); },
  setMistakes(m) { LS.set('pdr_mistakes', m); },
  addMistake(id) {
    const m = LS.getMistakes();
    if (!m.includes(id)) {
      m.push(id);
      LS.setMistakes(m);
    }
  },
  removeMistake(id) {
    const m = LS.getMistakes();
    const idx = m.indexOf(id);
    if (idx !== -1) {
      m.splice(idx, 1);
      LS.setMistakes(m);
    }
  },
  getStarred() { return LS.get('pdr_starred', []); },
  setStarred(s) { LS.set('pdr_starred', s); },
  toggleStarred(id) {
    const s = LS.getStarred();
    const idx = s.indexOf(id);
    let starred = false;
    if (idx !== -1) {
      s.splice(idx, 1);
    } else {
      s.push(id);
      starred = true;
    }
    LS.setStarred(s);
    return starred;
  },
  isStarred(id) {
    return LS.getStarred().includes(id);
  }
};

// ─── Utils ───────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getBlockId() {
  return new URLSearchParams(location.search).get('block');
}

function isFullTestMode() {
  return new URLSearchParams(location.search).get('full') === '1';
}

function isSimulationMode() {
  return new URLSearchParams(location.search).get('sim') === '1';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 3000);
}

function getQuestionById(qId) {
  for (const block of QUESTIONS_DATA.blocks) {
    const q = block.questions.find(item => item.id === qId);
    if (q) return { q, block };
  }
  return null;
}

function getBlockForQuestion(q) {
  if (!q) return null;
  return QUESTIONS_DATA.blocks.find(b => b.questions.some(item => item.id === q.id));
}

function getPdrSectionUrl(block) {
  if (!block) return 'https://vodiy.ua/pdr/';
  const numMatch = block.title.match(/^(\d+)/);
  if (numMatch) {
    return `https://vodiy.ua/pdr/${numMatch[1]}/`;
  }
  return 'https://vodiy.ua/pdr/';
}

function toggleStarQuestion(qId, btnId) {
  const starred = LS.toggleStarred(qId);
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.classList.toggle('starred', starred);
    btn.innerHTML = starred ? '⭐' : '☆';
  }
  showToast(starred ? '⭐ Додано у вибране' : '☆ Вилучено з вибраного', 'success');
  // Update counts on home page if we are there
  if (typeof renderBlocks === 'function') {
    updateGlobalStats();
  }
}


// ─── Home Page ────────────────────────────────────────────────
function renderBlocks() {
  const grid = document.getElementById('blocks-grid');
  if (!grid) return;

  const results = LS.getResults();
  const progress = LS.getProgress();

  grid.innerHTML = QUESTIONS_DATA.blocks.map((block, idx) => {
    const blockResults = results[block.id] || [];
    const bestScore = blockResults.length > 0
      ? Math.max(...blockResults.map(r => r.score))
      : null;
    const learnedKey = `block_${block.id}`;
    const learnedCards = LS.getLearnedCards()[learnedKey] || {};
    const learnedCount = Object.values(learnedCards).filter(Boolean).length;
    const totalQ = block.questions.length;
    const progressPct = Math.round((learnedCount / totalQ) * 100);

    const icons = ['🚦','🛣️','🚗','⚠️','🚧','🏙️','🌙','🚑','🏎️','🅿️','🔄','📋','🛑','🚸','🌊'];
    const icon = icons[idx % icons.length];

    return `
      <div class="block-card glass-card animate-in" style="animation-delay:${idx * 0.05}s" data-block="${block.id}">
        <div class="block-number">${icon}</div>
        <div class="block-title">${block.title}</div>
        <div class="block-meta">
          ${totalQ} питань
          ${bestScore !== null ? `· Кращий результат: <span class="badge ${bestScore >= 90 ? 'badge-success' : 'badge-warning'}">${bestScore}%</span>` : ''}
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${progressPct}%"></div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
          ${learnedCount}/${totalQ} вивчено (${progressPct}%)
        </div>
        <div class="block-actions">
          <button class="btn btn-secondary" onclick="goStudy('${block.id}')">📖 Вивчити</button>
          <button class="btn btn-primary" onclick="goTest('${block.id}')">🎯 Тест</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateGlobalStats() {
  const totalQ = QUESTIONS_DATA.blocks.reduce((s, b) => s + b.questions.length, 0);
  const totalBlocks = QUESTIONS_DATA.blocks.length;

  const learned = LS.getLearnedCards();
  let learnedTotal = 0;
  QUESTIONS_DATA.blocks.forEach(b => {
    const lk = learned[`block_${b.id}`] || {};
    learnedTotal += Object.values(lk).filter(Boolean).length;
  });
  const progressPct = totalQ > 0 ? Math.round((learnedTotal / totalQ) * 100) : 0;

  const results = LS.getResults();
  let allScores = [];
  Object.values(results).forEach(arr => arr.forEach(r => allScores.push(r.score)));
  const best = allScores.length > 0 ? Math.max(...allScores) + '%' : '—';

  setText('total-questions', totalQ);
  setText('total-blocks', totalBlocks);
  setText('total-tested', progressPct + '%');
  setText('best-score', best);

  // Readiness Score
  const readiness = calculateReadinessScore();
  setText('readiness-score', readiness);

  // Update navbar stats
  updateNavbarStats();

  // Premium metrics
  const mistakes = LS.getMistakes();
  const mistakesCount = mistakes.length;
  setText('mistakes-stat-count', `${mistakesCount} питань`);
  const mistakesBtn = document.getElementById('btn-mistakes-practice');
  if (mistakesBtn) {
    mistakesBtn.disabled = mistakesCount === 0;
    if (mistakesCount > 0) {
      mistakesBtn.classList.remove('btn-secondary');
      mistakesBtn.classList.add('btn-primary');
    } else {
      mistakesBtn.classList.remove('btn-primary');
      mistakesBtn.classList.add('btn-secondary');
    }
  }

  const starred = LS.getStarred();
  const starredCount = starred.length;
  setText('starred-stat-count', `${starredCount} питань`);
  const starredBtn = document.getElementById('btn-starred-practice');
  if (starredBtn) {
    starredBtn.disabled = starredCount === 0;
    if (starredCount > 0) {
      starredBtn.classList.remove('btn-secondary');
      starredBtn.classList.add('btn-primary');
    } else {
      starredBtn.classList.remove('btn-primary');
      starredBtn.classList.add('btn-secondary');
    }
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function goStudy(blockId) {
  location.href = `study.html?block=${blockId}`;
}

function goTest(blockId) {
  location.href = `test.html?block=${blockId}`;
}

function startFullTest() {
  location.href = `test.html?full=1`;
}

function startSimulation() {
  location.href = `test.html?sim=1`;
}

function startMistakesPractice() {
  const mistakes = LS.getMistakes();
  if (mistakes.length === 0) return;
  location.href = `study.html?block=mistakes`;
}

function startStarredPractice() {
  const starred = LS.getStarred();
  if (starred.length === 0) return;
  location.href = `study.html?block=starred`;
}

function resetAllProgress() {
  if (!confirm('Скинути весь прогрес вивчення та результати тестів?')) return;
  localStorage.removeItem('pdr_progress');
  localStorage.removeItem('pdr_results');
  localStorage.removeItem('pdr_learned');
  localStorage.removeItem('pdr_mistakes');
  localStorage.removeItem('pdr_starred');
  renderBlocks();
  updateGlobalStats();
  showToast('Прогрес скинуто', 'success');
}

// ─── Study Page ───────────────────────────────────────────────
function initStudyPage() {
  const blockId = getBlockId();
  let block = null;
  if (blockId === 'mistakes') {
    const mistakeIds = LS.getMistakes();
    const questions = mistakeIds.map(id => getQuestionById(id)?.q).filter(Boolean);
    block = { id: 'mistakes', title: '📝 Робота над помилками', questions };
  } else if (blockId === 'starred') {
    const starredIds = LS.getStarred();
    const questions = starredIds.map(id => getQuestionById(id)?.q).filter(Boolean);
    block = { id: 'starred', title: '⭐ Вибрані питання', questions };
  } else {
    block = QUESTIONS_DATA.blocks.find(b => b.id === blockId);
  }

  if (!block) { showToast('Блок не знайдено', 'error'); return; }
  if (block.questions.length === 0) {
    showToast('У цьому розділі немає питань', 'warning');
    setTimeout(() => { location.href = 'index.html'; }, 1500);
    return;
  }

  state.currentBlock = block;
  state.currentQuestions = [...block.questions];
  state.currentIndex = 0;
  state.quizCorrect = 0;

  setText('block-title', block.title);
  setText('block-meta', `${block.questions.length} питань`);
  setText('cards-total', block.questions.length);
  setText('quiz-total', block.questions.length);

  const testLink = document.getElementById('test-link');
  if (testLink) {
    if (blockId === 'mistakes' || blockId === 'starred') {
      testLink.style.display = 'none';
    } else {
      testLink.href = `test.html?block=${blockId}`;
    }
  }
  const goTestBtn = document.getElementById('go-to-test-btn');
  if (goTestBtn) {
    goTestBtn.dataset.block = blockId;
    if (blockId === 'mistakes' || blockId === 'starred') {
      goTestBtn.style.display = 'none';
    }
  }

  renderStudyCard();
  renderLearnedCount();
}

function setMode(mode) {
  state.studyMode = mode;
  state.currentIndex = 0;
  state.quizAnswered = false;
  state.quizCorrect = 0;

  document.getElementById('mode-cards').classList.toggle('active', mode === 'cards');
  document.getElementById('mode-quiz').classList.toggle('active', mode === 'quiz');
  document.getElementById('cards-mode').classList.toggle('hidden', mode !== 'cards');
  document.getElementById('quiz-mode').classList.toggle('hidden', mode !== 'quiz');

  if (mode === 'quiz') {
    state.currentQuestions = shuffle(state.currentBlock.questions);
    renderQuizQuestion();
  } else {
    renderStudyCard();
    renderLearnedCount();
  }
}

// Cards Mode
function renderStudyCard() {
  const q = state.currentQuestions[state.currentIndex];
  if (!q) return;

  const wrapper = document.querySelector('.flip-card-wrapper');
  if (wrapper) {
    wrapper.classList.remove('question-slide-in');
    void wrapper.offsetWidth;
    wrapper.classList.add('question-slide-in');
  }

  const flipCard = document.getElementById('flip-card');
  if (flipCard) flipCard.classList.remove('flipped');

  setText('question-front', q.question);
  const imgCont = document.getElementById('card-image-container');
  if (imgCont) imgCont.innerHTML = q.image ? `<img src="${q.image}" class="card-image" alt="Питання">` : '';
  setText('question-answer', q.answers.find(a => a.correct)?.text || '—');
  setText('cards-current', state.currentIndex + 1);

  // Update Star Button
  const starBtn = document.getElementById('card-star-btn');
  if (starBtn) {
    const isStarred = LS.isStarred(q.id);
    starBtn.classList.toggle('starred', isStarred);
    starBtn.innerHTML = isStarred ? '⭐' : '☆';
    starBtn.setAttribute('onclick', `event.stopPropagation(); toggleStarQuestion('${q.id}', 'card-star-btn')`);
  }

  // Update PDR Link
  const pdrBtn = document.getElementById('card-pdr-btn');
  if (pdrBtn) {
    const block = getBlockForQuestion(q);
    const pdrUrl = getPdrSectionUrl(block);
    pdrBtn.href = pdrUrl;
  }

  const pct = Math.round(((state.currentIndex + 1) / state.currentQuestions.length) * 100);
  const fill = document.getElementById('study-progress-fill');
  if (fill) fill.style.width = pct + '%';

  document.getElementById('prev-btn')?.toggleAttribute('disabled', state.currentIndex === 0);

  // Render comments for the current question
  renderComments(q.id);
}

function flipCard() {
  document.getElementById('flip-card')?.classList.toggle('flipped');
}

function markCard(known) {
  const q = state.currentQuestions[state.currentIndex];
  const block = state.currentBlock;
  
  // Award/deduct points for learning cards
  const gp = LS.get('pdr_points', 0);
  if (known) {
    LS.set('pdr_points', gp + 1);
    showPointsPopup(1, true, document.getElementById('btn-know'));
    updateStudyStreak();
  } else {
    LS.set('pdr_points', Math.max(0, gp - 1));
    showPointsPopup(-1, false, document.getElementById('btn-dont-know'));
    updateStudyStreak();
  }
  
  if (block.id === 'mistakes') {
    if (known) {
      LS.removeMistake(q.id);
      showToast('✅ Вилучено з помилок', 'success');
      state.currentQuestions.splice(state.currentIndex, 1);
      if (state.currentQuestions.length === 0) {
        showToast('🎉 Всі помилки вирішено!', 'success');
        setTimeout(() => { location.href = 'index.html'; }, 1500);
        return;
      }
      if (state.currentIndex >= state.currentQuestions.length) {
        state.currentIndex = state.currentQuestions.length - 1;
      }
      renderStudyCard();
      renderLearnedCount();
      return;
    }
  } else {
    const learned = LS.getLearnedCards();
    const key = `block_${block.id}`;
    if (!learned[key]) learned[key] = {};
    learned[key][q.id] = known;
    LS.setLearnedCards(learned);
  }
  renderLearnedCount();
  nextQuestion();
}

function renderLearnedCount() {
  const block = state.currentBlock;
  if (!block) return;
  const learned = LS.getLearnedCards()[`block_${block.id}`] || {};
  const count = Object.values(learned).filter(Boolean).length;
  setText('cards-learned-count', `${count} вивчено`);
}

function prevQuestion() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderStudyCard();
  }
}

function nextQuestion() {
  if (state.currentIndex < state.currentQuestions.length - 1) {
    state.currentIndex++;
    renderStudyCard();
  } else {
    showToast('🎉 Ви переглянули всі питання блоку!', 'success');
  }
}

function goToTest() {
  const blockId = getBlockId();
  location.href = `test.html?block=${blockId}`;
}

// Quiz Mode
function renderQuizQuestion() {
  const q = state.currentQuestions[state.currentIndex];
  if (!q) return;

  const card = document.querySelector('#quiz-mode .question-card');
  if (card) {
    card.classList.remove('question-slide-in');
    void card.offsetWidth;
    card.classList.add('question-slide-in');
  }

  state.quizAnswered = false;
  setText('quiz-question-text', q.question);
  const qImg = document.getElementById('quiz-image-container');
  if (qImg) qImg.innerHTML = q.image ? `<img src="${q.image}" class="question-image" alt="Питання">` : '';
  setText('quiz-current', state.currentIndex + 1);
  setText('quiz-score-display', `${state.quizCorrect} правильних`);

  // Update Star Button
  const starBtn = document.getElementById('quiz-star-btn');
  if (starBtn) {
    const isStarred = LS.isStarred(q.id);
    starBtn.classList.toggle('starred', isStarred);
    starBtn.innerHTML = isStarred ? '⭐' : '☆';
    starBtn.setAttribute('onclick', `toggleStarQuestion('${q.id}', 'quiz-star-btn')`);
  }

  // Update PDR Link
  const pdrBtn = document.getElementById('quiz-pdr-btn');
  if (pdrBtn) {
    const block = getBlockForQuestion(q);
    const pdrUrl = getPdrSectionUrl(block);
    pdrBtn.href = pdrUrl;
  }

  const nextBtn = document.getElementById('quiz-next-btn');
  if (nextBtn) nextBtn.classList.add('hidden');

  const opts = document.getElementById('quiz-options');
  const shuffledAnswers = shuffle(q.answers);
  opts.innerHTML = shuffledAnswers.map((a, i) => `
    <button class="answer-option" onclick="selectQuizAnswer(this, ${a.correct})" data-correct="${a.correct}">
      <span class="answer-letter">${'ABCD'[i]}</span>
      <span>${a.text}</span>
    </button>
  `).join('');

  opts.querySelectorAll('.answer-option').forEach((el, i) => {
    el.style.animationDelay = `${i * 0.08}s`;
    el.classList.add('animate-in');
  });

  // Render comments for the current question
  renderComments(q.id);
}

function selectQuizAnswer(btn, isCorrect) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;

  const q = state.currentQuestions[state.currentIndex];
  const block = state.currentBlock;

  const opts = document.getElementById('quiz-options');
  opts.querySelectorAll('.answer-option').forEach(el => {
    el.disabled = true;
    if (el.dataset.correct === 'true') el.classList.add('show-correct');
  });

  const gp = LS.get('pdr_points', 0);
  if (isCorrect) {
    btn.classList.add('correct');
    state.quizCorrect++;
    showToast('✅ Правильно!', 'success');
    LS.set('pdr_points', gp + 2);
    showPointsPopup(2, true, btn);
    updateStudyStreak();
    if (block.id === 'mistakes') {
      LS.removeMistake(q.id);
    }
  } else {
    btn.classList.add('wrong');
    showToast('❌ Неправильно', 'error');
    LS.set('pdr_points', Math.max(0, gp - 1));
    showPointsPopup(-1, false, btn);
    updateStudyStreak();
    LS.addMistake(q.id);
  }

  const nextBtn = document.getElementById('quiz-next-btn');
  if (nextBtn) nextBtn.classList.remove('hidden');

  if (state.currentIndex === state.currentQuestions.length - 1) {
    nextBtn.textContent = '📊 Результати';
    nextBtn.onclick = showQuizResults;
  }
}

function nextQuizQuestion() {
  if (state.currentIndex < state.currentQuestions.length - 1) {
    state.currentIndex++;
    renderQuizQuestion();
  }
}

function showQuizResults() {
  const total = state.currentQuestions.length;
  const score = Math.round((state.quizCorrect / total) * 100);
  showToast(`🎯 Результат вікторини: ${state.quizCorrect}/${total} (${score}%)`, score >= 90 ? 'success' : 'error');
}

// ─── Test Page ────────────────────────────────────────────────
function initTestPage() {
  const blockId = getBlockId();
  const isFull = isFullTestMode();
  state.isFullTest = isFull;
  state.isSimulation = isSimulationMode();

  let block = null;
  let allQuestions = [];

  if (state.isSimulation) {
    allQuestions = QUESTIONS_DATA.blocks.flatMap(b => b.questions);
    setText('test-block-title', 'Симулятор іспиту МВС');
    setText('test-block-meta', '20 випадкових питань з усіх блоків');
    setText('start-title', 'Симулятор іспиту МВС');
    setText('start-description', 'Симулятор офіційного іспиту МВС: 20 випадкових питань з усіх блоків, 20 хвилин. Допускається не більше 2 помилок. Іспит завершується достроково при 3-й помилці.');
    setText('start-count', 20);
  } else if (isFull) {
    allQuestions = QUESTIONS_DATA.blocks.flatMap(b => b.questions);
    setText('test-block-title', 'Фінальний тест');
    setText('test-block-meta', `Питань: ${allQuestions.length}`);
    setText('start-title', 'Фінальний тест');
    setText('start-description', 'Всі питання з усіх блоків. Потрібно набрати 90%.');
    const cnt = Math.min(40, allQuestions.length);
    setText('start-count', cnt);
  } else {
    block = QUESTIONS_DATA.blocks.find(b => b.id === blockId);
    if (!block) { showToast('Блок не знайдено', 'error'); return; }
    allQuestions = block.questions;
    setText('test-block-title', block.title);
    setText('test-block-meta', `${block.questions.length} питань`);
    setText('start-description',
      `Вам буде запропоновано ${Math.min(20, block.questions.length)} випадкових питань з цього блоку.<br>Для успішного складання потрібно набрати <strong style="color:var(--accent-light)">90%</strong> правильних відповідей.`);
    setText('start-count', Math.min(20, block.questions.length));
  }

  state.currentBlock = block;
  state.currentQuestions = allQuestions;
}

function startTest() {
  const all = state.currentQuestions;
  const count = state.isSimulation ? 20 : (state.isFullTest ? Math.min(40, all.length) : Math.min(20, all.length));
  state.testQuestions = shuffle(all).slice(0, count);
  state.testIndex = 0;
  state.testAnswers = [];
  state.timeLeft = 20 * 60;
  state.testStartTime = Date.now();
  state.testPointsEarned = 0;
  state.testStreak = 0;

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('test-screen').classList.remove('hidden');

  const simMistakesEl = document.getElementById('sim-mistakes-counter');
  if (simMistakesEl) {
    if (state.isSimulation) {
      state.simMistakes = 0;
      simMistakesEl.textContent = '❌ Помилки: 0/2';
      simMistakesEl.classList.remove('hidden');
    } else {
      simMistakesEl.classList.add('hidden');
    }
  }

  setText('total-q-num', count);
  startTimer();
  renderTestQuestion();
}

function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      finishTest();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = `⏱ ${formatTime(state.timeLeft)}`;
  el.className = 'timer';
  if (state.timeLeft <= 120) el.classList.add('danger');
  else if (state.timeLeft <= 300) el.classList.add('warning');
}

function renderTestQuestion() {
  const q = state.testQuestions[state.testIndex];
  if (!q) return;

  const pct = Math.round((state.testIndex / state.testQuestions.length) * 100);
  const fill = document.getElementById('test-progress-fill');
  if (fill) fill.style.width = pct + '%';

  setText('current-q-num', state.testIndex + 1);
  setText('test-question-text', q.question);
  const testImg = document.getElementById('test-image-container');
  if (testImg) testImg.innerHTML = q.image ? `<img src="${q.image}" class="question-image" alt="Питання">` : '';

  // Update Star Button
  const starBtn = document.getElementById('test-star-btn');
  if (starBtn) {
    const isStarred = LS.isStarred(q.id);
    starBtn.classList.toggle('starred', isStarred);
    starBtn.innerHTML = isStarred ? '⭐' : '☆';
    starBtn.setAttribute('onclick', `toggleStarQuestion('${q.id}', 'test-star-btn')`);
  }

  // Update PDR Link
  const pdrBtn = document.getElementById('test-pdr-btn');
  if (pdrBtn) {
    const block = getBlockForQuestion(q);
    const pdrUrl = getPdrSectionUrl(block);
    pdrBtn.href = pdrUrl;
  }

  const card = document.getElementById('question-card');
  if (card) {
    card.classList.remove('question-slide-in');
    void card.offsetWidth;
    card.classList.add('question-slide-in');
  }

  const opts = document.getElementById('test-options');
  const shuffledAnswers = shuffle(q.answers);
  q._shuffled = shuffledAnswers; // Store for answer checking

  opts.innerHTML = shuffledAnswers.map((a, i) => `
    <button class="answer-option" onclick="selectTestAnswer(this, ${a.correct})" style="animation-delay:${i*0.08}s">
      <span class="answer-letter">${'ABCD'[i]}</span>
      <span>${a.text}</span>
    </button>
  `).join('');

  opts.querySelectorAll('.answer-option').forEach(el => el.classList.add('animate-in'));
}

function selectTestAnswer(btn, isCorrect) {
  const opts = document.getElementById('test-options');
  if (opts.querySelector('[disabled]')) return; // Already answered

  opts.querySelectorAll('.answer-option').forEach(el => {
    el.disabled = true;
    if (el.querySelector('span:last-child').textContent ===
        btn.querySelector('span:last-child').textContent) {
      // this is the selected button - will be marked below
    }
    // Find the correct answer and highlight it
    const btnText = el.querySelector('span:last-child').textContent;
    const q = state.testQuestions[state.testIndex];
    const matchingAnswer = q.answers.find(a => a.text === btnText);
    if (matchingAnswer?.correct) el.classList.add('show-correct');
  });

  btn.classList.add(isCorrect ? 'correct' : 'wrong');

  const q = state.testQuestions[state.testIndex];
  const userAnswerText = btn.querySelector('span:last-child').textContent;
  state.testAnswers.push({
    question: q,
    userCorrect: isCorrect,
    userAnswerText,
    correctAnswerText: q.answers.find(a => a.correct)?.text || '—',
  });

  // Track mistakes in localStorage
  if (!isCorrect) {
    LS.addMistake(q.id);
  }

  // Points & Streak calculations during test
  const base = state.isSimulation ? 2 : 1;
  const deduct = state.isSimulation ? 2 : 1;
  if (isCorrect) {
    state.testStreak++;
    const bonus = getStreakBonus(state.testStreak, state.isSimulation);
    const earned = base + bonus;
    state.testPointsEarned += earned;
    showPointsPopup(earned, true, btn);
    if (bonus > 0) {
      showToast(`⚡ Серія ${state.testStreak} правильних відповідей! Бонус: +${bonus} балів!`, 'success');
    }
  } else {
    state.testStreak = 0;
    state.testPointsEarned -= deduct;
    showPointsPopup(-deduct, false, btn);
  }

  if (state.isSimulation) {
    if (!isCorrect) {
      state.simMistakes++;
      const mistakeEl = document.getElementById('sim-mistakes-counter');
      if (mistakeEl) {
        mistakeEl.textContent = `❌ Помилки: ${state.simMistakes}/2`;
      }
    }
  }

  setTimeout(() => {
    if (state.isSimulation && state.simMistakes >= 3) {
      finishTest();
      return;
    }

    state.testIndex++;
    if (state.testIndex < state.testQuestions.length) {
      renderTestQuestion();
    } else {
      finishTest();
    }
  }, 1200);
}

function finishTest() {
  if (state.timerInterval) clearInterval(state.timerInterval);

  const elapsed = Math.round((Date.now() - state.testStartTime) / 1000);
  const total = state.testQuestions.length;
  const correct = state.testAnswers.filter(a => a.userCorrect).length;
  const score = Math.round((correct / total) * 100);
  
  let passed = false;
  if (state.isSimulation) {
    passed = state.simMistakes <= 2 && state.testAnswers.length === total;
  } else {
    passed = score >= 90;
  }

  // Points allocation and anti-fraud penalty
  let pointsAdded = state.testPointsEarned || 0;
  const wrongCount = total - correct;
  
  if (correct < wrongCount) {
    pointsAdded = 0;
    showToast('⚠️ Отримано 0 балів за тест: неправильних відповідей більше, ніж правильних.', 'warning');
  } else if (pointsAdded > 0) {
    const globalPoints = LS.get('pdr_points', 0);
    LS.set('pdr_points', globalPoints + pointsAdded);
    showToast(`🏆 Отримано +${pointsAdded} балів за тест!`, 'success');
  }
  
  updateStudyStreak();

  // Save result
  const results = LS.getResults();
  const blockId = state.isSimulation ? 'simulation' : (state.currentBlock?.id || 'full');
  if (!results[blockId]) results[blockId] = [];
  results[blockId].push({ score, correct, total, date: Date.now(), elapsed });
  results[blockId] = results[blockId].slice(-10); // keep last 10
  LS.setResults(results);

  // Show results screen
  document.getElementById('test-screen').classList.add('hidden');
  document.getElementById('results-screen').classList.remove('hidden');

  // Stagger result stats cards
  const statsCards = document.querySelectorAll('.result-stat');
  statsCards.forEach((card, i) => {
    card.classList.remove('animate-in');
    card.style.animationDelay = `${i * 0.1}s`;
    void card.offsetWidth;
    card.classList.add('animate-in');
  });

  setText('result-icon', passed ? '🏆' : '📚');
  const scoreEl = document.getElementById('result-score');
  if (scoreEl) {
    scoreEl.textContent = score + '%';
    scoreEl.className = `result-score ${passed ? 'pass' : 'fail'}`;
  }
  
  if (state.isSimulation) {
    setText('result-label', passed ? 'Іспит складено! 🎉' : 'Іспит не складено');
    setText('result-sublabel', passed
      ? 'Чудова підготовка! Ви успішно склали симулятор іспиту.'
      : state.simMistakes >= 3 
        ? 'Допущено 3 помилки. Іспит завершено достроково.' 
        : 'Допущено більше 2 помилок.');
  } else {
    setText('result-label', passed ? 'Тест складено! 🎉' : 'Потрібно більше практики');
    setText('result-sublabel', passed
      ? 'Ви готові до реального іспиту!'
      : `Потрібно ${90 - score}% більше для складання іспиту`);
  }

  setText('res-correct', correct);
  setText('res-wrong', state.isSimulation ? state.simMistakes : total - correct);
  setText('res-time', formatTime(elapsed));

  // Mistakes
  const mistakes = state.testAnswers.filter(a => !a.userCorrect);
  setText('mistakes-count', mistakes.length);

  const mistakesSection = document.getElementById('mistakes-section');
  if (mistakes.length === 0) {
    if (mistakesSection) mistakesSection.style.display = 'none';
  } else {
    if (mistakesSection) mistakesSection.style.display = 'block';
    const list = document.getElementById('mistakes-list');
    if (list) {
      list.innerHTML = mistakes.map(m => `
        <div class="mistake-item">
          <div class="mistake-q">❓ ${m.question.question}</div>
          ${m.question.image ? `<div class="mistake-image-wrapper"><img src="${m.question.image}" class="mistake-image" alt="Помилка"></div>` : ''}
          <div class="mistake-answers">
            <div class="mistake-answer user-answer">
              ❌ Ваша відповідь: ${m.userAnswerText}
            </div>
            <div class="mistake-answer correct-answer">
              ✅ Правильна відповідь: ${m.correctAnswerText}
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  if (passed) launchConfetti();
}

function retryTest() {
  document.getElementById('results-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
}

function reviewMistakes() {
  const blockId = state.currentBlock?.id;
  if (blockId) location.href = `study.html?block=${blockId}`;
  else location.href = 'index.html';
}

// ─── Confetti ─────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#6c63ff', '#1e90ff', '#00d084', '#ffa502', '#ff4757', '#ff6b81', '#eccc68'];
  const particles = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: -20,
    r: Math.random() * 6 + 3,
    c: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 3 + 2,
    rot: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 8,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      p.vy += 0.05;
    });
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      p.vy += 0.05;
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ─── Gamification & Community Features ────────────────────────
const commentAuthors = [
  { name: 'Дмитро Карпенко', badge: 'student' },
  { name: 'Марія Козак', badge: 'student' },
  { name: 'Олексій Шевченко', badge: 'expert', title: 'Викладач теорії' },
  { name: 'Ірина Бойко', badge: 'student' },
  { name: 'В.О. Артемченко', badge: 'expert', title: 'Інструктор' },
];

const studentPhrases = [
  "Підкажіть, чому тут саме такий варіант? Був упевнений, що діє правило правої руки.",
  "Нарешті розібрався! Дуже підступне питання через розташування знаків.",
  "В офіційному білеті ГСЦ малюнок точно такий самий, головне запам'ятати.",
  "Чи може хтось пояснити різницю між цим пунктом та розділом 10 ПДР?",
  "Дякую за коментарі, допомагає зрозуміти логіку, а не просто зазубрювати!"
];

const expertPhrases = [
  "Зверніть увагу на пункт {PDR} правил. Тут чітко зазначено пріоритет руху рейкових транспортних засобів.",
  "Типова пастка розробників білетів. Головне — дивитися на поєднання знаку та розмітки.",
  "Завжди пам'ятайте: регулювальник має перевагу над світлофорами та знаками пріоритету!",
  "Якщо виникає сумнів, читайте розділ про проїзд перехресть. У даній ситуації діє загальне правило.",
  "Для успішного складання іспиту в сервісному центрі важливо чітко розрізняти ці поняття."
];

function updateNavbarStats() {
  const points = LS.get('pdr_points', 0);
  const streak = LS.get('pdr_streak_days', 0);
  
  const ptsEl = document.getElementById('nav-points');
  if (ptsEl) ptsEl.textContent = `🪙 ${points.toLocaleString()}`;
  
  const strEl = document.getElementById('nav-streak');
  if (strEl) strEl.textContent = `⚡ ${streak} дн.`;
}

function updateStudyStreak() {
  const todayStr = new Date().toDateString();
  const lastStudy = localStorage.getItem('pdr_last_study_date');
  let streak = LS.get('pdr_streak_days', 0);
  
  if (lastStudy) {
    if (lastStudy !== todayStr) {
      const lastDate = new Date(lastStudy);
      const todayDate = new Date();
      const diffTime = Math.abs(todayDate - lastDate);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 1) {
        streak++;
      } else {
        streak = 1;
      }
      localStorage.setItem('pdr_last_study_date', todayStr);
      LS.set('pdr_streak_days', streak);
    }
  } else {
    streak = 1;
    localStorage.setItem('pdr_last_study_date', todayStr);
    LS.set('pdr_streak_days', streak);
  }
  updateNavbarStats();
}

function showPointsPopup(amount, isCorrect, eventNode) {
  if (!eventNode) return;
  const rect = eventNode.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'points-pop';
  pop.textContent = (amount >= 0 ? '+' : '') + amount;
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${window.scrollY + rect.top}px`;
  if (!isCorrect) pop.style.color = 'var(--danger)';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 800);
}

function calculateReadinessScore() {
  const results = LS.getResults();
  let allAttempts = [];
  Object.keys(results).forEach(blockId => {
    if (blockId === 'simulation' || blockId === 'full' || !isNaN(blockId)) {
      results[blockId].forEach(r => {
        allAttempts.push(r);
      });
    }
  });
  
  if (allAttempts.length < 3) return '—';
  
  allAttempts.sort((a, b) => b.date - a.date);
  const latestAttempts = allAttempts.slice(0, 10);
  const sumScores = latestAttempts.reduce((acc, r) => acc + r.score, 0);
  const avgPct = sumScores / latestAttempts.length;
  
  return `${(avgPct / 10).toFixed(1)} / 10`;
}

function getStreakBonus(streak, isSim) {
  if (streak === 5) return isSim ? 3 : 2;
  if (streak === 7) return isSim ? 4 : 3;
  if (streak === 10) return isSim ? 5 : 4;
  if (streak === 15) return isSim ? 6 : 5;
  if (streak === 18) return isSim ? 7 : 6;
  return 0;
}

// Comments rendering
function renderComments(qId) {
  const listEl = document.getElementById('comments-list');
  const countEl = document.getElementById('comments-count');
  if (!listEl) return;

  const customComments = LS.get(`comments_${qId}`, []);
  let comments = [];
  
  if (qId === 'q_01_001') {
    comments = [
      { author: 'Василь Петрович', title: 'Викладач автошколи', badge: 'expert', text: 'Це питання часто плутають. Запам\'ятайте, що рух пішоходів по розділювальній смузі заборонений, оскільки вона служить для розділення транспортних потоків.', time: '2 дні тому' },
      { author: 'Ольга Ковальчук', badge: 'student', text: 'Дякую за пояснення! А я думала, що якщо немає тротуару, то можна.', time: '1 день тому' }
    ];
  } else if (qId === 'q_01_006') {
    comments = [
      { author: 'Андрій М.', title: 'Інструктор з водіння', badge: 'expert', text: 'Вимога "Дати дорогу" означає не починати, не продовжувати або не відновлювати рух, якщо це змусить інших учасників руху змінити напрямок або швидкість.', time: '3 дні тому' },
      { author: 'Дмитро', badge: 'student', text: 'У квитках ГСЦ це формулювання зустрічається декілька разів. Краще завчити напам\'ять.', time: '12 годин тому' }
    ];
  } else {
    let seed = 0;
    for (let i = 0; i < qId.length; i++) seed += qId.charCodeAt(i);
    
    const count = (seed % 3) + 1;
    for (let i = 0; i < count; i++) {
      const authorIdx = (seed + i * 7) % commentAuthors.length;
      const author = commentAuthors[authorIdx];
      
      let text = '';
      if (author.badge === 'expert') {
        const textIdx = (seed + i * 3) % expertPhrases.length;
        const pdrSec = (seed % 30) + 1;
        text = expertPhrases[textIdx].replace('{PDR}', pdrSec);
      } else {
        const textIdx = (seed + i * 4) % studentPhrases.length;
        text = studentPhrases[textIdx];
      }
      
      const timeVal = (seed + i * 11) % 6 + 1;
      comments.push({
        author: author.name,
        title: author.title || '',
        badge: author.badge,
        text: text,
        time: `${timeVal} дн. тому`
      });
    }
  }

  const allComments = [...comments, ...customComments];
  if (countEl) countEl.textContent = allComments.length;

  listEl.innerHTML = allComments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <span class="comment-author">${c.author}</span>
        ${c.title ? `<span style="font-size:11px;color:var(--text-muted)">(${c.title})</span>` : ''}
        <span class="comment-badge ${c.badge}">${c.badge === 'expert' ? 'Експерт 🎓' : 'Студент'}</span>
        <span class="comment-time">${c.time}</span>
      </div>
      <div class="comment-text">${c.text}</div>
    </div>
  `).join('');
}

function addCustomComment() {
  const input = document.getElementById('comment-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  
  const q = state.currentQuestions[state.currentIndex];
  if (!q) return;

  const customComments = LS.get(`comments_${q.id}`, []);
  customComments.push({
    author: 'Ви (Ви)',
    badge: 'student',
    text: text,
    time: 'Щойно'
  });
  
  LS.set(`comments_${q.id}`, customComments);
  input.value = '';
  renderComments(q.id);
  showToast('💬 Коментар успішно додано!', 'success');
}

// Global hook to display stats on startup
document.addEventListener('DOMContentLoaded', () => {
  updateNavbarStats();
});

