const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const bcrypt = require("bcrypt");
const pdf = require("pdf-parse");
const open = require("open");
require("dotenv").config();

// Modular Services
const { transcribeFile } = require("./app/services/stt/whisper");
const { analyzeTranscriptWithLLM } = require("./app/services/nlp/analyzer");
const { calculateReadinessScore } = require("./app/services/scoring/readiness");
const { analyzeSTAR, analyzeNonVerbal } = require("./app/services/nlp/heuristics");

const app = express();
const port = process.env.PORT || 3000;

// Auth Middleware to protect routes
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect('/login.html');
  }
  next();
};

// Database Setup
const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    role_type TEXT,
    interview_type TEXT,
    avg_score INTEGER,
    overall_summary TEXT,
    questions_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "interview-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Route for root - check auth
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Auth Routes
app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function(err) {
      if (err) return res.status(400).json({ error: "Username already exists" });
      req.session.userId = this.lastID;
      req.session.username = username;
      res.json({ success: true, username });
    });
  } catch (error) {
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT id, username, password FROM users WHERE username = ?`, [username], async (err, row) => {
    if (err || !row) return res.status(401).json({ error: "Invalid credentials" });
    
    const isMatch = await bcrypt.compare(password, row.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    req.session.userId = row.id;
    req.session.username = row.username;
    res.json({ success: true, username: row.username });
  });
});

app.get("/api/me", (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// History Route
app.get("/api/history", requireAuth, (req, res) => {
  db.all(`SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC`, [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch history" });
    res.json(rows.map(row => ({
      ...row,
      questions: JSON.parse(row.questions_data)
    })));
  });
});

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `${safeBase}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 500
  },
  fileFilter: function (req, file, cb) {
    if (file.fieldname === "resume") {
      if (file.mimetype === "application/pdf") {
        cb(null, true);
      } else {
        cb(new Error("Only PDF files are allowed for resumes"));
      }
    } else if (!file.mimetype.startsWith("video/") && !file.mimetype.startsWith("audio/")) {
      cb(new Error("Only video or audio files are allowed"));
    } else {
      cb(null, true);
    }
  }
});

async function analyzeTranscript(transcript, jobDescription, durationSeconds, roleType, interviewType, questionText, nonVerbalData, resumeText) {
  const text = transcript.toLowerCase();
  const tokens = text.split(/\s+/).filter(Boolean);
  const wordCount = tokens.length;

  const fillerWords = ["um", "uh", "like", "you know", "actually", "basically", "so", "well"];
  const fillerCounts = {};
  let fillerTotal = 0;

  fillerWords.forEach((filler) => {
    const pattern = new RegExp(`\\b${filler.replace(/\s+/, "\\s+")}\\b`, "g");
    const matches = text.match(pattern);
    const count = matches ? matches.length : 0;
    fillerCounts[filler] = count;
    fillerTotal += count;
  });

  let speechRatePerMinute = null;
  if (durationSeconds && durationSeconds > 0) {
    speechRatePerMinute = Math.round((wordCount / durationSeconds) * 60);
  }

  const jdText = (jobDescription || "").toLowerCase();
  const jdTokens = jdText.split(/\s+/).filter((w) => w.length >= 4);
  const jdUnique = Array.from(new Set(jdTokens));
  const transcriptSet = new Set(tokens);
  const matchedKeywords = jdUnique.filter((k) => transcriptSet.has(k));
  const keywordCoverage = jdUnique.length > 0 ? Math.round((matchedKeywords.length / jdUnique.length) * 100) : null;

  const metrics = { wordCount, fillerCounts, fillerTotal, speechRatePerMinute, keywordCoverage, matchedKeywords };

  const llmAnalysis = await analyzeTranscriptWithLLM(transcript, jobDescription, roleType, interviewType, questionText, resumeText);
  const suggestions = [];

  if (llmAnalysis) {
    if (llmAnalysis.communicationFeedback.clarity) suggestions.push(llmAnalysis.communicationFeedback.clarity);
    if (llmAnalysis.technicalAnalysis.accuracyFeedback) suggestions.push(llmAnalysis.technicalAnalysis.accuracyFeedback);
    if (llmAnalysis.technicalAnalysis.relevanceFeedback) suggestions.push(`Relevance: ${llmAnalysis.technicalAnalysis.relevanceFeedback}`);
    if (llmAnalysis.technicalAnalysis.missingConcepts && llmAnalysis.technicalAnalysis.missingConcepts.length > 0) {
      suggestions.push(`Missing Depth: You could have also mentioned ${llmAnalysis.technicalAnalysis.missingConcepts.join(", ")}.`);
    }
    if (llmAnalysis.resumeAlignment && llmAnalysis.resumeAlignment.feedback) suggestions.push(`Resume Context: ${llmAnalysis.resumeAlignment.feedback}`);
  }

  const nonVerbal = nonVerbalData || analyzeNonVerbal(transcript, durationSeconds, metrics);
  const summary = `The answer contains ${wordCount} words. Your pace is ${speechRatePerMinute || 0} wpm. ${fillerTotal} filler words used.`;

  const analysis = {
    metrics,
    summary,
    suggestions,
    starAnalysis: llmAnalysis ? {
      situation: llmAnalysis.starAnalysis.situation.detected,
      task: llmAnalysis.starAnalysis.task.detected,
      action: llmAnalysis.starAnalysis.action.detected,
      result: llmAnalysis.starAnalysis.result.detected,
      learning: llmAnalysis.starAnalysis.learning.detected
    } : analyzeSTAR(transcript),
    nonVerbal,
    llmDeepDive: llmAnalysis
  };

  const scoring = calculateReadinessScore(analysis, roleType);
  if (llmAnalysis) {
    const relevancePenalty = llmAnalysis.technicalAnalysis.relevanceScore < 50 ? 0.5 : 1.0;
    scoring.totalScore = Math.round(((scoring.totalScore * 0.4) + (llmAnalysis.overallScore * 0.6)) * relevancePenalty);
  }

  return { ...analysis, scoring };
}

function segmentTranscript(transcript, questionsList) {
  const questions = questionsList ? questionsList.split("\n").map(q => q.trim()).filter(Boolean) : [];
  if (questions.length > 0) {
    const segments = [];
    const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const chunkSize = Math.ceil(sentences.length / questions.length);
    for (let i = 0; i < questions.length; i++) {
      const start = i * chunkSize;
      const end = Math.min((i + 1) * chunkSize, sentences.length);
      segments.push({ questionText: questions[i], transcript: sentences.slice(start, end).join(". ") + "." });
    }
    return segments;
  }
  const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const mid = Math.floor(sentences.length / 2);
  return [
    { questionText: "Introduction / Opening", transcript: sentences.slice(0, mid).join(". ") + "." },
    { questionText: "Main Discussion / Closing", transcript: sentences.slice(mid).join(". ") + "." }
  ];
}

function highlightTranscript(transcript) {
  let highlighted = transcript;
  const fillerWords = ["um", "uh", "like", "you know", "actually", "basically", "so", "well"];
  fillerWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    highlighted = highlighted.replace(regex, `<span style="background: #ef4444; color: white; padding: 2px 4px; border-radius: 3px;">$&</span>`);
  });
  return highlighted;
}

function generateExampleAnswer(questionText, jobDescription) {
  return `Situation: In my previous role... Task: My responsibility was... Action: I led... Result: We improved efficiency by 25%.`;
}

function generatePracticeGoals(allQuestions) {
  return ["Structure your answers more clearly using the STAR-L method.", "Reduce filler words.", "Improve eye contact."];
}

app.post("/api/analyze", requireAuth, upload.fields([{ name: "video", maxCount: 1 }, { name: "resume", maxCount: 1 }]), async (req, res) => {
  try {
    const roleType = req.body.roleType || "";
    const interviewType = req.body.interviewType || "";
    const jobDescription = req.body.jobDescription || "";
    const questionsList = req.body.questionsList || "";
    const nonVerbalData = req.body.nonVerbalData ? JSON.parse(req.body.nonVerbalData) : null;
    const videoFile = req.files["video"] ? req.files["video"][0] : null;
    const resumeFile = req.files["resume"] ? req.files["resume"][0] : null;

    if (!videoFile) return res.status(400).json({ error: "Video file is required" });

    let resumeText = "";
    if (resumeFile) {
      const dataBuffer = fs.readFileSync(resumeFile.path);
      const data = await pdf(dataBuffer);
      resumeText = data.text;
    }

    const transcription = await transcribeFile(videoFile.path);
    const segments = segmentTranscript(transcription.transcript, questionsList);
    const questionResults = [];

    for (const segment of segments) {
      const analysis = await analyzeTranscript(segment.transcript, jobDescription, transcription.durationSeconds / segments.length, roleType, interviewType, segment.questionText, nonVerbalData, resumeText);
      questionResults.push({
        questionText: segment.questionText,
        transcript: segment.transcript,
        highlightedTranscript: highlightTranscript(segment.transcript),
        exampleAnswer: generateExampleAnswer(segment.questionText, jobDescription),
        durationSeconds: transcription.durationSeconds / segments.length,
        analysis: analysis,
        starAnalysis: analysis.starAnalysis,
        scoring: analysis.scoring,
        llmDeepDive: analysis.llmDeepDive
      });
    }

    const avgScore = Math.round(questionResults.reduce((acc, q) => acc + q.scoring.totalScore, 0) / questionResults.length);
    const practiceGoals = generatePracticeGoals(questionResults);
    const overallSummary = `Overall Readiness: ${avgScore}/100.`;

    const result = { roleType, interviewType, jobDescription, questions: questionResults, overallSummary, avgScore, practiceGoals };
    db.run(`INSERT INTO results (user_id, role_type, interview_type, avg_score, overall_summary, questions_data) VALUES (?, ?, ?, ?, ?, ?)`, 
      [req.session.userId, roleType, interviewType, avgScore, overallSummary, JSON.stringify(questionResults)]);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to analyze interview" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  open(`http://localhost:${port}`);
});
