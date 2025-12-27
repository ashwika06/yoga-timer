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

// Progress Ring globals
let circle, radius, circumference;

/* =========================
   Initialization
========================= */

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Progress Ring
  circle = document.querySelector('.progress-ring__circle');
  if (circle) {
    radius = circle.r.baseVal.value;
    circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
  }

  loadData();
  renderMasterList();
  renderAnalytics();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("SW Registered"))
      .catch(err => console.log("SW Fail", err));
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
        <input type="number" class="time-input" value="${item.duration}" onchange="updateDuration(${index}, this.value)">
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

function toggleAll(active) {
  masterState.forEach(item => item.active = active);
  saveData();
  renderMasterList();
}

/* =========================
   Session Logic
========================= */

function startPractice() {
  sessionQueue = masterState.filter(i => i.active);
  const cooldownInput = document.getElementById('cooldown-input');
  cooldownTime = parseInt(cooldownInput ? cooldownInput.value : 10);

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
  // Check for completion
  if (index >= sessionQueue.length) {
    completeSession();
    return;
  }

  currentStepIndex = index;
  updateSequenceMap(index);

  const step = sessionQueue[index];
  const nextItem = sessionQueue[index + 1];

  // UI Setup for Practice
  document.getElementById('current-name').textContent = step.name;
  document.getElementById('next-up-display').textContent = nextItem ? `Next: ${nextItem.name}` : "Final Step";
  
  // Set Blue Ring for Practice
  if(circle) circle.style.stroke = "#4F46E5"; 

  startTimer(step.duration, () => {
    playEndSound();

    // Check for Cooldown
    if (nextItem && cooldownTime > 0) {
      document.getElementById('current-name').textContent = "Rest & Absorb";
      document.getElementById('next-up-display').textContent = `Prepare for ${nextItem.name}`;
      
      // Set Green Ring for Cooldown
      if(circle) circle.style.stroke = "#10B981"; 

      startTimer(cooldownTime, () => {
        playStartSound();
        runStep(index + 1);
      });
    } else {
      // Immediate Transition
      runStep(index + 1);
    }
  });
}

// Visual Sequence Map (Dots)
function renderSequenceMap() {
  const container = document.getElementById('sequence-map');
  if(!container) return;
  container.innerHTML = '';
  sessionQueue.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.id = `dot-${i}`;
    container.appendChild(dot);
  });
}

function updateSequenceMap(currentIndex) {
  sessionQueue.forEach((_, i) => {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) {
      dot.className = 'dot';
      if (i < currentIndex) dot.classList.add('completed');
      if (i === currentIndex) dot.classList.add('active');
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

    if (time < 0) {
      clearInterval(timerInterval);
      callback();
    }
  }, 1000);
}

function updateTimerUI(time, total) {
  const displayTime = Math.max(0, time);
  document.getElementById('timer-display').textContent = formatTime(displayTime);
  
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

  const totalTime = sessionQueue.reduce((a, b) => a + b.duration, 0);

  historyLog.unshift({
    date: new Date().toISOString(),
    totalDuration: totalTime,
    itemsCompleted: sessionQueue.map(i => i.name)
  });

  saveData();
  renderAnalytics();

  // Update UI to show done state
  document.getElementById('current-name').textContent = "Namaste";
  document.getElementById('timer-display').textContent = "Done";
  
  setTimeout(() => {
    alert("Session Complete! 🙏");
    stopSession();
  }, 1500);
}

/* =========================
   Analytics (Chart.js)
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
    const d = new Date(log.date);
    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const li = document.createElement('li');
    li.innerHTML = `
      <div><strong>${dateStr}</strong></div>
      <span>${formatTime(log.totalDuration)}</span>
    `;
    list.appendChild(li);
  });
}

function renderChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext('2d');
  
  // Calculate Last 7 Days
  const labels = [];
  const dataPoints = [];
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString([], {weekday: 'short'}));
    
    // Sum duration for this day
    const dayTotal = historyLog
      .filter(l => l.date.startsWith(dayStr))
      .reduce((sum, l) => sum + l.totalDuration, 0);
      
    dataPoints.push(Math.round(dayTotal / 60)); // Minutes
  }

  if (analyticsChart) analyticsChart.destroy();

  analyticsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Minutes',
        data: dataPoints,
        backgroundColor: '#4F46E5',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } }
    }
  });
}

/* =========================
   Utilities
========================= */

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');

  // Update Bottom Nav Highlighting
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => btn.classList.remove('active'));
  if(viewId === 'view-dashboard') navBtns[0].classList.add('active');
  if(viewId === 'view-analytics') navBtns[1].classList.add('active');
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* =========================
   Audio Engine
========================= */

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if(audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function beep(freq, dur) {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

// 440Hz for 2s (End of Exercise)
function playEndSound() { beep(440, 2); }

// 880Hz for 1s (Start of Next)
function playStartSound() { beep(880, 1); }

// 200Hz for 3s (Session Finish)
function playFinishSound() { beep(200, 3); }

/* =========================
   Wake Lock
========================= */

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
      console.log('Wake Lock error:', err);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}