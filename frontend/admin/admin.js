// Check auth
if (!localStorage.getItem('adminToken')) location.href = 'index.html';

// Global data stores
let studentsData = [], testsData = [], questionsData = [], resultsData = [], discussionsData = [], messagesData = [];
let currentTestForQuestions = '', currentReplyToStudent = null;
let selectedCSVFile = null;

// Tab switching
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
  if (tab === 'dashboard') loadDashboard();
  else if (tab === 'students') loadStudents();
  else if (tab === 'tests') loadTests();
  else if (tab === 'questions') { await loadTestsForDropdown(); loadQuestions(); }
  else if (tab === 'results') { await loadTestsForDropdown('testFilterResults'); loadResults(); }
  else if (tab === 'discussions') { await loadTestsForDropdown('testSelectDiscussions'); loadDiscussions(); }
  else if (tab === 'messages') loadMessages();
  else if (tab === 'blocked') loadBlocked();
}

// ========== DASHBOARD ==========
async function loadDashboard() {
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
    </tr>`).join('');
}
function filterStudents() { renderStudentsTable(); }
async function blockStudent(id) {
  const reason = prompt('Enter block reason:');
  if (reason) {
    await fetch(`/api/students/${id}/block`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({reason}) });
    loadStudents();
  }
}
async function unblockStudent(id) {
  await fetch(`/api/students/${id}/unblock`, { method: 'PUT' });
  loadStudents();
}
function openAddStudentModal() {
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
}
async function addStudent() {
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
}

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
      <td>+${t.marks.correct} / ${t.marks.wrong} / ${t.marks.skip}</td>
      <td>${t.shuffle ? 'Yes' : 'No'}</td>
      <td><button class="danger" onclick="deleteTest('${t.testId}')">Delete</button></td>
    </tr>`).join('');
}
function filterTests() { renderTestsTable(); }
function openCreateTestModal() {
  const html = `
    <h3>Create Test</h3>
    <input id="newTestId" placeholder="Test ID (required)"><br>
    <input id="newTestName" placeholder="Test Name"><br>
    <input id="newDuration" type="number" placeholder="Duration (minutes)"><br>
    <label>Marks: </label>
    <input id="marksCorrect" type="number" placeholder="Correct" value="1" style="width:70px">
    <input id="marksWrong" type="number" placeholder="Wrong" value="0" style="width:70px">
    <input id="marksSkip" type="number" placeholder="Skip" value="0" style="width:70px"><br>
    <label><input type="checkbox" id="shuffleQuestions"> Shuffle Questions</label><br>
    <button onclick="createTest()">Save</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
}
async function createTest() {
  const data = {
    testId: document.getElementById('newTestId').value,
    testName: document.getElementById('newTestName').value,
    duration: parseInt(document.getElementById('newDuration').value),
    marks: {
      correct: parseFloat(document.getElementById('marksCorrect').value) || 1,
      wrong: parseFloat(document.getElementById('marksWrong').value) || 0,
      skip: parseFloat(document.getElementById('marksSkip').value) || 0
    },
    shuffle: document.getElementById('shuffleQuestions').checked
  };
  const res = await fetch('/api/tests', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  const result = await res.json();
  if (result.success) { closeModal(); loadTests(); }
  else alert(result.message);
}
async function deleteTest(id) {
  if (confirm('Delete this test and all its questions, results, and discussions?')) {
    await fetch(`/api/tests/${id}`, { method: 'DELETE' });
    loadTests();
  }
}

// ========== QUESTIONS ==========
async function loadTestsForDropdown(selectId = 'testSelectForQuestions') {
  const tests = await fetch('/api/tests').then(r => r.json());
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">-- Select Test --</option>' + tests.map(t => `<option value="${t.testId}">${t.testName}</option>`).join('');
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
    </tr>`).join('');
}
function filterQuestions() { renderQuestionsTable(); }
function openAddQuestionModal() {
  if (!currentTestForQuestions) { alert('Select a test first'); return; }
  const html = `
    <h3>Add Question</h3>
    <input id="qId" placeholder="Question ID"><br>
    <select id="qType"><option value="mcq">MCQ</option><option value="numerical">Numerical</option></select><br>
    <textarea id="qTextEn" placeholder="Question (English)"></textarea><br>
    <textarea id="qTextHi" placeholder="Question (Hindi, optional)"></textarea><br>
    <div id="mcqOptions">
      Option1 EN: <input id="opt1en"> HI: <input id="opt1hi"><br>
      Option2 EN: <input id="opt2en"> HI: <input id="opt2hi"><br>
      Option3 EN: <input id="opt3en"> HI: <input id="opt3hi"><br>
      Option4 EN: <input id="opt4en"> HI: <input id="opt4hi"><br>
      Correct Option (1-4): <input type="number" id="correctMcq" min="1" max="4">
    </div>
    <div id="numOptions" style="display:none;">
      Correct Answer: <input id="correctNum"> Tolerance: <input id="tolerance" value="0.01">
    </div>
    Marks (optional): Correct <input id="mCorrect" type="number" style="width:60px"> 
    Wrong <input id="mWrong" type="number" style="width:60px"> Skip <input id="mSkip" type="number" style="width:60px"><br>
    Image URLs (semicolon separated): <input id="imgUrls"><br>
    <button onclick="addQuestion()">Save</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
  document.getElementById('qType').addEventListener('change', toggleQuestionType);
}
function toggleQuestionType() {
  const type = document.getElementById('qType').value;
  document.getElementById('mcqOptions').style.display = type === 'mcq' ? 'block' : 'none';
  document.getElementById('numOptions').style.display = type === 'numerical' ? 'block' : 'none';
}
async function addQuestion() {
  const type = document.getElementById('qType').value;
  const question = {
    testId: currentTestForQuestions,
    questionId: document.getElementById('qId').value,
    type,
    questionText: {
      en: document.getElementById('qTextEn').value,
      hi: document.getElementById('qTextHi').value
    },
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
}
async function editQuestion(id) {
  const q = questionsData.find(q => q._id === id);
  if (!q) return;
  const html = `
    <h3>Edit Question</h3>
    <input id="editQId" value="${q.questionId}" readonly><br>
    <textarea id="editQTextEn">${q.questionText.en}</textarea><br>
    <textarea id="editQTextHi">${q.questionText.hi || ''}</textarea><br>
    <div id="editMcqOptions" style="display:${q.type==='mcq'?'block':'none'}">
      Option1 EN: <input id="editOpt1en" value="${q.options[0]?.en || ''}"> HI: <input id="editOpt1hi" value="${q.options[0]?.hi || ''}"><br>
      Option2 EN: <input id="editOpt2en" value="${q.options[1]?.en || ''}"> HI: <input id="editOpt2hi" value="${q.options[1]?.hi || ''}"><br>
      Option3 EN: <input id="editOpt3en" value="${q.options[2]?.en || ''}"> HI: <input id="editOpt3hi" value="${q.options[2]?.hi || ''}"><br>
      Option4 EN: <input id="editOpt4en" value="${q.options[3]?.en || ''}"> HI: <input id="editOpt4hi" value="${q.options[3]?.hi || ''}"><br>
      Correct Option: <input type="number" id="editCorrectMcq" value="${q.correctAnswer}">
    </div>
    <div id="editNumOptions" style="display:${q.type==='numerical'?'block':'none'}">
      Correct Answer: <input id="editCorrectNum" value="${q.correctAnswer}"> Tolerance: <input id="editTolerance" value="${q.tolerance || 0.01}">
    </div>
    Marks: Correct <input id="editMCorrect" value="${q.marks?.correct || ''}" style="width:60px"> 
    Wrong <input id="editMWrong" value="${q.marks?.wrong || ''}" style="width:60px"> 
    Skip <input id="editMSkip" value="${q.marks?.skip || ''}" style="width:60px"><br>
    Image URLs: <input id="editImgUrls" value="${(q.imageUrls || []).join(';')}"><br>
    <button onclick="updateQuestion('${id}')">Update</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
}
async function updateQuestion(id) {
  const q = questionsData.find(q => q._id === id);
  const updated = {
    questionText: {
      en: document.getElementById('editQTextEn').value,
      hi: document.getElementById('editQTextHi').value
    },
    marks: {
      correct: parseFloat(document.getElementById('editMCorrect').value) || undefined,
      wrong: parseFloat(document.getElementById('editMWrong').value) || undefined,
      skip: parseFloat(document.getElementById('editMSkip').value) || undefined
    },
    imageUrls: document.getElementById('editImgUrls').value.split(';').map(s => s.trim()).filter(s => s)
  };
  if (q.type === 'mcq') {
    updated.options = [
      { en: document.getElementById('editOpt1en').value, hi: document.getElementById('editOpt1hi').value },
      { en: document.getElementById('editOpt2en').value, hi: document.getElementById('editOpt2hi').value },
      { en: document.getElementById('editOpt3en').value, hi: document.getElementById('editOpt3hi').value },
      { en: document.getElementById('editOpt4en').value, hi: document.getElementById('editOpt4hi').value }
    ];
    updated.correctAnswer = parseInt(document.getElementById('editCorrectMcq').value);
  } else {
    updated.correctAnswer = parseFloat(document.getElementById('editCorrectNum').value);
    updated.tolerance = parseFloat(document.getElementById('editTolerance').value) || 0.01;
  }
  await fetch(`/api/questions/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updated) });
  closeModal();
  loadQuestions();
}
async function deleteQuestion(id) {
  if (confirm('Delete this question?')) {
    await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    loadQuestions();
  }
}

// CSV Upload
document.getElementById('csvFileInput').addEventListener('change', (e) => {
  selectedCSVFile = e.target.files[0];
  document.getElementById('uploadCsvBtn').style.display = selectedCSVFile ? 'inline-block' : 'none';
});
async function uploadCSV() {
  const testId = document.getElementById('testSelectForQuestions').value;
  if (!testId) { alert('Select a test first'); return; }
  if (!selectedCSVFile) return;
  const formData = new FormData();
  formData.append('csvFile', selectedCSVFile);
  const res = await fetch(`/api/questions/upload/${testId}`, { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) { alert(`Uploaded ${data.count} questions`); loadQuestions(); }
  else { alert('Upload failed: ' + JSON.stringify(data.errors)); }
  document.getElementById('csvFileInput').value = '';
  document.getElementById('uploadCsvBtn').style.display = 'none';
  selectedCSVFile = null;
}

// ========== RESULTS ==========
async function loadResults() {
  const testId = document.getElementById('testFilterResults').value;
  let url = '/api/results';
  if (testId) url = `/api/results/test/${testId}`;
  resultsData = await fetch(url).then(r => r.json());
  // Enhance with student names and test names
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
  const filtered = resultsData.filter(r => 
    r.studentName.toLowerCase().includes(search) || r.testName.toLowerCase().includes(search)
  );
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.studentName} (${r.studentId})</td><td>${r.testName}</td><td>${r.score}</td><td>${r.rank}</td>
      <td>${new Date(r.submittedAt).toLocaleString()}</td>
      <td><button onclick="viewAnalysis('${r._id}')">View</button></td>
    </tr>`).join('');
}
function filterResults() { renderResultsTable(); }
async function viewAnalysis(resultId) {
  const result = resultsData.find(r => r._id === resultId);
  const questions = await fetch(`/api/questions/${result.testId}`).then(r => r.json());
  const qMap = Object.fromEntries(questions.map(q => [q.questionId, q]));
  let html = `<h3>Analysis for ${result.studentName}</h3>`;
  result.answers.forEach(ans => {
    const q = qMap[ans.questionId];
    html += `<div style="border-bottom:1px solid #ccc; padding:10px;">
      <p><strong>Q:</strong> ${q.questionText.en}</p>
      <p>Your Answer: ${ans.selectedAnswer || 'Skipped'} | Correct: ${q.correctAnswer}</p>
      <p>Marks: ${ans.marksAwarded} (${ans.isCorrect ? 'Correct' : 'Incorrect'})</p>
    </div>`;
  });
  showModal(html);
}

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
function openNewPostModal() {
  const testId = document.getElementById('testSelectDiscussions').value;
  if (!testId) { alert('Select a test first'); return; }
  const html = `
    <h3>New Discussion Post</h3>
    <input id="discTitle" placeholder="Title"><br>
    <textarea id="discDesc" placeholder="Description"></textarea><br>
    <input id="discLink" placeholder="Link (optional)"><br>
    <button onclick="createDiscussion('${testId}')">Create</button> <button onclick="closeModal()">Cancel</button>
  `;
  showModal(html);
}
async function createDiscussion(testId) {
  const data = {
    testId,
    title: document.getElementById('discTitle').value,
    description: document.getElementById('discDesc').value,
    link: document.getElementById('discLink').value
  };
  await fetch('/api/discussions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  closeModal();
  loadDiscussions();
}
async function deleteDiscussion(id) {
  if (confirm('Delete this post?')) {
    await fetch(`/api/discussions/${id}`, { method: 'DELETE' });
    loadDiscussions();
  }
}

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
  container.scrollTop = container.scrollHeight;
}
function openReply(studentId) {
  currentReplyToStudent = studentId;
  document.getElementById('replyBox').style.display = 'block';
}
function cancelReply() {
  currentReplyToStudent = null;
  document.getElementById('replyBox').style.display = 'none';
}
async function sendReply() {
  const content = document.getElementById('replyContent').value;
  if (!content) return;
  await fetch('/api/messages', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId: currentReplyToStudent, sender: 'admin', content })
  });
  document.getElementById('replyContent').value = '';
  cancelReply();
  loadMessages();
}

// ========== BLOCKED STUDENTS ==========
async function loadBlocked() {
  const students = await fetch('/api/students').then(r => r.json());
  const blocked = students.filter(s => s.status === 'blocked');
  const tbody = document.querySelector('#blockedTable tbody');
  tbody.innerHTML = blocked.map(s => `
    <tr>
      <td>${s.studentId}</td><td>${s.fullName}</td><td>${s.blockReason}</td>
      <td>${s.blockedAt ? new Date(s.blockedAt).toLocaleString() : ''}</td>
      <td><button class="success" onclick="unblockStudent('${s.studentId}')">Unblock</button></td>
    </tr>`).join('');
}

// ========== SETTINGS ==========
async function updatePassword() {
  const newPass = document.getElementById('newPassword').value;
  if (!newPass) return alert('Enter a new password');
  await fetch('/api/settings/password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password: newPass}) });
  alert('Password updated');
  document.getElementById('newPassword').value = '';
}

// ========== UTILS ==========
function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}
document.getElementById('logoutBtn').onclick = () => {
  localStorage.removeItem('adminToken');
  location.href = 'index.html';
};

// Initialize
loadDashboard();
