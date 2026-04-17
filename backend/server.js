require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const app = express();

// ---------- Use memory storage for multer (no disk writes) ----------
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(cors());
app.use(express.json());

// ---------- MongoDB Connection ----------
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ---------- Mongoose Models ----------
const Student = mongoose.model('Student', new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  dob: { type: String, required: true },
  class: String,
  mobile: String,
  email: String,
  registeredAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  blockReason: String,
  blockedAt: Date
}));

const Test = mongoose.model('Test', new mongoose.Schema({
  testId: { type: String, required: true, unique: true },
  testName: { type: String, required: true },
  duration: { type: Number, required: true },
  marks: {
    correct: { type: Number, default: 1 },
    wrong: { type: Number, default: 0 },
    skip: { type: Number, default: 0 }
  },
  shuffle: { type: Boolean, default: false }
}));

const Question = mongoose.model('Question', new mongoose.Schema({
  testId: { type: String, required: true },
  questionId: { type: String, required: true },
  type: { type: String, enum: ['mcq', 'numerical'], required: true },
  questionText: {
    en: { type: String, required: true },
    hi: String
  },
  options: [{
    en: String,
    hi: String
  }],
  correctAnswer: mongoose.Schema.Types.Mixed,
  tolerance: Number,
  marks: {
    correct: Number,
    wrong: Number,
    skip: Number
  },
  imageUrls: [String]
}));
Question.index({ testId: 1, questionId: 1 }, { unique: true });

const Result = mongoose.model('Result', new mongoose.Schema({
  studentId: { type: String, required: true },
  testId: { type: String, required: true },
  score: { type: Number, required: true },
  rank: Number,
  submittedAt: { type: Date, default: Date.now },
  answers: [{
    questionId: String,
    selectedAnswer: mongoose.Schema.Types.Mixed,
    isCorrect: Boolean,
    marksAwarded: Number
  }]
}));
Result.index({ testId: 1, studentId: 1 }, { unique: true });

const Discussion = mongoose.model('Discussion', new mongoose.Schema({
  testId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  link: String,
  createdAt: { type: Date, default: Date.now }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  studentId: String,
  sender: { type: String, enum: ['student', 'admin'], required: true },
  content: { type: String, required: true },
  isUnblockRequest: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}));

const Config = mongoose.model('Config', new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
}));

// ---------- Initialize Default Admin Credentials ----------
(async () => {
  const adminUser = await Config.findOne({ key: 'adminUsername' });
  const adminPass = await Config.findOne({ key: 'adminPassword' });
  if (!adminUser) await Config.create({ key: 'adminUsername', value: 'Jahid@Admin' });
  if (!adminPass) await Config.create({ key: 'adminPassword', value: 'Jahid@Admin' });
})();

// ========== AUTH ROUTES ==========
app.post('/api/auth/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const userConfig = await Config.findOne({ key: 'adminUsername' });
  const passConfig = await Config.findOne({ key: 'adminPassword' });
  if (username === userConfig.value && password === passConfig.value) {
    res.json({ success: true, token: 'admin-token' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
});

app.post('/api/auth/student/login', async (req, res) => {
  const { studentId, dob } = req.body;
  const student = await Student.findOne({ studentId });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  if (student.dob !== dob) return res.status(401).json({ success: false, message: 'Invalid DOB' });
  if (student.status === 'blocked') {
    return res.status(403).json({ success: false, blocked: true, reason: student.blockReason });
  }
  res.json({ success: true, student });
});

// ========== STUDENTS ==========
app.get('/api/students', async (req, res) => {
  const students = await Student.find().sort('studentId');
  res.json(students);
});

app.post('/api/students', async (req, res) => {
  try {
    const student = await Student.create(req.body);
    res.json({ success: true, student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/students/:id/block', async (req, res) => {
  await Student.findOneAndUpdate({ studentId: req.params.id },
    { status: 'blocked', blockReason: req.body.reason, blockedAt: new Date() });
  res.json({ success: true });
});

app.put('/api/students/:id/unblock', async (req, res) => {
  await Student.findOneAndUpdate({ studentId: req.params.id },
    { status: 'active', blockReason: null, blockedAt: null });
  res.json({ success: true });
});

// ========== TESTS ==========
app.get('/api/tests', async (req, res) => {
  const tests = await Test.find().sort('testId');
  res.json(tests);
});

app.post('/api/tests', async (req, res) => {
  try {
    const test = await Test.create(req.body);
    res.json({ success: true, test });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/tests/:id', async (req, res) => {
  await Test.deleteOne({ testId: req.params.id });
  await Question.deleteMany({ testId: req.params.id });
  await Result.deleteMany({ testId: req.params.id });
  await Discussion.deleteMany({ testId: req.params.id });
  res.json({ success: true });
});

// ========== QUESTIONS ==========
app.get('/api/questions/:testId', async (req, res) => {
  const questions = await Question.find({ testId: req.params.testId }).sort('questionId');
  res.json(questions);
});

app.post('/api/questions', async (req, res) => {
  try {
    const question = await Question.create(req.body);
    res.json({ success: true, question });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/questions/:id', async (req, res) => {
  await Question.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true });
});

app.delete('/api/questions/:id', async (req, res) => {
  await Question.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ========== CSV UPLOAD (Memory Storage) ==========
app.post('/api/questions/upload/:testId', upload.single('csvFile'), async (req, res) => {
  const testId = req.params.testId;
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const results = [];
  const errors = [];

  // Convert buffer to readable stream
  const bufferStream = new Readable();
  bufferStream.push(req.file.buffer);
  bufferStream.push(null);

  bufferStream
    .pipe(csv())
    .on('data', (row) => {
      try {
        const question = {
          testId,
          questionId: row.questionId?.trim(),
          type: row.type?.trim().toLowerCase(),
          questionText: {
            en: row.questionText_en?.trim(),
            hi: row.questionText_hi?.trim() || ''
          },
          options: [],
          correctAnswer: null,
          tolerance: row.tolerance ? parseFloat(row.tolerance) : undefined,
          marks: {
            correct: row.marks_correct ? parseFloat(row.marks_correct) : undefined,
            wrong: row.marks_wrong ? parseFloat(row.marks_wrong) : undefined,
            skip: row.marks_skip ? parseFloat(row.marks_skip) : undefined
          },
          imageUrls: row.imageUrls ? row.imageUrls.split(';').map(s => s.trim()) : []
        };

        if (question.type === 'mcq') {
          for (let i = 1; i <= 4; i++) {
            question.options.push({
              en: row[`option${i}_en`]?.trim() || '',
              hi: row[`option${i}_hi`]?.trim() || ''
            });
          }
          question.correctAnswer = parseInt(row.correctAnswer);
        } else if (question.type === 'numerical') {
          question.correctAnswer = parseFloat(row.correctAnswer);
        }

        if (!question.questionId || !question.type || !question.questionText.en) {
          throw new Error('Missing required fields');
        }

        results.push(question);
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    })
    .on('end', async () => {
      if (errors.length) {
        return res.status(400).json({ success: false, errors });
      }

      try {
        const bulkOps = results.map(q => ({
          updateOne: {
            filter: { testId: q.testId, questionId: q.questionId },
            update: { $set: q },
            upsert: true
          }
        }));
        await Question.bulkWrite(bulkOps);
        res.json({ success: true, count: results.length });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    })
    .on('error', (err) => {
      res.status(500).json({ success: false, message: err.message });
    });
});

// ========== RESULTS ==========
app.get('/api/results', async (req, res) => {
  const results = await Result.find();
  res.json(results);
});

app.get('/api/results/student/:studentId', async (req, res) => {
  const results = await Result.find({ studentId: req.params.studentId });
  res.json(results);
});

app.get('/api/results/test/:testId', async (req, res) => {
  const results = await Result.find({ testId: req.params.testId }).sort('-score');
  res.json(results);
});

app.post('/api/results/submit', async (req, res) => {
  const { studentId, testId, answers } = req.body;
  const questions = await Question.find({ testId });
  const test = await Test.findOne({ testId });
  let score = 0;
  const answerDetails = [];

  for (let q of questions) {
    const ans = answers.find(a => a.questionId === q.questionId);
    let selected = ans ? ans.selectedAnswer : null;
    let isCorrect = false;
    let marksAwarded = 0;
    const marks = q.marks?.correct !== undefined ? q.marks : test.marks;

    if (selected !== null && selected !== '') {
      if (q.type === 'mcq') {
        isCorrect = (selected == q.correctAnswer);
      } else {
        isCorrect = Math.abs(parseFloat(selected) - parseFloat(q.correctAnswer)) <= (q.tolerance || 0.01);
      }
      marksAwarded = isCorrect ? marks.correct : marks.wrong;
    } else {
      marksAwarded = marks.skip;
    }
    score += marksAwarded;
    answerDetails.push({
      questionId: q.questionId,
      selectedAnswer: selected,
      isCorrect,
      marksAwarded
    });
  }

  const result = await Result.create({ studentId, testId, score, answers: answerDetails });

  // Update ranks for this test
  const allResults = await Result.find({ testId }).sort('-score');
  for (let i = 0; i < allResults.length; i++) {
    allResults[i].rank = i + 1;
    await allResults[i].save();
  }

  res.json({ success: true, score, rank: result.rank });
});

// ========== DISCUSSIONS ==========
app.get('/api/discussions/:testId', async (req, res) => {
  const discussions = await Discussion.find({ testId: req.params.testId }).sort('-createdAt');
  res.json(discussions);
});

app.post('/api/discussions', async (req, res) => {
  const discussion = await Discussion.create(req.body);
  res.json({ success: true, discussion });
});

app.delete('/api/discussions/:id', async (req, res) => {
  await Discussion.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ========== MESSAGES ==========
app.get('/api/messages', async (req, res) => {
  const { studentId } = req.query;
  const filter = studentId ? { studentId } : {};
  const messages = await Message.find(filter).sort('timestamp');
  res.json(messages);
});

app.post('/api/messages', async (req, res) => {
  const message = await Message.create(req.body);
  res.json({ success: true, message });
});

// ========== SETTINGS ==========
app.post('/api/settings/password', async (req, res) => {
  await Config.findOneAndUpdate({ key: 'adminPassword' }, { value: req.body.password });
  res.json({ success: true });
});

// ========== SERVE FRONTEND (only for local dev) ==========
if (process.env.NODE_ENV !== 'production') {
  app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));
  app.use('/student', express.static(path.join(__dirname, '../frontend/student')));
  app.get('/', (req, res) => res.redirect('/student'));
}

// For Vercel serverless environment
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
