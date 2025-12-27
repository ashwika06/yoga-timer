/* =========================
   1. CONFIG & STATE
========================= */
const DEFAULT_MASTER = [
  { name: 'Bastrika', duration: 180, active: true },
  { name: 'Kapalabhathi', duration: 300, active: true },
  { name: 'Sheetali', duration: 120, active: true },
  { name: 'Ujjayi', duration: 120, active: true },
  { name: 'Bahya Kumbaka', duration: 60, active: true },
  { name: 'Anuloma Viloma', duration: 600, active: true },
  { name: 'Bhramari', duration: 180, active: true },
  { name: 'Udgeetha', duration: 180, active: true },
  { name: 'Pranava', duration: 120, active: true }
];

let masterState = [];
let historyLog = [];
let sessionQueue = [];
let currentStepIndex = 0;
let timerInterval = null;
let isRunning = false;
let audioCtx = null;
let wakeLock = null;

// Progress Ring Globals
let circleElement, radius, circumference;

/* =========================
   2. INITIALIZATION
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Init DOM Elements
  circleElement = document.querySelector('.progress-ring__circle');
  if (circleElement) {
    radius = circleElement.r.baseVal.value;
    circumference = radius * 2 * Math.PI;
    circleElement.style.strokeDasharray = `${circumference} ${circumference}`;
    circleElement.style.strokeDashoffset = circumference;
  }

  // Load Data
  loadData();
  renderDashboard();
  renderAnalytics();

  // Attach Event Listeners
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-start').addEventListener('click', startPractice);
  document.getElementById('btn-stop').addEventListener('click', stopSession);
  document.getElementById('btn-select-all').addEventListener('click', () => toggleAll(true));
  document.getElementById('btn-clear-all').addEventListener('click', () => toggleAll(false));
  document.getElementById('btn-reset-data').addEventListener('click', clearHistory);
  
  document.getElementById('nav-setup').addEventListener('click', () => switchView('view-dashboard'));
  document.getElementById('nav-history').addEventListener('click', () => switchView('view-analytics'));

  // Service Worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("SW Registered"))
      .catch(e => console.error("SW Fail", e));
  }
});

/* =========================
   3. DATA HANDLING
========================= */
function loadData() {
  try {
    const m = localStorage.getItem("scientific_master_v2");
    masterState = m ? JSON.parse(m) : JSON.parse(JSON.stringify(DEFAULT_MASTER));
    
    const h = localStorage.getItem("scientific_history_v2");
    historyLog = h ? JSON.parse(h) : [];
  } catch (e) {
    console.error("Data Load Error", e);
    masterState = JSON.parse(JSON.stringify(DEFAULT_MASTER));
  }
}

function saveData() {
  localStorage.setItem("scientific_master_v2", JSON.stringify(masterState));
  localStorage.setItem("scientific_history_v2", JSON.stringify(historyLog));
}

function clearHistory() {
  if (confirm("Permanently delete all history?")) {
    historyLog = [];
    saveData();
    renderAnalytics();
  }
}

/* =========================
   4. DASHBOARD LOGIC
========================= */
function renderDashboard() {
  const list = document.getElementById('master-list');
  if (!list) return;
  list.innerHTML = '';
  
  let totalSec = 0;
  let activeCount = 0;

  masterState.forEach((item, index) => {
    if (item.active) {
      totalSec += item.duration;
      activeCount++;
    }

    const li = document.createElement('li');
    li.innerHTML = `
      <div class="item-left">
        <label class="toggle-switch">
          <input type="checkbox" ${item.active ? 'checked' : ''} data-index="${index}">
          <span class="slider"></span>
        </label>
        <span class="name">${item.name}</span>
      </div>
      <div class="item-right">
        <input type="number" class="time-input" value="${item.duration}" data-index="${index}">
      </div>
    `;
    list.appendChild(li);
  });

  // Attach listeners to dynamic inputs
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = e.target.getAttribute('data-index');
      masterState[idx].active = e.target.checked;
      saveData();
      renderDashboard();
    });
  });

  list.querySelectorAll('input[type="number"]').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const idx = e.target.getAttribute('data-index');
      const val = parseInt(e.target.value);
      if (val > 0) {
        masterState[idx].duration = val;
        saveData();
        renderDashboard();
      }
    });
  });

  document.getElementById('total-duration-display').textContent = formatTime(totalSec);
  document.getElementById('selected-count-display').textContent = `${activeCount}/9`;
}

function toggleAll(state) {
  masterState.forEach(i => i.active = state);
  saveData();
  renderDashboard();
}

/* =========================
   5. TIMER & SESSION LOGIC
========================= */
function startPractice() {
  sessionQueue = masterState.filter(i => i.active);
  if (sessionQueue.length === 0) {
    alert("Please enable at least one exercise.");
    return;
  }

  // Init Audio Context on user gesture
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  requestWakeLock();
  switchView('view-timer');
  
  // Render Dots
  const map = document.getElementById('sequence-map');
  map.innerHTML = '';
  sessionQueue.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot';
    d.id = `dot-${i}`;
    map.appendChild(d);
  });

  runStep(0);
}

function stopSession() {
  isRunning = false;
  clearInterval(timerInterval);
  releaseWakeLock();
  switchView('view-dashboard');
}

function runStep(index) {
  if (index >= sessionQueue.length) {
    completeSession();
    return;
  }

  currentStepIndex = index;
  updateDots(index);

  const step = sessionQueue[index];
  const nextStep = sessionQueue[index + 1];
  const cooldownVal = parseInt(document.getElementById('cooldown-input').value || 10);

  // UI Setup
  document.getElementById('current-name').textContent = step.name;
  document.getElementById('next-up-display').textContent = nextStep ? `Next: ${nextStep.name}` : "Finish Line";
  if (circleElement) circleElement.style.stroke = "#4F46E5"; // Blue

  // Start Exercise Timer
  startTimer(step.duration, () => {
    playBeep(440, 2); // End Sound

    // Cooldown Logic
    if (nextStep && cooldownVal > 0) {
      document.getElementById('current-name').textContent = "Rest";
      if (circleElement) circleElement.style.stroke = "#10B981"; // Green
      
      startTimer(cooldownVal, () => {
        playBeep(880, 1); // Start Sound
        runStep(index + 1);
      });
    } else {
      runStep(index + 1);
    }
  });
}

function startTimer(seconds, onComplete) {
  let timeLeft = seconds;
  isRunning = true;
  clearInterval(timerInterval);
  
  updateTimerVisuals(timeLeft, seconds);

  timerInterval = setInterval(() => {
    if (!isRunning) return;
    timeLeft--;
    updateTimerVisuals(timeLeft, seconds);

    if (timeLeft < 0) {
      clearInterval(timerInterval);
      onComplete();
    }
  }, 1000);
}

function updateTimerVisuals(current, total) {
  const t = Math.max(0, current);
  document.getElementById('timer-display').textContent = formatTime(t);
  
  if (circleElement) {
    const offset = circumference - (current / total) * circumference;
    circleElement.style.strokeDashoffset = offset;
  }
}

function updateDots(idx) {
  sessionQueue.forEach((_, i) => {
    const el = document.getElementById(`dot-${i}`);
    if (el) {
      el.className = 'dot';
      if (i < idx) el.classList.add('completed');
      if (i === idx) el.classList.add('active');
    }
  });
}

function completeSession() {
  playBeep(200, 3); // Gong
  
  const totalTime = sessionQueue.reduce((acc, i) => acc + i.duration, 0);
  historyLog.unshift({
    date: new Date().toISOString(),
    duration: totalTime,
    items: sessionQueue.length
  });
  saveData();
  renderAnalytics();

  document.getElementById('current-name').textContent = "Namaste";
  document.getElementById('timer-display').textContent = "Done";
  
  setTimeout(() => {
    alert("Session Complete!");
    stopSession();
  }, 1500);
}

/* =========================
   6. ANALYTICS & UTILS
========================= */
function renderAnalytics() {
  // Logs
  const list = document.getElementById('history-log-list');
  if (list) {
    list.innerHTML = '';
    historyLog.slice(0, 5).forEach(log => {
      const d = new Date(log.date);
      const li = document.createElement('li');
      li.innerHTML = `<span>${d.toLocaleDateString()}</span> <span>${formatTime(log.duration)}</span>`;
      list.appendChild(li);
    });
  }

  // Chart
  const ctx = document.getElementById('weeklyChart');
  if (ctx && typeof Chart !== 'undefined') {
    // Basic Last 7 Days Logic
    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
      
      const total = historyLog
        .filter(l => l.date.startsWith(dayStr))
        .reduce((sum, l) => sum + l.duration, 0);
      data.push(Math.round(total / 60));
    }

    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Minutes',
          data: data,
          backgroundColor: '#4F46E5'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

function formatTime(s) {
  const min = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

function switchView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  
  // Update Nav State
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (id === 'view-dashboard') document.getElementById('nav-setup').classList.add('active');
  if (id === 'view-analytics') document.getElementById('nav-history').classList.add('active');
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark-mode');
}

function playBeep(freq, dur) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); }
    catch (e) { console.warn("Wake Lock failed", e); }
  }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}