// student.js – complete student portal
const student = JSON.parse(localStorage.getItem('student'));
if (!student) location.href = 'index.html';

// Global test variables
let currentTest = null, testQuestions = [], answers = {}, timerInterval = null, timeLeft = 0;
let flaggedQuestions = new Set();
let visibilityWarningCount = 0;
const MAX_WARNINGS = 3;

// Display profile
document.getElementById('studentName').innerText = student.fullName;
document.getElementById('studentIdDisplay').innerText = student.studentId;
document.getElementById('dobDisplay').innerText = student.dob;
document.getElementById('classDisplay').innerText = student.class || 'N/A';

// Tabs
document.querySelectorAll('.tablink').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabcontent').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.tablink').forEach(tb => tb.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
    btn.classList.add('active');
    loadTabData(btn.dataset.tab);
  });
});

async function loadTabData(tab) {
  if (tab === 'availableTests') loadAvailableTests();
  else if (tab === 'previousResults') loadResults();
  else if (tab === 'discussions') { await loadTestsForDropdown(); loadDiscussions(); }
  else if (tab === 'messages') loadMessages();
}

// Dashboard stats
async function loadDashboardStats() {
  const results = await fetch(`/api/results/student/${student.studentId}`).then(r => r.json());
  document.getElementById('testsTaken').innerText = results.length;
  const avg = results.length ? (results.reduce((a,b)=>a+b.score,0)/results.length).toFixed(2) : 0;
  document.getElementById('avgScore').innerText = avg;
}

// Available tests (filtered by class & live)
async function loadAvailableTests() {
  const tests = await fetch(`/api/student/available-tests/${student.studentId}`).then(r => r.json());
  const html = tests.map(t => `
    <div class="test-card">
      <h3>${t.testName}</h3>
      <p>Duration: ${t.duration} min | Marks: +${t.marks.correct}/${t.marks.wrong}/${t.marks.skip}</p>
      <p>Time: ${new Date(t.startTime).toLocaleString()} - ${new Date(t.endTime).toLocaleString()}</p>
      <button onclick="startTest('${t.testId}')">Start Test</button>
    </div>
  `).join('');
  document.getElementById('testsList').innerHTML = html || '<p>No tests available for your class.</p>';
}

// Start test
window.startTest = async (testId) => {
  currentTest = await fetch('/api/tests').then(r => r.json()).then(tests => tests.find(t => t.testId === testId));
  testQuestions = await fetch(`/api/questions/${testId}`).then(r => r.json());
  if (currentTest.shuffle) testQuestions = shuffleArray(testQuestions);
  answers = {}; flaggedQuestions.clear();
  visibilityWarningCount = 0;

  // Get paused status
  const pauseRes = await fetch(`/api/admin/paused-status/${student.studentId}/${testId}`).then(r => r.json());
  const totalPaused = pauseRes.totalPausedDuration || 0;
  timeLeft = (currentTest.duration * 60) - totalPaused;

  document.addEventListener('visibilitychange', handleVisibilityChange);
  renderTestInterface();
  startTimer();
  document.getElementById('testModal').style.display = 'flex';
};

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let currentQIndex = 0;
function renderTestInterface() {
  const container = document.getElementById('testInterface');
  const q = testQuestions[currentQIndex];
  const lang = localStorage.getItem('preferredLang') || 'en';
  const questionText = q.questionText[lang] || q.questionText.en;
  const images = q.imageUrls?.map(url => `<img src="${url}" style="max-width:100%;">`).join('') || '';
  let optionsHtml = '';
  if (q.type === 'mcq') {
    optionsHtml = q.options.map((opt, i) => `
      <label style="display:block;margin:8px 0;">
        <input type="radio" name="mcq" value="${i+1}" ${answers[q.questionId] == i+1 ? 'checked' : ''} 
          onchange="saveAnswer('${q.questionId}', ${i+1})">
        ${opt[lang] || opt.en}
      </label>
    `).join('');
  } else {
    optionsHtml = `
      <input type="number" step="any" value="${answers[q.questionId] || ''}" 
        onchange="saveAnswer('${q.questionId}', this.value)" placeholder="Enter answer">
    `;
  }
  container.innerHTML = `
    <div style="display:flex; gap:20px;">
      <div style="flex:3;">
        <h3>${currentTest.testName}</h3>
        <p>Time Left: <span id="timerDisplay">${formatTime(timeLeft)}</span></p>
        <button onclick="toggleLanguage()">Switch to ${lang === 'en' ? 'Hindi' : 'English'}</button>
        <div style="margin:20px 0;">${images}<p><strong>Q${currentQIndex+1}:</strong> ${questionText}</p>${optionsHtml}</div>
        <div>
          <button onclick="flagQuestion('${q.questionId}')">${flaggedQuestions.has(q.questionId) ? 'Unflag' : 'Flag'}</button>
          <button onclick="clearAnswer('${q.questionId}')">Clear</button>
        </div>
        <div style="margin-top:20px;">
          <button onclick="navigate(-1)" ${currentQIndex===0?'disabled':''}>Previous</button>
          <button onclick="navigate(1)">${currentQIndex===testQuestions.length-1?'Submit':'Next'}</button>
        </div>
      </div>
      <div style="flex:1; border-left:1px solid #ccc; padding-left:20px;">
        <h4>Palette</h4>
        <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px;">
          ${testQuestions.map((q, i) => `
            <button style="background:${getButtonColor(q.questionId)}; padding:8px;" 
              onclick="jumpTo(${i})">${i+1}</button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function formatTime(sec) {
  return `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`;
}
function getButtonColor(qId) {
  if (flaggedQuestions.has(qId)) return '#f1c40f';
  if (answers[qId] !== undefined) return '#2ecc71';
  return '#ecf0f1';
}
window.saveAnswer = (qId, val) => { answers[qId] = val; renderTestInterface(); };
window.flagQuestion = (qId) => { flaggedQuestions.has(qId) ? flaggedQuestions.delete(qId) : flaggedQuestions.add(qId); renderTestInterface(); };
window.clearAnswer = (qId) => { delete answers[qId]; renderTestInterface(); };
window.navigate = (dir) => {
  if (dir === 1 && currentQIndex === testQuestions.length - 1) { submitTest(); return; }
  currentQIndex = Math.max(0, Math.min(testQuestions.length-1, currentQIndex+dir));
  renderTestInterface();
};
window.jumpTo = (idx) => { currentQIndex = idx; renderTestInterface(); };
window.toggleLanguage = () => {
  const cur = localStorage.getItem('preferredLang') || 'en';
  localStorage.setItem('preferredLang', cur === 'en' ? 'hi' : 'en');
  renderTestInterface();
};

function startTimer() {
  timerInterval = setInterval(async () => {
    const res = await fetch(`/api/admin/paused-status/${student.studentId}/${currentTest.testId}`);
    const data = await res.json();
    if (data.paused) {
      document.getElementById('testInterface').innerHTML = '<h2>Test Paused by Admin</h2><p>Please wait...</p>';
      return;
    }
    timeLeft--;
    document.getElementById('timerDisplay').innerText = formatTime(timeLeft);
    if (timeLeft <= 0) submitTest();
  }, 1000);
}

function handleVisibilityChange() {
  if (document.hidden) {
    visibilityWarningCount++;
    if (visibilityWarningCount >= MAX_WARNINGS) {
      alert('Too many tab switches. Test auto-submitted.');
      submitTest();
    } else {
      alert(`Warning ${visibilityWarningCount}/${MAX_WARNINGS}: Do not leave the test screen.`);
    }
  }
}

async function submitTest() {
  clearInterval(timerInterval);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  const answerArray = Object.entries(answers).map(([qId, val]) => ({ questionId: qId, selectedAnswer: val }));
  const res = await fetch('/api/student/submit-test', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId: student.studentId, testId: currentTest.testId, answers: answerArray })
  });
  const data = await res.json();
  alert(`Test submitted! Score: ${data.score}, Rank: ${data.rank}`);
  closeTestModal();
  loadAvailableTests();
  loadDashboardStats();
}

function closeTestModal() {
  document.getElementById('testModal').style.display = 'none';
  clearInterval(timerInterval);
}

// Results
async function loadResults() {
  const results = await fetch(`/api/results/student/${student.studentId}`).then(r => r.json());
  const tests = await fetch('/api/tests').then(r => r.json());
  const testMap = Object.fromEntries(tests.map(t => [t.testId, t.testName]));
  const tbody = document.querySelector('#resultsTable tbody');
  tbody.innerHTML = results.map(r => `
    <tr>
      <td>${testMap[r.testId] || r.testId}</td><td>${r.score}</td><td>${r.rank}</td>
      <td>${new Date(r.submittedAt).toLocaleString()}</td>
      <td><button onclick="viewAnalysis('${r._id}')">View</button></td>
    </tr>
  `).join('');
}
window.viewAnalysis = async (resultId) => {
  const results = await fetch(`/api/results/student/${student.studentId}`).then(r => r.json());
  const result = results.find(r => r._id === resultId);
  const questions = await fetch(`/api/questions/${result.testId}`).then(r => r.json());
  const qMap = Object.fromEntries(questions.map(q => [q.questionId, q]));
  let html = `<h3>Analysis</h3>`;
  result.answers.forEach(ans => {
    const q = qMap[ans.questionId];
    html += `<div><p><strong>Q:</strong> ${q?.questionText.en}</p><p>Your Answer: ${ans.selectedAnswer||'Skipped'} | Correct: ${q?.correctAnswer}</p><p>Marks: ${ans.marksAwarded}</p></div><hr>`;
  });
  alert(html); // For brevity, use modal in production
};

// Discussions
async function loadTestsForDropdown() {
  const tests = await fetch('/api/tests').then(r => r.json());
  const select = document.getElementById('testSelectDiscussions');
  select.innerHTML = '<option value="">-- Select Test --</option>' + tests.map(t => `<option value="${t.testId}">${t.testName}</option>`).join('');
}
async function loadDiscussions() {
  const testId = document.getElementById('testSelectDiscussions').value;
  if (!testId) return;
  const discussions = await fetch(`/api/discussions/${testId}`).then(r => r.json());
  const container = document.getElementById('discussionsList');
  container.innerHTML = discussions.map(d => `
    <div class="discussion-card">
      <h3>${d.title}</h3><p>${d.description}</p>
      ${d.link ? `<a href="${d.link}" target="_blank">${d.link}</a>` : ''}
    </div>
  `).join('');
}

// Messages
async function loadMessages() {
  const messages = await fetch(`/api/messages?studentId=${student.studentId}`).then(r => r.json());
  const container = document.getElementById('messagesContainer');
  container.innerHTML = messages.map(m => `
    <div class="message-bubble ${m.sender==='student'?'student-message':'admin-message'}">
      <strong>${m.sender==='student'?'You':'Admin'}</strong>
      <p>${m.content}</p><small>${new Date(m.timestamp).toLocaleString()}</small>
    </div>
  `).join('');
  // Check blocked status
  const studentData = await fetch('/api/students').then(r => r.json()).then(ss => ss.find(s => s.studentId === student.studentId));
  if (studentData?.status === 'blocked') {
    document.getElementById('messageWarning').innerText = 'You are blocked. Cannot send messages.';
    document.getElementById('newMessage').disabled = true;
  } else {
    document.getElementById('newMessage').disabled = false;
  }
}
window.sendMessage = async () => {
  const content = document.getElementById('newMessage').value;
  if (!content) return;
  await fetch('/api/messages', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId: student.studentId, sender: 'student', content })
  });
  document.getElementById('newMessage').value = '';
  loadMessages();
};

// Logout
document.getElementById('logoutBtn').onclick = () => {
  localStorage.removeItem('student');
  location.href = 'index.html';
};

// Initialize
loadDashboardStats();
loadAvailableTests();
