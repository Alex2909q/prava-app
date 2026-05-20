// ============================================================
//  app.js — Головна логіка ПДР Тест
// ============================================================

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

function resetAllProgress() {
  if (!confirm('Скинути весь прогрес вивчення та результати тестів?')) return;
  localStorage.removeItem('pdr_progress');
  localStorage.removeItem('pdr_results');
  localStorage.removeItem('pdr_learned');
  renderBlocks();
  updateGlobalStats();
  showToast('Прогрес скинуто', 'success');
}

// ─── Study Page ───────────────────────────────────────────────
function initStudyPage() {
  const blockId = getBlockId();
  const block = QUESTIONS_DATA.blocks.find(b => b.id === blockId);
  if (!block) { showToast('Блок не знайдено', 'error'); return; }

  state.currentBlock = block;
  state.currentQuestions = [...block.questions];
  state.currentIndex = 0;
  state.quizCorrect = 0;

  setText('block-title', block.title);
  setText('block-meta', `${block.questions.length} питань`);
  setText('cards-total', block.questions.length);
  setText('quiz-total', block.questions.length);

  const testLink = document.getElementById('test-link');
  if (testLink) testLink.href = `test.html?block=${blockId}`;
  const goTestBtn = document.getElementById('go-to-test-btn');
  if (goTestBtn) goTestBtn.dataset.block = blockId;

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

  const flipCard = document.getElementById('flip-card');
  if (flipCard) flipCard.classList.remove('flipped');

  setText('question-front', q.question);
  setText('question-answer', q.answers.find(a => a.correct)?.text || '—');
  setText('cards-current', state.currentIndex + 1);

  const pct = Math.round(((state.currentIndex + 1) / state.currentQuestions.length) * 100);
  const fill = document.getElementById('study-progress-fill');
  if (fill) fill.style.width = pct + '%';

  document.getElementById('prev-btn')?.toggleAttribute('disabled', state.currentIndex === 0);
}

function flipCard() {
  document.getElementById('flip-card')?.classList.toggle('flipped');
}

function markCard(known) {
  const q = state.currentQuestions[state.currentIndex];
  const block = state.currentBlock;
  const learned = LS.getLearnedCards();
  const key = `block_${block.id}`;
  if (!learned[key]) learned[key] = {};
  learned[key][q.id] = known;
  LS.setLearnedCards(learned);
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

  state.quizAnswered = false;
  setText('quiz-question-text', q.question);
  setText('quiz-current', state.currentIndex + 1);
  setText('quiz-score-display', `${state.quizCorrect} правильних`);

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
}

function selectQuizAnswer(btn, isCorrect) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;

  const opts = document.getElementById('quiz-options');
  opts.querySelectorAll('.answer-option').forEach(el => {
    el.disabled = true;
    if (el.dataset.correct === 'true') el.classList.add('show-correct');
  });

  if (isCorrect) {
    btn.classList.add('correct');
    state.quizCorrect++;
    showToast('✅ Правильно!', 'success');
  } else {
    btn.classList.add('wrong');
    showToast('❌ Неправильно', 'error');
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

  let block = null;
  let allQuestions = [];

  if (isFull) {
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
  const count = state.isFullTest ? Math.min(40, all.length) : Math.min(20, all.length);
  state.testQuestions = shuffle(all).slice(0, count);
  state.testIndex = 0;
  state.testAnswers = [];
  state.timeLeft = 20 * 60;
  state.testStartTime = Date.now();

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('test-screen').classList.remove('hidden');

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

  const card = document.getElementById('question-card');
  if (card) {
    card.classList.remove('animate-in');
    void card.offsetWidth;
    card.classList.add('animate-in');
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

  setTimeout(() => {
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
  const passed = score >= 90;

  // Save result
  const results = LS.getResults();
  const blockId = state.currentBlock?.id || 'full';
  if (!results[blockId]) results[blockId] = [];
  results[blockId].push({ score, correct, total, date: Date.now(), elapsed });
  results[blockId] = results[blockId].slice(-10); // keep last 10
  LS.setResults(results);

  // Show results screen
  document.getElementById('test-screen').classList.add('hidden');
  document.getElementById('results-screen').classList.remove('hidden');

  setText('result-icon', passed ? '🏆' : '📚');
  const scoreEl = document.getElementById('result-score');
  if (scoreEl) {
    scoreEl.textContent = score + '%';
    scoreEl.className = `result-score ${passed ? 'pass' : 'fail'}`;
  }
  setText('result-label', passed ? 'Тест складено! 🎉' : 'Потрібно більше практики');
  setText('result-sublabel', passed
    ? 'Ви готові до реального іспиту!'
    : `Потрібно ${90 - score}% більше для складання іспиту`);

  setText('res-correct', correct);
  setText('res-wrong', total - correct);
  setText('res-time', formatTime(elapsed));

  // Mistakes
  const mistakes = state.testAnswers.filter(a => !a.userCorrect);
  setText('mistakes-count', mistakes.length);

  const mistakesSection = document.getElementById('mistakes-section');
  if (mistakes.length === 0) {
    if (mistakesSection) mistakesSection.style.display = 'none';
  } else {
    const list = document.getElementById('mistakes-list');
    if (list) {
      list.innerHTML = mistakes.map(m => `
        <div class="mistake-item">
          <div class="mistake-q">❓ ${m.question.question}</div>
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
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}
