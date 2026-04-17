// admin.js – complete admin dashboard logic
// Check auth
if (!localStorage.getItem('adminToken')) location.href = 'index.html';

// Global state
let studentsData = [], testsData = [], questionsData = [], resultsData = [], discussionsData = [], messagesData = [];
let currentTestForQuestions = '', currentReplyToStudent = null;
let selectedCSVFile = null;

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  setupTabs();
  document.getElementById('logoutBtn').addEventListener('click', logout);
  // CSV file input listener
  document.getElementById('csvFileInput')?.addEventListener('change', (e) => {
    selectedCSVFile = e.target.files[0];
    document.getElementById('uploadCsvBtn').style.display = selectedCSVFile ? 'inline-block' : 'none';
  });
});

function setupTabs() {
  document.querySelectorAll('.tablink').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabcontent').forEach(tc => tc.classList.remove('active'));
      document.querySelectorAll('.tablink').forEach(tb => tb.classList.remove('active'));
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
      loadTabData(tabId);
    });
  });
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
    settings: () => {} // nothing to load
  };
  if (loaders[tab]) await loaders[tab]();
}

function logout() {
  localStorage.removeItem('adminToken');
  location.href = 'index.html';
}

// ========== DASHBOARD ==========
async function loadDashboard() {
  try {
    const students = await fetch('/api/students').then(r => r.json());
    const tests = await fetch('/api/tests').then(r => r.json());
    let totalQ = 0;
    for (let t of tests) {
      const qs = await fetch(`/api/questions/${t.testId}`).then(r => r.json());
      totalQ += qs.length;
    }
    document.getElementById('totalStudents').innerText = students.length;
    document.getElementById('totalTests').innerText = tests.length;
    document.getElementById('totalQuestions').innerText = totalQ;
  } catch (err) {
    console.error(err);
  }
}

// ========== STUDENTS ==========
async function loadStudents() {
  studentsData = await fetch('/api/students').then(r => r.json());
  renderStudentsTable();
}
function renderStudentsTable() {
  const tbody = document.querySelector('#studentsTable tbody');
  const search = document.getElementById('studentSearch')?.value.toLowerCase() || '';
  const filtered = studentsData.filter(s =>
    s.studentId.toLowerCase().includes(search) || s.fullName.toLowerCase().includes(search)
  );
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td>${s.studentId}</td><td>${s.fullName}</td><td>${s.dob}</td><td>${s.class || ''}</td>
      <td>${s.mobile || ''}</td><td>${s.email || ''}</td><td>${s.status}</td>
      <td>
        ${s.status === 'active' 
          ? `<button class="danger" onclick="blockStudent('${s.studentId}')">Block</button>` 
          : `<button class="success" onclick="unblockStudent('${s.studentId}')">Unblock</button>`}
      </td>
    </tr>
  `).join('');
}
window.filterStudents = () => renderStudentsTable();
window.blockStudent = async (id) => {
  const reason = prompt('Enter block reason:');
  if (reason) {
    await fetch(`/api/students/${id}/block`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({reason}) });
    loadStudents();
  }
};
window.unblockStudent = async (id) => {
  await fetch(`/api/students/${id}/unblock`, { method: 'PUT' });
  loadStudents();
};
window.openAddStudentModal = () => {
  const html = `
    <h3>Add Student</h3>
    <input id="newStudentId" placeholder="Student ID (required)"><br>
    <input id="newFullName" placeholder="Full Name"><br>
    <input id="newDob" placeholder="DOB (DDMMYYYY)"><br>
    <input id="newClass" placeholder="Class"><br>
    <input id="newMobile" placeholder="Mobile"><br>
    <input id="newEmail" placeholder="Email"><br>
    <button onclick="addStudent()">Save</button> <button onclick="closeModal()">Cancel</button>
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
  const res = await fetch('/api/students', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  const result = await res.json();
  if (result.success) { closeModal(); loadStudents(); }
  else alert(result.message);
};

// ========== TESTS ==========
async function loadTests() {
  testsData = await fetch('/api/tests').then(r => r.json());
  renderTestsTable();
}
function renderTestsTable() {
  const tbody = document.querySelector('#testsTable tbody');
  const search = document.getElementById('testSearch')?.value.toLowerCase() || '';
  const filtered = testsData.filter(t =>
    t.testId.toLowerCase().includes(search) || t.testName.toLowerCase().includes(search)
  );
  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td>${t.testId}</td><td>${t.testName}</td><td>${t.duration} min</td>
      <td>+${t.marks.correct}/${t.marks.wrong}/${t.marks.skip}</td>
      <td>${t.shuffle?'Yes':'No'}</td>
      <td>
        <button onclick="editTest('${t.testId}')">Edit</button>
        <button class="danger" onclick="deleteTest('${t.testId}')">Delete</button>
      </td>
    </tr>
  `).join('');
}
window.filterTests = () => renderTestsTable();
window.openCreateTestModal = () => {
  const html = `
    <h3>Create Test</h3>
    <input id="newTestId" placeholder="Test ID"><br>
    <input id="newTestName" placeholder="Test Name"><br>
    <input id="newDuration" type="number" placeholder="Duration (min)"><br>
    <label>Marks: </label>
    <input id="marksCorrect" type="number" placeholder="Correct" value="1" style="width:70px">
    <input id="marksWrong" type="number" placeholder="Wrong" value="0" style="width:70px">
    <input id="marksSkip" type="number" placeholder="Skip" value="0" style="width:70px"><br>
    <label><input type="checkbox" id="shuffleQuestions"> Shuffle</label><br>
    <label>Allowed Classes (comma separated):</label>
    <input id="allowedClasses" placeholder="e.g. 10,12"><br>
    <label><input type="checkbox" id="isLive"> Live</label><br>
    <label>Start Time:</label>
    <input type="datetime-local" id="startTime"><br>
    <label>End Time:</label>
    <input type="datetime-local" id="endTime"><br>
    <button onclick="createTest()">Save</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
};
window.createTest = async () => {
  const data = {
    testId: document.getElementById('newTestId').value,
    testName: document.getElementById('newTestName').value,
    duration: parseInt(document.getElementById('newDuration').value),
    marks: {
      correct: parseFloat(document.getElementById('marksCorrect').value) || 1,
      wrong: parseFloat(document.getElementById('marksWrong').value) || 0,
      skip: parseFloat(document.getElementById('marksSkip').value) || 0
    },
    shuffle: document.getElementById('shuffleQuestions').checked,
    allowedClasses: document.getElementById('allowedClasses').value.split(',').map(s => s.trim()).filter(s => s),
    isLive: document.getElementById('isLive').checked,
    startTime: document.getElementById('startTime').value,
    endTime: document.getElementById('endTime').value
  };
  const res = await fetch('/api/tests', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  const result = await res.json();
  if (result.success) { closeModal(); loadTests(); }
  else alert(result.message);
};
window.editTest = async (testId) => {
  const test = testsData.find(t => t.testId === testId);
  if (!test) return;
  const html = `
    <h3>Edit Test</h3>
    <input id="editTestId" value="${test.testId}" readonly><br>
    <input id="editTestName" value="${test.testName}"><br>
    <input id="editDuration" type="number" value="${test.duration}"><br>
    <label>Marks: </label>
    <input id="editMarksCorrect" type="number" value="${test.marks.correct}" style="width:70px">
    <input id="editMarksWrong" type="number" value="${test.marks.wrong}" style="width:70px">
    <input id="editMarksSkip" type="number" value="${test.marks.skip}" style="width:70px"><br>
    <label><input type="checkbox" id="editShuffle" ${test.shuffle?'checked':''}> Shuffle</label><br>
    <label>Allowed Classes:</label>
    <input id="editAllowedClasses" value="${(test.allowedClasses||[]).join(',')}"><br>
    <label><input type="checkbox" id="editIsLive" ${test.isLive?'checked':''}> Live</label><br>
    <label>Start Time:</label>
    <input type="datetime-local" id="editStartTime" value="${test.startTime ? test.startTime.slice(0,16) : ''}"><br>
    <label>End Time:</label>
    <input type="datetime-local" id="editEndTime" value="${test.endTime ? test.endTime.slice(0,16) : ''}"><br>
    <button onclick="updateTest('${testId}')">Update</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
};
window.updateTest = async (testId) => {
  const data = {
    testName: document.getElementById('editTestName').value,
    duration: parseInt(document.getElementById('editDuration').value),
    marks: {
      correct: parseFloat(document.getElementById('editMarksCorrect').value),
      wrong: parseFloat(document.getElementById('editMarksWrong').value),
      skip: parseFloat(document.getElementById('editMarksSkip').value)
    },
    shuffle: document.getElementById('editShuffle').checked,
    allowedClasses: document.getElementById('editAllowedClasses').value.split(',').map(s => s.trim()),
    isLive: document.getElementById('editIsLive').checked,
    startTime: document.getElementById('editStartTime').value,
    endTime: document.getElementById('editEndTime').value
  };
  await fetch(`/api/tests/${testId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  closeModal();
  loadTests();
};
window.deleteTest = async (id) => {
  if (confirm('Delete test and all related data?')) {
    await fetch(`/api/tests/${id}`, { method: 'DELETE' });
    loadTests();
  }
};

// ========== QUESTIONS ==========
async function loadTestsForDropdown(selectId = 'testSelectForQuestions') {
  const tests = await fetch('/api/tests').then(r => r.json());
  const select = document.getElementById(selectId);
  if (select) select.innerHTML = '<option value="">-- Select Test --</option>' + tests.map(t => `<option value="${t.testId}">${t.testName}</option>`).join('');
}
async function loadQuestions() {
  const testId = document.getElementById('testSelectForQuestions').value;
  currentTestForQuestions = testId;
  if (!testId) { questionsData = []; renderQuestionsTable(); return; }
  questionsData = await fetch(`/api/questions/${testId}`).then(r => r.json());
  renderQuestionsTable();
}
function renderQuestionsTable() {
  const tbody = document.querySelector('#questionsTable tbody');
  const search = document.getElementById('questionSearch')?.value.toLowerCase() || '';
  const filtered = questionsData.filter(q =>
    q.questionId.toLowerCase().includes(search) || q.questionText.en.toLowerCase().includes(search)
  );
  tbody.innerHTML = filtered.map(q => `
    <tr>
      <td>${q.questionId}</td><td>${q.type}</td><td>${q.questionText.en.substring(0,50)}...</td>
      <td>
        <button onclick="editQuestion('${q._id}')">Edit</button>
        <button class="danger" onclick="deleteQuestion('${q._id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}
window.filterQuestions = () => renderQuestionsTable();
window.openAddQuestionModal = () => {
  if (!currentTestForQuestions) { alert('Select a test first'); return; }
  const html = `
    <h3>Add Question</h3>
    <input id="qId" placeholder="Question ID"><br>
    <select id="qType"><option value="mcq">MCQ</option><option value="numerical">Numerical</option></select><br>
    <textarea id="qTextEn" placeholder="Question (English)"></textarea><br>
    <textarea id="qTextHi" placeholder="Question (Hindi)"></textarea><br>
    <div id="mcqOptions">
      Option1 EN: <input id="opt1en"> HI: <input id="opt1hi"><br>
      Option2 EN: <input id="opt2en"> HI: <input id="opt2hi"><br>
      Option3 EN: <input id="opt3en"> HI: <input id="opt3hi"><br>
      Option4 EN: <input id="opt4en"> HI: <input id="opt4hi"><br>
      Correct Option (1-4): <input type="number" id="correctMcq">
    </div>
    <div id="numOptions" style="display:none;">
      Correct Answer: <input id="correctNum"> Tolerance: <input id="tolerance" value="0.01">
    </div>
    Marks (optional): Correct <input id="mCorrect" type="number"> Wrong <input id="mWrong" type="number"> Skip <input id="mSkip" type="number"><br>
    Image URLs (semicolon): <input id="imgUrls"><br>
    <button onclick="addQuestion()">Save</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
  document.getElementById('qType').addEventListener('change', function() {
    document.getElementById('mcqOptions').style.display = this.value === 'mcq' ? 'block' : 'none';
    document.getElementById('numOptions').style.display = this.value === 'numerical' ? 'block' : 'none';
  });
};
window.addQuestion = async () => {
  const type = document.getElementById('qType').value;
  const question = {
    testId: currentTestForQuestions,
    questionId: document.getElementById('qId').value,
    type,
    questionText: { en: document.getElementById('qTextEn').value, hi: document.getElementById('qTextHi').value },
    marks: {
      correct: parseFloat(document.getElementById('mCorrect').value) || undefined,
      wrong: parseFloat(document.getElementById('mWrong').value) || undefined,
      skip: parseFloat(document.getElementById('mSkip').value) || undefined
    },
    imageUrls: document.getElementById('imgUrls').value.split(';').map(s => s.trim()).filter(s => s)
  };
  if (type === 'mcq') {
    question.options = [
      { en: document.getElementById('opt1en').value, hi: document.getElementById('opt1hi').value },
      { en: document.getElementById('opt2en').value, hi: document.getElementById('opt2hi').value },
      { en: document.getElementById('opt3en').value, hi: document.getElementById('opt3hi').value },
      { en: document.getElementById('opt4en').value, hi: document.getElementById('opt4hi').value }
    ];
    question.correctAnswer = parseInt(document.getElementById('correctMcq').value);
  } else {
    question.correctAnswer = parseFloat(document.getElementById('correctNum').value);
    question.tolerance = parseFloat(document.getElementById('tolerance').value) || 0.01;
  }
  const res = await fetch('/api/questions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(question) });
  const result = await res.json();
  if (result.success) { closeModal(); loadQuestions(); }
  else alert(result.message);
};
window.editQuestion = async (id) => {
  const q = questionsData.find(q => q._id === id);
  // populate modal similar to add but with existing values (omitted for brevity but implement similarly)
};
window.deleteQuestion = async (id) => {
  if (confirm('Delete question?')) {
    await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    loadQuestions();
  }
};
window.uploadCSV = async () => {
  const testId = currentTestForQuestions;
  if (!testId) { alert('Select a test first'); return; }
  if (!selectedCSVFile) return;
  const formData = new FormData();
  formData.append('csvFile', selectedCSVFile);
  const res = await fetch(`/api/questions/upload/${testId}`, { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) { alert(`Uploaded ${data.count} questions`); loadQuestions(); }
  else alert('Upload failed: ' + JSON.stringify(data.errors));
  document.getElementById('csvFileInput').value = '';
  document.getElementById('uploadCsvBtn').style.display = 'none';
  selectedCSVFile = null;
};

// ========== RESULTS ==========
async function loadResults() {
  const testId = document.getElementById('testFilterResults').value;
  let url = '/api/results';
  if (testId) url = `/api/results/test/${testId}`;
  resultsData = await fetch(url).then(r => r.json());
  const students = await fetch('/api/students').then(r => r.json());
  const tests = await fetch('/api/tests').then(r => r.json());
  const studentMap = Object.fromEntries(students.map(s => [s.studentId, s.fullName]));
  const testMap = Object.fromEntries(tests.map(t => [t.testId, t.testName]));
  resultsData = resultsData.map(r => ({ ...r, studentName: studentMap[r.studentId] || r.studentId, testName: testMap[r.testId] || r.testId }));
  renderResultsTable();
}
function renderResultsTable() {
  const tbody = document.querySelector('#resultsTable tbody');
  const search = document.getElementById('resultSearch')?.value.toLowerCase() || '';
  const filtered = resultsData.filter(r => r.studentName.toLowerCase().includes(search) || r.testName.toLowerCase().includes(search));
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.studentName} (${r.studentId})</td><td>${r.testName}</td><td>${r.score}</td><td>${r.rank}</td>
      <td>${new Date(r.submittedAt).toLocaleString()}</td>
      <td><button onclick="viewAnalysis('${r._id}')">View</button></td>
    </tr>
  `).join('');
}
window.filterResults = () => renderResultsTable();
window.viewAnalysis = async (resultId) => {
  const result = resultsData.find(r => r._id === resultId);
  const questions = await fetch(`/api/questions/${result.testId}`).then(r => r.json());
  const qMap = Object.fromEntries(questions.map(q => [q.questionId, q]));
  let html = `<h3>Analysis for ${result.studentName}</h3>`;
  result.answers.forEach(ans => {
    const q = qMap[ans.questionId];
    html += `<div style="border-bottom:1px solid #ccc;padding:10px;">
      <p><strong>Q:</strong> ${q?.questionText.en}</p>
      <p>Your Answer: ${ans.selectedAnswer || 'Skipped'} | Correct: ${q?.correctAnswer}</p>
      <p>Marks: ${ans.marksAwarded} (${ans.isCorrect ? 'Correct' : 'Incorrect'})</p>
    </div>`;
  });
  showModal(html);
};

// ========== DISCUSSIONS ==========
async function loadDiscussions() {
  const testId = document.getElementById('testSelectDiscussions').value;
  if (!testId) { document.getElementById('discussionsList').innerHTML = '<p>Select a test</p>'; return; }
  discussionsData = await fetch(`/api/discussions/${testId}`).then(r => r.json());
  renderDiscussions();
}
function renderDiscussions() {
  const container = document.getElementById('discussionsList');
  container.innerHTML = discussionsData.map(d => `
    <div class="discussion-card">
      <h3>${d.title}</h3>
      <p>${d.description}</p>
      ${d.link ? `<a href="${d.link}" target="_blank">${d.link}</a>` : ''}
      <button class="danger" onclick="deleteDiscussion('${d._id}')">Delete</button>
    </div>
  `).join('');
}
window.openNewPostModal = () => {
  const testId = document.getElementById('testSelectDiscussions').value;
  if (!testId) { alert('Select a test first'); return; }
  const html = `
    <h3>New Discussion</h3>
    <input id="discTitle" placeholder="Title"><br>
    <textarea id="discDesc" placeholder="Description"></textarea><br>
    <input id="discLink" placeholder="Link"><br>
    <button onclick="createDiscussion('${testId}')">Create</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
};
window.createDiscussion = async (testId) => {
  const data = {
    testId,
    title: document.getElementById('discTitle').value,
    description: document.getElementById('discDesc').value,
    link: document.getElementById('discLink').value
  };
  await fetch('/api/discussions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  closeModal();
  loadDiscussions();
};
window.deleteDiscussion = async (id) => {
  if (confirm('Delete?')) {
    await fetch(`/api/discussions/${id}`, { method: 'DELETE' });
    loadDiscussions();
  }
};

// ========== MESSAGES ==========
async function loadMessages() {
  messagesData = await fetch('/api/messages').then(r => r.json());
  renderMessages();
}
function renderMessages() {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = messagesData.map(m => `
    <div class="message-bubble ${m.sender === 'student' ? 'student-message' : 'admin-message'}">
      <strong>${m.sender === 'student' ? m.studentId : 'Admin'}</strong>
      <p>${m.content}</p>
      <small>${new Date(m.timestamp).toLocaleString()}</small>
      ${m.isUnblockRequest ? `<button class="success" onclick="unblockStudent('${m.studentId}')">Unblock</button>` : ''}
      ${m.sender === 'student' && !m.isUnblockRequest ? `<button onclick="openReply('${m.studentId}')">Reply</button>` : ''}
    </div>
  `).join('');
}
window.openReply = (studentId) => {
  currentReplyToStudent = studentId;
  document.getElementById('replyBox').style.display = 'block';
};
window.cancelReply = () => {
  currentReplyToStudent = null;
  document.getElementById('replyBox').style.display = 'none';
  document.getElementById('replyContent').value = '';
};
window.sendReply = async () => {
  const content = document.getElementById('replyContent').value;
  if (!content) return;
  await fetch('/api/messages', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId: currentReplyToStudent, sender: 'admin', content })
  });
  cancelReply();
  loadMessages();
};

// ========== BLOCKED ==========
async function loadBlocked() {
  const students = await fetch('/api/students').then(r => r.json());
  const blocked = students.filter(s => s.status === 'blocked');
  const tbody = document.querySelector('#blockedTable tbody');
  tbody.innerHTML = blocked.map(s => `
    <tr>
      <td>${s.studentId}</td><td>${s.fullName}</td><td>${s.blockReason}</td>
      <td>${s.blockedAt ? new Date(s.blockedAt).toLocaleString() : ''}</td>
      <td><button class="success" onclick="unblockStudent('${s.studentId}')">Unblock</button></td>
    </tr>
  `).join('');
}

// ========== MONITOR (Pause/Resume) ==========
async function loadActiveTests() {
  const tests = await fetch('/api/tests').then(r => r.json());
  const liveTests = tests.filter(t => t.isLive);
  const select = document.getElementById('activeTestSelect');
  select.innerHTML = '<option value="">-- Select Test --</option>' + 
    liveTests.map(t => `<option value="${t.testId}">${t.testName}</option>`).join('');
}
window.loadTestTakers = async () => {
  const testId = document.getElementById('activeTestSelect').value;
  if (!testId) return;
  const results = await fetch(`/api/results/test/${testId}`).then(r => r.json());
  const students = await fetch('/api/students').then(r => r.json());
  const studentMap = Object.fromEntries(students.map(s => [s.studentId, s]));
  const tbody = document.querySelector('#testTakersTable tbody');
  tbody.innerHTML = results.map(r => {
    const paused = r.paused ? 'Paused' : 'Active';
    return `
      <tr>
        <td>${r.studentId}</td><td>${studentMap[r.studentId]?.fullName || ''}</td><td>${paused}</td>
        <td>
          ${!r.paused ? 
            `<button onclick="promptPause('${r.studentId}','${testId}')">Pause</button>` : 
            `<button onclick="promptResume('${r.studentId}','${testId}')">Resume</button>`}
        </td>
      </tr>
    `;
  }).join('');
};
window.promptPause = async (studentId, testId) => {
  const password = prompt('Enter pause password:');
  if (!password) return;
  const res = await fetch('/api/admin/pause-test', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId, testId, password })
  });
  const data = await res.json();
  if (data.success) { alert('Test paused'); loadTestTakers(); }
  else alert(data.message);
};
window.promptResume = async (studentId, testId) => {
  const password = prompt('Enter resume password:');
  if (!password) return;
  const res = await fetch('/api/admin/resume-test', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId, testId, password })
  });
  const data = await res.json();
  if (data.success) { alert('Test resumed'); loadTestTakers(); }
  else alert(data.message);
};

// ========== SETTINGS ==========
window.updatePassword = async () => {
  const newPass = document.getElementById('newPassword').value;
  if (!newPass) return alert('Enter new password');
  await fetch('/api/settings/password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password: newPass}) });
  alert('Password updated');
  document.getElementById('newPassword').value = '';
};

// ========== MODAL UTILS ==========
function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}
window.closeModal = () => {
  document.getElementById('modalOverlay').style.display = 'none';
};
