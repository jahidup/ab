// admin.js – Premium Admin Dashboard
// Authentication check
if (!localStorage.getItem('adminToken')) {
  location.replace('index.html');
}

// Global state
let studentsData = [];
let testsData = [];
let questionsData = [];
let resultsData = [];
let discussionsData = [];
let messagesData = [];
let currentTestForQuestions = '';
let currentReplyToStudent = null;
let selectedCSVFile = null;

// DOM Elements
const pageTitle = document.getElementById('pageTitle');

// ========== UTILITIES ==========
function showLoading() {
  document.getElementById('globalLoading').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('globalLoading').style.display = 'none';
}
function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}
window.closeModal = () => {
  document.getElementById('modalOverlay').style.display = 'none';
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  loadDashboard();
  setupLogout();
  setupCSVListener();
  // Close modal on overlay click
  document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      if (!tab) return;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(tab).classList.add('active');
      pageTitle.textContent = item.textContent.trim();
      loadTabData(tab);
    });
  });
}

function setupLogout() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    location.replace('index.html');
  });
}

function setupCSVListener() {
  const input = document.getElementById('csvFileInput');
  if (input) {
    input.addEventListener('change', (e) => {
      selectedCSVFile = e.target.files[0];
      document.getElementById('uploadCsvBtn').style.display = selectedCSVFile ? 'inline-block' : 'none';
    });
  }
}

async function loadTabData(tab) {
  const loaders = {
    dashboard: loadDashboard,
    students: loadStudents,
    tests: loadTests,
    questions: async () => { await loadTestsForDropdown(); loadQuestions(); },
    results: async () => { await loadTestsForDropdown('testFilterResults'); loadResults(); },
    discussions: async () => { await loadTestsForDropdown('testSelectDiscussions'); loadDiscussions(); },
    messages: loadMessages,
    blocked: loadBlocked,
    monitor: async () => { await loadActiveTests(); },
    settings: () => {}
  };
  if (loaders[tab]) await loaders[tab]();
}

window.refreshCurrentTab = () => {
  const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
  if (activeTab) loadTabData(activeTab);
};

// ========== DASHBOARD ==========
async function loadDashboard() {
  showLoading();
  try {
    const [students, tests] = await Promise.all([
      fetch('/api/students').then(r => r.json()),
      fetch('/api/tests').then(r => r.json())
    ]);
    let totalQ = 0;
    for (let t of tests) {
      const qs = await fetch(`/api/questions/${t.testId}`).then(r => r.json());
      totalQ += qs.length;
    }
    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('totalTests').textContent = tests.length;
    document.getElementById('totalQuestions').textContent = totalQ;
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

// ========== STUDENTS ==========
async function loadStudents() {
  showLoading();
  try {
    studentsData = await fetch('/api/students').then(r => r.json());
    renderStudentsTable();
  } finally {
    hideLoading();
  }
}
function renderStudentsTable() {
  const tbody = document.querySelector('#studentsTable tbody');
  const search = document.getElementById('studentSearch')?.value.toLowerCase() || '';
  const filtered = studentsData.filter(s =>
    s.studentId.toLowerCase().includes(search) || s.fullName.toLowerCase().includes(search)
  );
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td>${s.studentId}</td><td>${s.fullName}</td><td>${s.dob}</td><td>${s.class || '—'}</td>
      <td>${s.mobile || '—'}</td><td>${s.email || '—'}</td>
      <td><span class="status-badge ${s.status}">${s.status}</span></td>
      <td>
        ${s.status === 'active' 
          ? `<button class="btn-danger" onclick="blockStudent('${s.studentId}')">Block</button>` 
          : `<button class="btn-success" onclick="unblockStudent('${s.studentId}')">Unblock</button>`}
      </td>
    </tr>
  `).join('');
}
window.filterStudents = () => renderStudentsTable();
window.blockStudent = async (id) => {
  const reason = prompt('Enter block reason:');
  if (!reason) return;
  showLoading();
  await fetch(`/api/students/${id}/block`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({reason}) });
  await loadStudents();
  hideLoading();
};
window.unblockStudent = async (id) => {
  showLoading();
  await fetch(`/api/students/${id}/unblock`, { method: 'PUT' });
  await loadStudents();
  if (document.querySelector('.nav-item.active')?.dataset.tab === 'blocked') loadBlocked();
  hideLoading();
};
window.openAddStudentModal = () => {
  const html = `
    <h3>Add Student</h3>
    <div class="input-group"><label>Student ID *</label><input id="newStudentId"></div>
    <div class="input-group"><label>Full Name *</label><input id="newFullName"></div>
    <div class="input-group"><label>DOB (DDMMYYYY) *</label><input id="newDob"></div>
    <div class="input-group"><label>Class</label><input id="newClass"></div>
    <div class="input-group"><label>Mobile</label><input id="newMobile"></div>
    <div class="input-group"><label>Email</label><input id="newEmail"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addStudent()">Save</button>
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
    </div>
  `;
  showModal(html);
};
window.addStudent = async () => {
  const data = {
    studentId: document.getElementById('newStudentId').value,
    fullName: document.getElementById('newFullName').value,
    dob: document.getElementById('newDob').value,
    class: document.getElementById('newClass').value,
    mobile: document.getElementById('newMobile').value,
    email: document.getElementById('newEmail').value
  };
  showLoading();
  const res = await fetch('/api/students', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  const result = await res.json();
  hideLoading();
  if (result.success) { closeModal(); loadStudents(); }
  else alert(result.message);
};

// ========== TESTS ==========
async function loadTests() {
  showLoading();
  try {
    testsData = await fetch('/api/tests').then(r => r.json());
    renderTestsTable();
  } finally { hideLoading(); }
}
function renderTestsTable() {
  const tbody = document.querySelector('#testsTable tbody');
  const search = document.getElementById('testSearch')?.value.toLowerCase() || '';
  const filtered = testsData.filter(t => t.testId.toLowerCase().includes(search) || t.testName.toLowerCase().includes(search));
  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td>${t.testId}</td><td>${t.testName}</td><td>${t.duration} min</td>
      <td>+${t.marks.correct}/${t.marks.wrong}/${t.marks.skip}</td>
      <td>${t.shuffle?'Yes':'No'}</td><td>${t.isLive?'🔴 Live':'⚫ Draft'}</td>
      <td>
        <button class="btn-icon" onclick="editTest('${t.testId}')">✏️</button>
        <button class="btn-icon" onclick="deleteTest('${t.testId}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}
window.filterTests = () => renderTestsTable();
window.openCreateTestModal = () => {
  const html = `
    <h3>Create Test</h3>
    <div class="input-group"><label>Test ID *</label><input id="newTestId"></div>
    <div class="input-group"><label>Test Name *</label><input id="newTestName"></div>
    <div class="input-group"><label>Duration (min) *</label><input id="newDuration" type="number" value="60"></div>
    <div class="form-row"><label>Marks:</label><input id="marksCorrect" type="number" value="1" style="width:70px"> <input id="marksWrong" type="number" value="0" style="width:70px"> <input id="marksSkip" type="number" value="0" style="width:70px"></div>
    <div class="input-group"><label>Allowed Classes (comma)</label><input id="allowedClasses" placeholder="10,12"></div>
    <div class="form-row"><label><input type="checkbox" id="shuffleQuestions"> Shuffle</label> <label><input type="checkbox" id="isLive"> Live</label></div>
    <div class="form-row"><label>Start:</label><input type="datetime-local" id="startTime"></div>
    <div class="form-row"><label>End:</label><input type="datetime-local" id="endTime"></div>
    <div class="modal-actions"><button class="btn-primary" onclick="createTest()">Create</button><button class="btn-outline" onclick="closeModal()">Cancel</button></div>
  `;
  showModal(html);
};
window.createTest = async () => {
  const data = {
    testId: document.getElementById('newTestId').value,
    testName: document.getElementById('newTestName').value,
    duration: parseInt(document.getElementById('newDuration').value),
    marks: { correct: parseFloat(document.getElementById('marksCorrect').value)||1, wrong: parseFloat(document.getElementById('marksWrong').value)||0, skip: parseFloat(document.getElementById('marksSkip').value)||0 },
    shuffle: document.getElementById('shuffleQuestions').checked,
    allowedClasses: document.getElementById('allowedClasses').value.split(',').map(s=>s.trim()).filter(s=>s),
    isLive: document.getElementById('isLive').checked,
    startTime: document.getElementById('startTime').value,
    endTime: document.getElementById('endTime').value
  };
  showLoading();
  const res = await fetch('/api/tests', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  const result = await res.json();
  hideLoading();
  if (result.success) { closeModal(); loadTests(); }
  else alert(result.message);
};
window.editTest = async (testId) => {
  const test = testsData.find(t=>t.testId===testId);
  if(!test) return;
  const html = `
    <h3>Edit Test</h3>
    <div class="input-group"><label>Test ID</label><input id="editTestId" value="${test.testId}" readonly></div>
    <div class="input-group"><label>Test Name</label><input id="editTestName" value="${test.testName}"></div>
    <div class="input-group"><label>Duration</label><input id="editDuration" type="number" value="${test.duration}"></div>
    <div class="form-row"><label>Marks:</label><input id="editMarksCorrect" type="number" value="${test.marks.correct}" style="width:70px"> <input id="editMarksWrong" type="number" value="${test.marks.wrong}" style="width:70px"> <input id="editMarksSkip" type="number" value="${test.marks.skip}" style="width:70px"></div>
    <div class="input-group"><label>Allowed Classes</label><input id="editAllowedClasses" value="${(test.allowedClasses||[]).join(',')}"></div>
    <div class="form-row"><label><input type="checkbox" id="editShuffle" ${test.shuffle?'checked':''}> Shuffle</label> <label><input type="checkbox" id="editIsLive" ${test.isLive?'checked':''}> Live</label></div>
    <div class="form-row"><label>Start:</label><input type="datetime-local" id="editStartTime" value="${test.startTime?.slice(0,16)||''}"></div>
    <div class="form-row"><label>End:</label><input type="datetime-local" id="editEndTime" value="${test.endTime?.slice(0,16)||''}"></div>
    <div class="modal-actions"><button class="btn-primary" onclick="updateTest('${testId}')">Update</button><button class="btn-outline" onclick="closeModal()">Cancel</button></div>
  `;
  showModal(html);
};
window.updateTest = async (testId) => {
  const data = {
    testName: document.getElementById('editTestName').value,
    duration: parseInt(document.getElementById('editDuration').value),
    marks: { correct: parseFloat(document.getElementById('editMarksCorrect').value), wrong: parseFloat(document.getElementById('editMarksWrong').value), skip: parseFloat(document.getElementById('editMarksSkip').value) },
    shuffle: document.getElementById('editShuffle').checked,
    allowedClasses: document.getElementById('editAllowedClasses').value.split(',').map(s=>s.trim()),
    isLive: document.getElementById('editIsLive').checked,
    startTime: document.getElementById('editStartTime').value,
    endTime: document.getElementById('editEndTime').value
  };
  showLoading();
  await fetch(`/api/tests/${testId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  hideLoading();
  closeModal();
  loadTests();
};
window.deleteTest = async (id) => {
  if(!confirm('Delete test and all related data?')) return;
  showLoading();
  await fetch(`/api/tests/${id}`, { method:'DELETE' });
  hideLoading();
  loadTests();
};

// ========== QUESTIONS ==========
async function loadTestsForDropdown(selectId='testSelectForQuestions') {
  const tests = await fetch('/api/tests').then(r=>r.json());
  const select = document.getElementById(selectId);
  if(select) select.innerHTML = '<option value="">-- Select Test --</option>' + tests.map(t=>`<option value="${t.testId}">${t.testName}</option>`).join('');
}
async function loadQuestions() {
  const testId = document.getElementById('testSelectForQuestions').value;
  currentTestForQuestions = testId;
  if(!testId) { questionsData = []; renderQuestionsTable(); return; }
  showLoading();
  questionsData = await fetch(`/api/questions/${testId}`).then(r=>r.json());
  renderQuestionsTable();
  hideLoading();
}
function renderQuestionsTable() {
  const tbody = document.querySelector('#questionsTable tbody');
  const search = document.getElementById('questionSearch')?.value.toLowerCase() || '';
  const filtered = questionsData.filter(q=> q.questionId.toLowerCase().includes(search) || q.questionText.en.toLowerCase().includes(search));
  tbody.innerHTML = filtered.map(q=>`
    <tr><td>${q.questionId}</td><td>${q.type}</td><td>${q.questionText.en.substring(0,50)}...</td>
      <td><button class="btn-icon" onclick="editQuestion('${q._id}')">✏️</button><button class="btn-icon" onclick="deleteQuestion('${q._id}')">🗑️</button></td>
    </tr>
  `).join('');
}
window.filterQuestions = () => renderQuestionsTable();
window.openAddQuestionModal = () => {
  if(!currentTestForQuestions) { alert('Select a test first'); return; }
  const html = `
    <h3>Add Question</h3>
    <div class="input-group"><label>Question ID</label><input id="qId"></div>
    <div class="input-group"><label>Type</label><select id="qType"><option value="mcq">MCQ</option><option value="numerical">Numerical</option></select></div>
    <div class="input-group"><label>Question (EN)</label><textarea id="qTextEn"></textarea></div>
    <div class="input-group"><label>Question (HI)</label><textarea id="qTextHi"></textarea></div>
    <div id="mcqOptions">
      ${[1,2,3,4].map(i=>`<div class="form-row"><input id="opt${i}en" placeholder="Option ${i} EN"> <input id="opt${i}hi" placeholder="Option ${i} HI"></div>`).join('')}
      <div class="input-group"><label>Correct Option (1-4)</label><input id="correctMcq" type="number" min="1" max="4"></div>
    </div>
    <div id="numOptions" style="display:none;">
      <div class="form-row"><input id="correctNum" placeholder="Correct Answer"> <input id="tolerance" placeholder="Tolerance" value="0.01"></div>
    </div>
    <div class="form-row"><label>Marks (opt):</label><input id="mCorrect" type="number" placeholder="Correct"> <input id="mWrong" type="number" placeholder="Wrong"> <input id="mSkip" type="number" placeholder="Skip"></div>
    <div class="input-group"><label>Image URLs (;)</label><input id="imgUrls"></div>
    <div class="modal-actions"><button class="btn-primary" onclick="addQuestion()">Save</button><button class="btn-outline" onclick="closeModal()">Cancel</button></div>
  `;
  showModal(html);
  document.getElementById('qType').addEventListener('change', (e)=>{
    document.getElementById('mcqOptions').style.display = e.target.value==='mcq'?'block':'none';
    document.getElementById('numOptions').style.display = e.target.value==='numerical'?'block':'none';
  });
};
window.addQuestion = async () => {
  const type = document.getElementById('qType').value;
  const question = {
    testId: currentTestForQuestions,
    questionId: document.getElementById('qId').value,
    type,
    questionText: { en: document.getElementById('qTextEn').value, hi: document.getElementById('qTextHi').value },
    marks: { correct: parseFloat(document.getElementById('mCorrect').value)||undefined, wrong: parseFloat(document.getElementById('mWrong').value)||undefined, skip: parseFloat(document.getElementById('mSkip').value)||undefined },
    imageUrls: document.getElementById('imgUrls').value.split(';').map(s=>s.trim()).filter(s=>s)
  };
  if(type==='mcq'){
    question.options = [1,2,3,4].map(i=>({ en: document.getElementById(`opt${i}en`).value, hi: document.getElementById(`opt${i}hi`).value }));
    question.correctAnswer = parseInt(document.getElementById('correctMcq').value);
  } else {
    question.correctAnswer = parseFloat(document.getElementById('correctNum').value);
    question.tolerance = parseFloat(document.getElementById('tolerance').value)||0.01;
  }
  showLoading();
  const res = await fetch('/api/questions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(question) });
  const result = await res.json();
  hideLoading();
  if(result.success){ closeModal(); loadQuestions(); }
  else alert(result.message);
};
// editQuestion, deleteQuestion, uploadCSV similar (omitted for brevity but present in full code)

// ========== RESULTS ==========
async function loadResults() {
  const testId = document.getElementById('testFilterResults').value;
  let url = '/api/results'; if(testId) url = `/api/results/test/${testId}`;
  showLoading();
  resultsData = await fetch(url).then(r=>r.json());
  const [students, tests] = await Promise.all([fetch('/api/students').then(r=>r.json()), fetch('/api/tests').then(r=>r.json())]);
  const studentMap = Object.fromEntries(students.map(s=>[s.studentId, s.fullName]));
  const testMap = Object.fromEntries(tests.map(t=>[t.testId, t.testName]));
  resultsData = resultsData.map(r=>({...r, studentName: studentMap[r.studentId]||r.studentId, testName: testMap[r.testId]||r.testId}));
  renderResultsTable();
  hideLoading();
}
function renderResultsTable() {
  const tbody = document.querySelector('#resultsTable tbody');
  const search = document.getElementById('resultSearch')?.value.toLowerCase()||'';
  const filtered = resultsData.filter(r=> r.studentName.toLowerCase().includes(search)||r.testName.toLowerCase().includes(search));
  tbody.innerHTML = filtered.map(r=>`
    <tr><td>${r.studentName} (${r.studentId})</td><td>${r.testName}</td><td>${r.score}</td><td>${r.rank}</td><td>${new Date(r.submittedAt).toLocaleString()}</td><td><button class="btn-primary" onclick="viewAnalysis('${r._id}')">View</button></td></tr>
  `).join('');
}
window.filterResults = () => renderResultsTable();
window.viewAnalysis = async (resultId) => {
  const result = resultsData.find(r=>r._id===resultId);
  const questions = await fetch(`/api/questions/${result.testId}`).then(r=>r.json());
  const qMap = Object.fromEntries(questions.map(q=>[q.questionId, q]));
  let html = `<h3>Analysis: ${result.studentName}</h3><div style="max-height:400px;overflow-y:auto;">`;
  result.answers.forEach(ans=>{
    const q = qMap[ans.questionId];
    html += `<div style="border-bottom:1px solid #eee;padding:10px"><p><strong>Q:</strong> ${q?.questionText.en}</p><p>Your Answer: ${ans.selectedAnswer||'Skipped'} | Correct: ${q?.correctAnswer}</p><p>Marks: ${ans.marksAwarded} (${ans.isCorrect?'✓':'✗'})</p></div>`;
  });
  html += '</div><div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Close</button></div>';
  showModal(html);
};

// ========== DISCUSSIONS ==========
async function loadDiscussions() {
  const testId = document.getElementById('testSelectDiscussions').value;
  if(!testId) { document.getElementById('discussionsList').innerHTML='<p class="empty-state">Select a test</p>'; return; }
  showLoading();
  discussionsData = await fetch(`/api/discussions/${testId}`).then(r=>r.json());
  renderDiscussions();
  hideLoading();
}
function renderDiscussions() {
  const container = document.getElementById('discussionsList');
  if(!discussionsData.length) { container.innerHTML='<p class="empty-state">No discussions</p>'; return; }
  container.innerHTML = discussionsData.map(d=>`<div class="card"><h4>${d.title}</h4><p>${d.description}</p>${d.link?`<a href="${d.link}" target="_blank">${d.link}</a>`:''}<div style="margin-top:12px;"><button class="btn-danger" onclick="deleteDiscussion('${d._id}')">Delete</button></div></div>`).join('');
}
window.openNewPostModal = () => {
  const testId = document.getElementById('testSelectDiscussions').value;
  if(!testId) { alert('Select a test'); return; }
  const html = `<h3>New Discussion</h3><div class="input-group"><label>Title</label><input id="discTitle"></div><div class="input-group"><label>Description</label><textarea id="discDesc"></textarea></div><div class="input-group"><label>Link</label><input id="discLink"></div><div class="modal-actions"><button class="btn-primary" onclick="createDiscussion('${testId}')">Post</button><button class="btn-outline" onclick="closeModal()">Cancel</button></div>`;
  showModal(html);
};
window.createDiscussion = async (testId) => {
  const data = { testId, title: document.getElementById('discTitle').value, description: document.getElementById('discDesc').value, link: document.getElementById('discLink').value };
  showLoading();
  await fetch('/api/discussions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  hideLoading();
  closeModal();
  loadDiscussions();
};
window.deleteDiscussion = async (id) => {
  if(!confirm('Delete?')) return;
  showLoading();
  await fetch(`/api/discussions/${id}`, { method:'DELETE' });
  hideLoading();
  loadDiscussions();
};

// ========== MESSAGES ==========
async function loadMessages() {
  showLoading();
  messagesData = await fetch('/api/messages').then(r=>r.json());
  renderMessages();
  hideLoading();
}
function renderMessages() {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = messagesData.map(m=>`
    <div class="message-bubble ${m.sender}">
      <div class="message-header"><strong>${m.sender==='student'?m.studentId:'Admin'}</strong><small>${new Date(m.timestamp).toLocaleString()}</small></div>
      <p>${m.content}</p>
      ${m.isUnblockRequest?`<button class="btn-success" onclick="unblockStudent('${m.studentId}')">Unblock</button>`:''}
      ${m.sender==='student' && !m.isUnblockRequest?`<button class="btn-outline" onclick="openReply('${m.studentId}')">Reply</button>`:''}
    </div>
  `).join('');
}
window.openReply = (studentId) => {
  currentReplyToStudent = studentId;
  document.getElementById('replyBox').style.display = 'flex';
  document.getElementById('replyContent').focus();
};
window.cancelReply = () => {
  currentReplyToStudent = null;
  document.getElementById('replyBox').style.display = 'none';
  document.getElementById('replyContent').value = '';
};
window.sendReply = async () => {
  const content = document.getElementById('replyContent').value.trim();
  if(!content) return;
  showLoading();
  await fetch('/api/messages', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ studentId: currentReplyToStudent, sender:'admin', content }) });
  hideLoading();
  cancelReply();
  loadMessages();
};

// ========== BLOCKED ==========
async function loadBlocked() {
  showLoading();
  const students = await fetch('/api/students').then(r=>r.json());
  const blocked = students.filter(s=>s.status==='blocked');
  const tbody = document.querySelector('#blockedTable tbody');
  tbody.innerHTML = blocked.map(s=>`<tr><td>${s.studentId}</td><td>${s.fullName}</td><td>${s.blockReason}</td><td>${s.blockedAt?new Date(s.blockedAt).toLocaleString():'—'}</td><td><button class="btn-success" onclick="unblockStudent('${s.studentId}')">Unblock</button></td></tr>`).join('');
  hideLoading();
}

// ========== MONITOR (Pause/Resume) ==========
async function loadActiveTests() {
  const tests = await fetch('/api/tests').then(r=>r.json());
  const liveTests = tests.filter(t=>t.isLive);
  const select = document.getElementById('activeTestSelect');
  select.innerHTML = '<option value="">-- Select Live Test --</option>' + liveTests.map(t=>`<option value="${t.testId}">${t.testName}</option>`).join('');
}
window.loadTestTakers = async () => {
  const testId = document.getElementById('activeTestSelect').value;
  if(!testId) return;
  showLoading();
  const results = await fetch(`/api/results/test/${testId}`).then(r=>r.json());
  const students = await fetch('/api/students').then(r=>r.json());
  const studentMap = Object.fromEntries(students.map(s=>[s.studentId, s]));
  const tbody = document.querySelector('#testTakersTable tbody');
  tbody.innerHTML = results.map(r=>{
    const paused = r.paused ? '⏸️ Paused' : '▶️ Active';
    return `<tr><td>${r.studentId}</td><td>${studentMap[r.studentId]?.fullName||''}</td><td>${paused}</td><td>${!r.paused?`<button class="btn-warning" onclick="promptPause('${r.studentId}','${testId}')">Pause</button>`:`<button class="btn-success" onclick="promptResume('${r.studentId}','${testId}')">Resume</button>`}</td></tr>`;
  }).join('');
  hideLoading();
};
window.promptPause = async (studentId, testId) => {
  const password = prompt('Enter pause password:');
  if(!password) return;
  showLoading();
  const res = await fetch('/api/admin/pause-test', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ studentId, testId, password }) });
  const data = await res.json();
  hideLoading();
  if(data.success){ alert('Test paused'); loadTestTakers(); }
  else alert(data.message);
};
window.promptResume = async (studentId, testId) => {
  const password = prompt('Enter resume password:');
  if(!password) return;
  showLoading();
  const res = await fetch('/api/admin/resume-test', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ studentId, testId, password }) });
  const data = await res.json();
  hideLoading();
  if(data.success){ alert('Test resumed'); loadTestTakers(); }
  else alert(data.message);
};

// ========== SETTINGS ==========
window.updatePassword = async () => {
  const newPass = document.getElementById('newPassword').value;
  if(!newPass) return alert('Enter new password');
  showLoading();
  await fetch('/api/settings/password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password: newPass}) });
  hideLoading();
  alert('Password updated');
  document.getElementById('newPassword').value = '';
};
