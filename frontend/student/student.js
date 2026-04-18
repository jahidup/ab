// student.js – Premium Student Portal
const student = JSON.parse(localStorage.getItem('student'));
if (!student) location.replace('index.html');

// Global test state
let currentTest = null, testQuestions = [], answers = {}, timerInterval = null, timeLeft = 0;
let flaggedQuestions = new Set();
let visibilityWarningCount = 0;
const MAX_WARNINGS = 3;

// DOM
const pageTitle = document.getElementById('pageTitle');

// Utilities
function showLoading() { document.getElementById('globalLoading').style.display = 'flex'; }
function hideLoading() { document.getElementById('globalLoading').style.display = 'none'; }
function formatTime(sec) { const m=Math.floor(sec/60), s=sec%60; return `${m}:${s.toString().padStart(2,'0')}`; }

// Init
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  displayStudentInfo();
  loadDashboardStats();
  loadAvailableTests();
  setupLogout();
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(tab).classList.add('active');
      pageTitle.textContent = item.textContent.trim();
      loadTabData(tab);
    });
  });
}
function displayStudentInfo() {
  document.getElementById('studentName').textContent = student.fullName;
  document.getElementById('studentIdDisplay').textContent = student.studentId;
  document.getElementById('dobDisplay').textContent = student.dob;
  document.getElementById('classDisplay').textContent = student.class || 'N/A';
}
function setupLogout() {
  document.getElementById('logoutBtn').addEventListener('click', ()=>{
    localStorage.removeItem('student');
    location.replace('index.html');
  });
}
async function loadTabData(tab) {
  if(tab==='availableTests') loadAvailableTests();
  else if(tab==='previousResults') loadResults();
  else if(tab==='discussions') { await loadTestsForDropdown(); loadDiscussions(); }
  else if(tab==='messages') loadMessages();
}
window.refreshCurrentTab = () => {
  const active = document.querySelector('.nav-item.active')?.dataset.tab;
  if(active) loadTabData(active);
};

// Stats
async function loadDashboardStats() {
  const results = await fetch(`/api/results/student/${student.studentId}`).then(r=>r.json());
  document.getElementById('testsTaken').textContent = results.length;
  const avg = results.length ? (results.reduce((a,b)=>a+b.score,0)/results.length).toFixed(2) : 0;
  document.getElementById('avgScore').textContent = avg;
}

// Available Tests
async function loadAvailableTests() {
  showLoading();
  try {
    const tests = await fetch(`/api/student/available-tests/${student.studentId}`).then(r=>r.json());
    const container = document.getElementById('testsList');
    if(!tests.length) { container.innerHTML = '<p class="empty-state">No tests available</p>'; return; }
    container.innerHTML = tests.map(t=>`
      <div class="test-card">
        <h3>${t.testName}</h3>
        <div class="test-meta"><span>⏱️ ${t.duration} min</span><span>📊 +${t.marks.correct}/${t.marks.wrong}/${t.marks.skip}</span></div>
        <div class="test-meta"><span>📅 ${new Date(t.startTime).toLocaleString()}</span><span>⏰ ${new Date(t.endTime).toLocaleString()}</span></div>
        <button class="btn-primary" onclick="startTest('${t.testId}')">Start Test</button>
      </div>
    `).join('');
  } finally { hideLoading(); }
}

// Start Test
window.startTest = async (testId) => {
  showLoading();
  currentTest = await fetch('/api/tests').then(r=>r.json()).then(tests=>tests.find(t=>t.testId===testId));
  testQuestions = await fetch(`/api/questions/${testId}`).then(r=>r.json());
  if(currentTest.shuffle) testQuestions = shuffleArray(testQuestions);
  answers = {}; flaggedQuestions.clear(); visibilityWarningCount = 0;
  const pauseRes = await fetch(`/api/admin/paused-status/${student.studentId}/${testId}`).then(r=>r.json());
  const totalPaused = pauseRes.totalPausedDuration || 0;
  timeLeft = (currentTest.duration * 60) - totalPaused;
  hideLoading();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  renderTestInterface();
  startTimer();
  document.getElementById('testModal').style.display = 'flex';
};
function shuffleArray(arr) { for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

let currentQIndex = 0;
function renderTestInterface() {
  const container = document.getElementById('testInterface');
  const q = testQuestions[currentQIndex];
  const lang = localStorage.getItem('preferredLang')||'en';
  const questionText = q.questionText[lang] || q.questionText.en;
  const images = q.imageUrls?.map(url=>`<img src="${url}" class="question-image">`).join('')||'';
  let optionsHtml = '';
  if(q.type==='mcq'){
    optionsHtml = q.options.map((opt,i)=>`
      <label class="option-item ${answers[q.questionId]==i+1?'selected':''}">
        <input type="radio" name="mcq" value="${i+1}" ${answers[q.questionId]==i+1?'checked':''} onchange="saveAnswer('${q.questionId}',${i+1})">
        <span>${opt[lang]||opt.en}</span>
      </label>
    `).join('');
  } else {
    optionsHtml = `<div class="numerical-input"><input type="number" step="any" value="${answers[q.questionId]||''}" onchange="saveAnswer('${q.questionId}',this.value)" placeholder="Enter answer"></div>`;
  }
  container.innerHTML = `
    <div class="test-layout">
      <div class="test-main">
        <div class="test-header"><h3>${currentTest.testName}</h3><div class="timer ${timeLeft<60?'warning':''}">⏱️ <span id="timerDisplay">${formatTime(timeLeft)}</span></div><button class="btn-outline" onclick="toggleLanguage()">🌐 ${lang==='en'?'हिंदी':'English'}</button></div>
        <div class="question-container">${images}<div class="question-text"><strong>Q${currentQIndex+1}:</strong> ${questionText}</div><div class="options-container">${optionsHtml}</div></div>
        <div class="question-actions"><button class="btn-outline" onclick="flagQuestion('${q.questionId}')">${flaggedQuestions.has(q.questionId)?'🏁 Unflag':'🚩 Flag'}</button><button class="btn-outline" onclick="clearAnswer('${q.questionId}')">🗑️ Clear</button></div>
        <div class="navigation"><button class="btn-outline" onclick="navigate(-1)" ${currentQIndex===0?'disabled':''}>← Previous</button><span>${currentQIndex+1}/${testQuestions.length}</span><button class="btn-primary" onclick="navigate(1)">${currentQIndex===testQuestions.length-1?'Submit':'Next →'}</button></div>
      </div>
      <div class="test-palette">
        <h4>Palette</h4>
        <div class="palette-grid">${testQuestions.map((q,i)=>`<button class="palette-btn ${getButtonClass(q.questionId)}" onclick="jumpTo(${i})">${i+1}</button>`).join('')}</div>
        <div class="palette-legend"><span><span class="legend-dot answered"></span> Answered</span><span><span class="legend-dot flagged"></span> Flagged</span><span><span class="legend-dot not-answered"></span> Not Answered</span></div>
      </div>
    </div>`;
}
function getButtonClass(qId) { if(flaggedQuestions.has(qId)) return 'flagged'; if(answers[qId]!==undefined) return 'answered'; return ''; }
window.saveAnswer = (qId, val) => { answers[qId] = val; renderTestInterface(); };
window.flagQuestion = (qId) => { flaggedQuestions.has(qId)? flaggedQuestions.delete(qId): flaggedQuestions.add(qId); renderTestInterface(); };
window.clearAnswer = (qId) => { delete answers[qId]; renderTestInterface(); };
window.navigate = (dir) => {
  if(dir===1 && currentQIndex===testQuestions.length-1) { if(confirm('Submit test?')) submitTest(); return; }
  currentQIndex = Math.max(0, Math.min(testQuestions.length-1, currentQIndex+dir));
  renderTestInterface();
};
window.jumpTo = (idx) => { currentQIndex = idx; renderTestInterface(); };
window.toggleLanguage = () => { const cur = localStorage.getItem('preferredLang')||'en'; localStorage.setItem('preferredLang', cur==='en'?'hi':'en'); renderTestInterface(); };

function startTimer() {
  timerInterval = setInterval(async () => {
    const res = await fetch(`/api/admin/paused-status/${student.studentId}/${currentTest.testId}`);
    const data = await res.json();
    if(data.paused){
      document.getElementById('testInterface').innerHTML = `<div class="paused-overlay"><h2>⏸️ Test Paused by Admin</h2><p>Please wait...</p></div>`;
      return;
    }
    timeLeft--;
    const timerEl = document.getElementById('timerDisplay');
    if(timerEl) { timerEl.textContent = formatTime(timeLeft); timerEl.parentElement.classList.toggle('warning', timeLeft<60); }
    if(timeLeft<=0){ clearInterval(timerInterval); submitTest(); }
  }, 1000);
}
function handleVisibilityChange() {
  if(document.hidden){
    visibilityWarningCount++;
    if(visibilityWarningCount >= MAX_WARNINGS){ alert('Too many tab switches. Auto-submitting.'); submitTest(); }
    else alert(`Warning ${visibilityWarningCount}/${MAX_WARNINGS}: Do not leave the test screen.`);
  }
}
async function submitTest() {
  clearInterval(timerInterval);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  const answerArray = Object.entries(answers).map(([qId,val])=>({questionId:qId, selectedAnswer:val}));
  showLoading();
  const res = await fetch('/api/student/submit-test', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ studentId:student.studentId, testId:currentTest.testId, answers:answerArray }) });
  const data = await res.json();
  hideLoading();
  alert(`Test submitted!\nScore: ${data.score}\nRank: ${data.rank}`);
  closeTestModal();
  loadAvailableTests();
  loadDashboardStats();
}
function closeTestModal() { document.getElementById('testModal').style.display = 'none'; clearInterval(timerInterval); }

// Results
async function loadResults() {
  showLoading();
  const results = await fetch(`/api/results/student/${student.studentId}`).then(r=>r.json());
  const tests = await fetch('/api/tests').then(r=>r.json());
  const testMap = Object.fromEntries(tests.map(t=>[t.testId, t.testName]));
  const tbody = document.querySelector('#resultsTable tbody');
  tbody.innerHTML = results.map(r=>`<tr><td>${testMap[r.testId]||r.testId}</td><td>${r.score}</td><td>${r.rank}</td><td>${new Date(r.submittedAt).toLocaleString()}</td><td><button class="btn-primary" onclick="viewAnalysis('${r._id}')">View</button></td></tr>`).join('');
  hideLoading();
}
window.viewAnalysis = async (resultId) => {
  const results = await fetch(`/api/results/student/${student.studentId}`).then(r=>r.json());
  const result = results.find(r=>r._id===resultId);
  const questions = await fetch(`/api/questions/${result.testId}`).then(r=>r.json());
  const qMap = Object.fromEntries(questions.map(q=>[q.questionId, q]));
  let html = `<h3>Analysis</h3><div style="max-height:400px;overflow-y:auto;">`;
  result.answers.forEach(ans=>{ const q=qMap[ans.questionId]; html+=`<div style="border-bottom:1px solid #eee;padding:10px"><p><strong>Q:</strong> ${q?.questionText.en}</p><p>Your Answer: ${ans.selectedAnswer||'Skipped'} | Correct: ${q?.correctAnswer}</p><p>Marks: ${ans.marksAwarded} (${ans.isCorrect?'✓':'✗'})</p></div>`; });
  html += '</div><button class="btn-primary" onclick="this.parentElement.parentElement.remove()">Close</button>';
  const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.innerHTML=`<div class="modal">${html}</div>`; document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
};

// Discussions
async function loadTestsForDropdown() {
  const tests = await fetch('/api/tests').then(r=>r.json());
  const select = document.getElementById('testSelectDiscussions');
  select.innerHTML = '<option value="">-- Select Test --</option>' + tests.map(t=>`<option value="${t.testId}">${t.testName}</option>`).join('');
}
async function loadDiscussions() {
  const testId = document.getElementById('testSelectDiscussions').value;
  if(!testId) { document.getElementById('discussionsList').innerHTML='<p class="empty-state">Select a test</p>'; return; }
  showLoading();
  const discussions = await fetch(`/api/discussions/${testId}`).then(r=>r.json());
  const container = document.getElementById('discussionsList');
  if(!discussions.length) { container.innerHTML='<p class="empty-state">No discussions</p>'; }
  else { container.innerHTML = discussions.map(d=>`<div class="card"><h4>${d.title}</h4><p>${d.description}</p>${d.link?`<a href="${d.link}" target="_blank">${d.link}</a>`:''}</div>`).join(''); }
  hideLoading();
}

// Messages
async function loadMessages() {
  showLoading();
  const messages = await fetch(`/api/messages?studentId=${student.studentId}`).then(r=>r.json());
  const container = document.getElementById('messagesContainer');
  container.innerHTML = messages.map(m=>`<div class="message-bubble ${m.sender}"><div class="message-header"><strong>${m.sender==='student'?'You':'Admin'}</strong><small>${new Date(m.timestamp).toLocaleString()}</small></div><p>${m.content}</p></div>`).join('');
  container.scrollTop = container.scrollHeight;
  const studentData = await fetch('/api/students').then(r=>r.json()).then(ss=>ss.find(s=>s.studentId===student.studentId));
  const warning = document.getElementById('messageWarning');
  const input = document.getElementById('newMessage');
  if(studentData?.status==='blocked'){ warning.textContent='You are blocked. Cannot send messages.'; input.disabled=true; }
  else { warning.textContent=''; input.disabled=false; }
  hideLoading();
}
window.sendMessage = async () => {
  const content = document.getElementById('newMessage').value.trim();
  if(!content) return;
  showLoading();
  await fetch('/api/messages', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ studentId:student.studentId, sender:'student', content }) });
  document.getElementById('newMessage').value = '';
  hideLoading();
  loadMessages();
};
