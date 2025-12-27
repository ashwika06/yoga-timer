/* =========================
   Config & State
========================= */

const DEFAULT_MASTER_LIST = [
  { id: 'p1', name: 'Bastrika', duration: 180, active: true },
  { id: 'p2', name: 'Kapalabhathi', duration: 300, active: true },
  { id: 'p3', name: 'Sheetali', duration: 120, active: true },
  { id: 'p4', name: 'Ujjayi', duration: 120, active: true },
  { id: 'p5', name: 'Bahya Kumbaka', duration: 60, active: true },
  { id: 'p6', name: 'Anuloma Viloma', duration: 600, active: true },
  { id: 'p7', name: 'Bhramari', duration: 180, active: true },
  { id: 'p8', name: 'Udgeetha', duration: 180, active: true },
  { id: 'p9', name: 'Pranava', duration: 120, active: true }
];

let masterState = [];
let historyLog = [];

let sessionQueue = [];
let currentStepIndex = 0;
let timerInterval = null;
let isRunning = false;
let wakeLock = null;
let audioCtx = null;
let cooldownTime = 10;

let analyticsChart = null;

// Progress Ring
let circle, radius, circumference;

/* =========================
   Initialization
========================= */

document.addEventListener("DOMContentLoaded", () => {
  circle = document.querySelector('.progress-ring__circle');
  if (circle) {
    radius = circle.r.baseVal.value;
    circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
  }

  loadData();
  renderMasterList();
  renderAnalytics();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
});

/* =========================
   Data Management
========================= */

function loadData() {
  masterState = JSON.parse(localStorage.getItem("scientific_master_v1"))
    || JSON.parse(JSON.stringify(DEFAULT_MASTER_LIST));

  historyLog = JSON.parse(localStorage.getItem("scientific_history_v1")) || [];
}

function saveData() {
  localStorage.setItem("scientific_master_v1", JSON.stringify(masterState));
  localStorage.setItem("scientific_history_v1", JSON.stringify(historyLog));
}

function clearHistory() {
  if (confirm("Delete all history logs?")) {
    historyLog = [];
    saveData();
    renderAnalytics();
  }
}

/* =========================
   Dashboard Logic
========================= */

function renderMasterList() {
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
          <input type="checkbox" ${item.active ? 'checked' : ''} onchange="toggleItem(${index})">
          <span class="slider"></span>
        </label>
        <span class="name">${item.name}</span>
      </div>
      <div class="item-right">
        <input type="number" value="${item.duration}" onchange="updateDuration(${index}, this.value)">
      </div>
    `;
    list.appendChild(li);
  });

  document.getElementById('total-duration-display').textContent = formatTime(totalSec);
  document.getElementById('selected-count-display').textContent = `${activeCount}/9`;
}

function toggleItem(index) {
  masterState[index].active = !masterState[index].active;
  saveData();
  renderMasterList();
}

function updateDuration(index, val) {
  const seconds = parseInt(val);
  if (seconds > 0) {
    masterState[index].duration = seconds;
    saveData();
    renderMasterList();
  }
}

/* =========================
   Session Logic
========================= */

function startPractice() {
  sessionQueue = masterState.filter(i => i.active);
  cooldownTime = parseInt(document.getElementById('cooldown-input')?.value || 10);

  if (sessionQueue.length === 0) {
    alert("Select at least one Pranayama.");
    return;
  }

  currentStepIndex = 0;
  switchView('view-timer');
  initAudio();
  requestWakeLock();
  renderSequenceMap();
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
  updateSequenceMap(index);

  const step = sessionQueue[index];
  const nextItem = sessionQueue[index + 1];

  document.getElementById('current-name').textContent = step.name;
  document.getElementById('next-up-display').textContent =
    nextItem ? `Next: ${nextItem.name}` : "Final Step";

  startTimer(step.duration, () => {
    playEndSound();

    if (nextItem && cooldownTime > 0) {
      document.getElementById('current-name').textContent = "Rest & Absorb";
      document.getElementById('next-up-display').textContent = `Prepare for ${nextItem.name}`;

      startTimer(cooldownTime, () => {
        playStartSound();
        runStep(index + 1);
      });
    } else {
      runStep(index + 1);
    }
  });
}

/* =========================
   Timer
========================= */

function startTimer(duration, callback) {
  let time = duration;
  isRunning = true;
  clearInterval(timerInterval);
  updateTimerUI(time, duration);

  timerInterval = setInterval(() => {
    if (!isRunning) return;
    time--;
    updateTimerUI(time, duration);

    if (time <= 0) {
      clearInterval(timerInterval);
      callback();
    }
  }, 1000);
}

function updateTimerUI(time, total) {
  document.getElementById('timer-display').textContent = formatTime(Math.max(0, time));
  if (circle) {
    const offset = circumference - (time / total) * circumference;
    circle.style.strokeDashoffset = offset;
  }
}

/* =========================
   Completion & Analytics
========================= */

function completeSession() {
  playFinishSound();

  historyLog.unshift({
    date: new Date().toISOString(),
    totalDuration: sessionQueue.reduce((a, b) => a + b.duration, 0),
    itemsCompleted: sessionQueue.map(i => i.name)
  });

  saveData();
  renderAnalytics();

  setTimeout(() => {
    alert("Session Complete! 🙏");
    stopSession();
  }, 1500);
}

/* =========================
   Analytics
========================= */

function renderAnalytics() {
  renderLogList();
  renderChart();
}

function renderLogList() {
  const list = document.getElementById('history-log-list');
  if (!list) return;
  list.innerHTML = '';

  historyLog.slice(0, 5).forEach(log => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${new Date(log.date).toLocaleString()}</strong>
      <span>${formatTime(log.totalDuration)}</span>
    `;
    list.appendChild(li);
  });
}

function renderChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas || typeof Chart === "undefined") return;

  if (analyticsChart) analyticsChart.destroy();

  analyticsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
      datasets: [{
        label: 'Minutes',
        data: [0,0,0,0,0,0,0],
        backgroundColor: '#4F46E5'
      }]
    }
  });
}

/* =========================
   Utilities
========================= */

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId)?.classList.add('active');
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* =========================
   Audio
========================= */

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playEndSound() {
  beep(440, 2);
}

function playStartSound() {
  beep(880, 1);
}

function playFinishSound() {
  beep(200, 3);
}

function beep(freq, dur) {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

/* =========================
   Wake Lock
========================= */

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {}
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}