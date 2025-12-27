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

// Runtime State
let sessionQueue = [];
let currentStepIndex = 0;
let timerInterval = null;
let isRunning = false;
let wakeLock = null;
let audioCtx;
let cooldownTime = 10; // Default

// Chart Instance
let analyticsChart = null;
// Circle Params
const circle = document.querySelector('.progress-ring__circle');
const radius = circle.r.baseVal.value;
const circumference = radius * 2 * Math.PI;

/* =========================
   Initialization
========================= */
document.addEventListener("DOMContentLoaded", () => {
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
  const savedMaster = localStorage.getItem("scientific_master_v1");
  masterState = savedMaster ? JSON.parse(savedMaster) : JSON.parse(JSON.stringify(DEFAULT_MASTER_LIST));
  
  const savedHistory = localStorage.getItem("scientific_history_v1");
  historyLog = savedHistory ? JSON.parse(savedHistory) : [];
}

function saveData() {
  localStorage.setItem("scientific_master_v1", JSON.stringify(masterState));
  localStorage.setItem("scientific_history_v1", JSON.stringify(historyLog));
}

function clearHistory() {
  if(confirm("Delete all history logs?")) {
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
        <input type="number" class="time-input" value="${item.duration}" 
               onchange="updateDuration(${index}, this.value)">
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

function toggleAll(status) {
  masterState.forEach(i => i.active = status);
  saveData();
  renderMasterList();
}

/* =========================
   Session Logic
========================= */
function startPractice() {
  sessionQueue = masterState.filter(item => item.active);
  cooldownTime = parseInt(document.getElementById('cooldown-input').value || 10);

  if (sessionQueue.length === 0) {
    alert("Please select at least one Pranayama.");
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
  currentStepIndex = index;
  updateSequenceMap(index);

  // Check if session is complete
  if (index >= sessionQueue.length) {
    completeSession();
    return;
  }

  const step = sessionQueue[index];
  
  // 1. Setup UI for Exercise
  document.getElementById('current-name').textContent = step.name;
  const nextItem = sessionQueue[index + 1];
  document.getElementById('next-up-display').textContent = nextItem 
    ? `Next: ${nextItem.name}` 
    : "Final Step";
  
  // Visuals for Active State
  circle.style.stroke = "#4F46E5"; // Indigo

  // 2. Start Exercise Timer
  startTimer(step.duration, () => {
    
    // Exercise Finished
    playEndSound(); // Louder, Longer beep

    // 3. Handle Cooldown / Next Step
    if (index < sessionQueue.length - 1 && cooldownTime > 0) {
      // Run Cooldown
      document.getElementById('current-name').textContent = "Rest & Absorb";
      document.getElementById('next-up-display').textContent = `Prepare for ${nextItem.name}`;
      circle.style.stroke = "#10B981"; // Green for Rest

      startTimer(cooldownTime, () => {
        // Cooldown Finished
        playStartSound(); // Distinct "Start" chime
        runStep(index + 1);
      });

    } else {
      // No cooldown needed (or last step)
      runStep(index + 1);
    }
  });
}

function renderSequenceMap() {
  const container = document.getElementById('sequence-map');
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

function startTimer(duration, callback) {
  let time = duration;
  isRunning = true;
  clearInterval(timerInterval);
  
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
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
  if (time < 0) time = 0;
  document.getElementById('timer-display').textContent = formatTime(time);
  const offset = circumference - (time / total) * circumference;
  circle.style.strokeDashoffset = offset;
}

function completeSession() {
  playFinishSound(); // The Gong
  
  const totalTime = sessionQueue.reduce((acc, curr) => acc + curr.duration, 0);
  const logEntry = {
    date: new Date().toISOString(),
    totalDuration: totalTime,
    itemsCompleted: sessionQueue.map(i => i.name)
  };
  
  historyLog.unshift(logEntry);
  saveData();
  renderAnalytics();
  
  document.getElementById('current-name').textContent = "Namaste";
  document.getElementById('timer-display').textContent = "Done";
  document.getElementById('next-up-display').textContent = "Session Complete";
  
  setTimeout(() => {
    alert("Session Complete! Great job.");
    stopSession();
  }, 2000);
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
  list.innerHTML = '';
  historyLog.slice(0, 5).forEach(log => {
    const d = new Date(log.date);
    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${dateStr}</strong><br><small>${log.itemsCompleted.length} exercises</small></div><span>${formatTime(log.totalDuration)}</span>`;
    list.appendChild(li);
  });
}

function renderChart() {
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  const labels = [];
  const dataPoints = [];
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0]; 
    labels.push(d.toLocaleDateString([], {weekday: 'short'}));
    const dayTotal = historyLog.filter(l => l.date.startsWith(dayStr)).reduce((sum, l) => sum + l.totalDuration, 0);
    dataPoints.push(Math.round(dayTotal / 60)); 
  }

  if (analyticsChart) analyticsChart.destroy();

  analyticsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Minutes Practiced',
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
   Utilities & UPDATED AUDIO
========================= */
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  if(viewId === 'view-dashboard') document.querySelectorAll('.nav-btn')[0].classList.add('active');
  if(viewId === 'view-analytics') document.querySelectorAll('.nav-btn')[1].classList.add('active');
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

/* --- UPDATED AUDIO FUNCTIONS --- */

// 1. End of Exercise: Louder, Longer, Deeper Beep
function playEndSound() {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 Note
  
  // High Volume (0.8) and Long Fade (2 seconds)
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 2.0);
}

// 2. Start of Next (After Cooldown): Sharp, Bright Chime
function playStartSound() {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'triangle'; // Triangle wave cuts through better
  osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High A5 Note
  
  // Sharp attack, medium decay
  gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.0);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 1.0);
}

// 3. Session Complete: Deep Gong
function playFinishSound() {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.frequency.setValueAtTime(200, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 3);
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); }
    catch (err) { console.log(err); }
  }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}