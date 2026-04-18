require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ---------- MongoDB Connection ----------
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ---------- Mongoose Models (with recompilation check) ----------
const studentSchema = new mongoose.Schema({
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
});
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

const testSchema = new mongoose.Schema({
  testId: { type: String, required: true, unique: true },
  testName: { type: String, required: true },
  duration: { type: Number, required: true },
  marks: {
    correct: { type: Number, default: 1 },
    wrong: { type: Number, default: 0 },
    skip: { type: Number, default: 0 }
  },
  shuffle: { type: Boolean, default: false },
  allowedClasses: [String],
  isLive: { type: Boolean, default: false },
  startTime: Date,
  endTime: Date
});
const Test = mongoose.models.Test || mongoose.model('Test', testSchema);

const questionSchema = new mongoose.Schema({
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
});
questionSchema.index({ testId: 1, questionId: 1 }, { unique: true });
const Question = mongoose.models.Question || mongoose.model('Question', questionSchema);

const resultSchema = new mongoose.Schema({
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
  }],
  paused: { type: Boolean, default: false },
  pausedAt: Date,
  totalPausedDuration: { type: Number, default: 0 }
});
resultSchema.index({ testId: 1, studentId: 1 }, { unique: true });
const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);

const discussionSchema = new mongoose.Schema({
  testId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  link: String,
  createdAt: { type: Date, default: Date.now }
});
const Discussion = mongoose.models.Discussion || mongoose.model('Discussion', discussionSchema);

const messageSchema = new mongoose.Schema({
  studentId: String,
  sender: { type: String, enum: ['student', 'admin'], required: true },
  content: { type: String, required: true },
  isUnblockRequest: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

const configSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});
const Config = mongoose.models.Config || mongoose.model('Config', configSchema);

// ========== AUTH ROUTES ==========
app.post('/api/auth/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, token: 'admin-token' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/api/auth/student/login', async (req, res) => {
  const { studentId, dob } = req.body;
  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    if (student.dob !== dob) return res.status(401).json({ success: false, message: 'Invalid DOB' });
    if (student.status === 'blocked') {
      return res.status(403).json({ success: false, blocked: true, reason: student.blockReason });
    }
    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== STUDENTS ==========
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find().sort('studentId');
    res.json(students);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
  try {
    await Student.findOneAndUpdate({ studentId: req.params.id },
      { status: 'blocked', blockReason: req.body.reason, blockedAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/students/:id/unblock', async (req, res) => {
  try {
    await Student.findOneAndUpdate({ studentId: req.params.id },
      { status: 'active', blockReason: null, blockedAt: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== TESTS ==========
app.get('/api/tests', async (req, res) => {
  try {
    const tests = await Test.find().sort('testId');
    res.json(tests);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tests', async (req, res) => {
  try {
    const test = await Test.create(req.body);
    res.json({ success: true, test });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/tests/:id', async (req, res) => {
  try {
    await Test.findOneAndUpdate({ testId: req.params.id }, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/tests/:id', async (req, res) => {
  try {
    await Test.deleteOne({ testId: req.params.id });
    await Question.deleteMany({ testId: req.params.id });
    await Result.deleteMany({ testId: req.params.id });
    await Discussion.deleteMany({ testId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== QUESTIONS ==========
app.get('/api/questions/:testId', async (req, res) => {
  try {
    const questions = await Question.find({ testId: req.params.testId }).sort('questionId');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
  try {
    await Question.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== CSV UPLOAD ==========
app.post('/api/questions/upload/:testId', upload.single('csvFile'), async (req, res) => {
  const testId = req.params.testId;
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const results = [];
  const errors = [];

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

// ========== STUDENT TEST FLOW ==========
app.get('/api/student/available-tests/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const now = new Date();
    const tests = await Test.find({
      allowedClasses: student.class,
      isLive: true,
      startTime: { $lte: now },
      endTime: { $gte: now }
    });

    const taken = await Result.find({ studentId: student.studentId }).distinct('testId');
    const available = tests.filter(t => !taken.includes(t.testId));
    res.json(available);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/student/start-test', async (req, res) => {
  const { studentId, testId } = req.body;
  try {
    let result = await Result.findOne({ studentId, testId });
    if (!result) {
      result = await Result.create({ studentId, testId, score: 0, answers: [] });
    }
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/student/submit-test', async (req, res) => {
  const { studentId, testId, answers } = req.body;
  try {
    const questions = await Question.find({ testId });
    const test = await Test.findOne({ testId });
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });

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

    const result = await Result.findOneAndUpdate(
      { studentId, testId },
      { score, answers: answerDetails, submittedAt: new Date(), paused: false },
      { new: true, upsert: true }
    );

    // Update ranks
    const allResults = await Result.find({ testId }).sort('-score');
    for (let i = 0; i < allResults.length; i++) {
      allResults[i].rank = i + 1;
      await allResults[i].save();
    }

    res.json({ success: true, score, rank: result.rank });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== PAUSE / RESUME ==========
app.post('/api/admin/pause-test', async (req, res) => {
  const { studentId, testId, password } = req.body;
  if (password !== process.env.PAUSE_PASSWORD) {
    return res.status(403).json({ success: false, message: 'Invalid pause password' });
  }
  try {
    await Result.findOneAndUpdate({ studentId, testId }, { paused: true, pausedAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/resume-test', async (req, res) => {
  const { studentId, testId, password } = req.body;
  if (password !== process.env.RESUME_PASSWORD) {
    return res.status(403).json({ success: false, message: 'Invalid resume password' });
  }
  try {
    const result = await Result.findOne({ studentId, testId });
    if (result && result.paused && result.pausedAt) {
      const pausedDuration = Math.floor((new Date() - result.pausedAt) / 1000);
      result.totalPausedDuration = (result.totalPausedDuration || 0) + pausedDuration;
    }
    result.paused = false;
    result.pausedAt = null;
    await result.save();
    res.json({ success: true, totalPausedDuration: result.totalPausedDuration });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/paused-status/:studentId/:testId', async (req, res) => {
  try {
    const result = await Result.findOne({ studentId: req.params.studentId, testId: req.params.testId });
    res.json({ paused: result?.paused || false, totalPausedDuration: result?.totalPausedDuration || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== RESULTS ==========
app.get('/api/results', async (req, res) => {
  try {
    const results = await Result.find();
    res.json(results);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/results/student/:studentId', async (req, res) => {
  try {
    const results = await Result.find({ studentId: req.params.studentId });
    res.json(results);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/results/test/:testId', async (req, res) => {
  try {
    const results = await Result.find({ testId: req.params.testId }).sort('-score');
    res.json(results);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== DISCUSSIONS ==========
app.get('/api/discussions/:testId', async (req, res) => {
  try {
    const discussions = await Discussion.find({ testId: req.params.testId }).sort('-createdAt');
    res.json(discussions);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/discussions', async (req, res) => {
  try {
    const discussion = await Discussion.create(req.body);
    res.json({ success: true, discussion });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/discussions/:id', async (req, res) => {
  try {
    await Discussion.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== MESSAGES ==========
app.get('/api/messages', async (req, res) => {
  try {
    const { studentId } = req.query;
    const filter = studentId ? { studentId } : {};
    const messages = await Message.find(filter).sort('timestamp');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const message = await Message.create(req.body);
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== SETTINGS ==========
app.post('/api/settings/password', async (req, res) => {
  try {
    await Config.findOneAndUpdate({ key: 'adminPassword' }, { value: req.body.password }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== SERVE FRONTEND (local dev only) ==========
if (process.env.NODE_ENV !== 'production') {
  app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));
  app.use('/student', express.static(path.join(__dirname, '../frontend/student')));
  app.get('/', (req, res) => res.redirect('/student'));
}

// For Vercel serverless
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
