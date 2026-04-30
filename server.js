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
const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"), (err) => {
  if (err) console.error("Database connection error:", err.message);
  else console.log("Connected to the SQLite database.");
});

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

let cachedClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

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

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function analyzeSTAR(transcript) {
  const text = transcript.toLowerCase();
  
  const indicators = {
    situation: ["situation", "background", "context", "was working at", "at my previous", "there was a time", "when i was", "started when"],
    task: ["tasked with", "responsibility", "goal was", "objective", "needed to", "required to", "my job was", "challenge was"],
    action: ["i did", "i implemented", "i created", "i managed", "i developed", "i led", "i coordinated", "i spoke with", "i built", "i designed"],
    result: ["result", "outcome", "finally", "consequently", "ended up", "achieved", "increased", "decreased", "saved", "impact", "learned"]
  };

  const analysis = {
    situation: indicators.situation.some(word => text.includes(word)),
    task: indicators.task.some(word => text.includes(word)),
    action: indicators.action.some(word => text.includes(word)),
    result: indicators.result.some(word => text.includes(word))
  };

  return analysis;
}

function analyzeNonVerbal(transcript, durationSeconds, metrics) {
  // Simulating non-verbal analysis using metadata
  const fillerRate = metrics.fillerTotal / (metrics.wordCount || 1);
  const pace = metrics.speechRatePerMinute || 130;
  
  // Heuristic-based simulations:
  // - Low fillers + good pace = High Confidence
  // - High fillers = Low Confidence
  // - Very fast pace = High Energy/Nervous
  // - Very slow pace = Low Energy/Deliberate
  
  let confidence = 0.5 + (0.5 - fillerRate * 5); // 0.0 to 1.0
  if (pace > 110 && pace < 160) confidence += 0.1;
  confidence = Math.min(1.0, Math.max(0.1, confidence));
  
  let energy = 0.5 + (pace - 130) / 100; // 0.0 to 1.0
  energy = Math.min(1.0, Math.max(0.1, energy));

  // Eye contact and expressions are mock values in this simulation, 
  // but they demonstrate the intended structure.
  // In a real system, these would be derived from video frame analysis.
  const eyeContact = 0.7 + (Math.random() * 0.2); 
  const dominantExpression = confidence > 0.6 ? "Positive" : "Neutral";

  return {
    confidence: Math.round(confidence * 100),
    energy: Math.round(energy * 100),
    eyeContact: Math.round(eyeContact * 100),
    dominantExpression
  };
}

function calculateReadinessScore(analysis, roleType) {
  const { metrics, starAnalysis, nonVerbal } = analysis;
  
  // Scoring weights
  const weights = {
    content: 0.4,
    communication: 0.3,
    nonVerbal: 0.3
  };

  // 1. Content Score (STAR + Keywords)
  const starCount = Object.values(starAnalysis).filter(Boolean).length;
  const starScore = (starCount / 4) * 100;
  const keywordScore = metrics.keywordCoverage || 50; // default 50 if no JD
  const contentScore = (starScore * 0.7) + (keywordScore * 0.3);

  // 2. Communication Score (Fillers + Pace)
  const fillerRate = metrics.fillerTotal / (metrics.wordCount || 1);
  const fillerScore = Math.max(0, 100 - (fillerRate * 1000)); // penalty for high fillers
  const pace = metrics.speechRatePerMinute || 130;
  const paceScore = (pace >= 110 && pace <= 170) ? 100 : 70;
  const communicationScore = (fillerScore * 0.6) + (paceScore * 0.4);

  // 3. Non-Verbal Score
  const nvScore = (nonVerbal.eyeContact * 0.4) + (nonVerbal.confidence * 0.4) + (nonVerbal.energy * 0.2);

  // Overall weighted score
  let totalScore = (contentScore * weights.content) + (communicationScore * weights.communication) + (nvScore * weights.nonVerbal);

  // Role-based calibration
  const roleBenchmarks = {
    software_engineer: { target: 75, emphasis: "technical content" },
    product_manager: { target: 85, emphasis: "communication and structure" },
    data_analyst: { target: 70, emphasis: "clarity and detail" },
    other: { target: 75, emphasis: "general professionalism" }
  };

  const benchmark = roleBenchmarks[roleType] || roleBenchmarks.other;
  
  // Adjust score slightly based on role difficulty/expectations
  const calibrationFactor = 80 / benchmark.target; 
  totalScore = Math.min(100, Math.round(totalScore * calibrationFactor));

  return {
    totalScore,
    categoryScores: {
      content: Math.round(contentScore),
      communication: Math.round(communicationScore),
      nonVerbal: Math.round(nvScore)
    },
    benchmark: benchmark
  };
}

async function analyzeTranscriptWithLLM(transcript, jobDescription, roleType, interviewType, questionText, resumeText) {
  const client = getOpenAIClient();
  if (!client) return null;

  // Hybrid Model Routing:
  // - Use gpt-4o for complex Technical rounds where deep logic is needed.
  // - Use gpt-4o-mini for Behavioral/HR rounds to save 90% cost and improve speed.
  const model = interviewType === "technical" ? "gpt-4o" : "gpt-4o-mini";

  const prompt = `
    Analyze the following interview transcript segment.
    Question Asked: ${questionText || "Not specified (assume it was an introductory or general question)"}
    Role: ${roleType}
    Interview Type: ${interviewType}
    Job Description context: ${jobDescription}
    Candidate Resume context: ${resumeText || "Not provided"}

    Transcript: "${transcript}"

    Provide a detailed analysis in JSON format with the following structure:
    {
      "starAnalysis": {
        "situation": { "detected": boolean, "feedback": "string" },
        "task": { "detected": boolean, "feedback": "string" },
        "action": { "detected": boolean, "feedback": "string" },
        "result": { "detected": boolean, "feedback": "string" }
      },
      "technicalAnalysis": {
        "conceptsCovered": ["string"],
        "accuracyFeedback": "string",
        "relevanceScore": number (0-100),
        "relevanceFeedback": "string",
        "depthScore": number (0-100),
        "missingConcepts": ["string"],
        "architectureFeedback": "string"
      },
      "communicationFeedback": {
        "clarity": "string",
        "confidence": "string",
        "impactfulPhrases": ["string"]
      },
      "rewrites": [
        { "original": "string", "improved": "string", "reason": "string" }
      ],
      "overallScore": number (0-100),
      "resumeAlignment": {
        "score": number (0-100),
        "feedback": "string"
      }
    }

    Special Instructions:
    - If a resume is provided, check if the answer aligns with the candidate's stated experience. Flag discrepancies.
    - If the user dodges the question or gives an unrelated technical answer, give a low relevanceScore (<40).
    - Look for mention of trade-offs, edge cases, and performance considerations.
    - If the explanation is technically shallow, give a low depthScore.
  `;

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("LLM Analysis Error:", error);
    return null;
  }
}

async function analyzeTranscript(transcript, jobDescription, durationSeconds, roleType, interviewType, questionText, nonVerbalData, resumeText) {
  const text = transcript.toLowerCase();
  const tokens = text.split(/\s+/).filter(Boolean);
  const wordCount = tokens.length;

  // Heuristic Analysis (Fallback)
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

  const sentences = transcript.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const shortSentenceCount = sentences.filter((s) => s.split(/\s+/).filter(Boolean).length < 4).length;

  const jdText = (jobDescription || "").toLowerCase();
  const jdTokens = jdText.split(/\s+/).filter((w) => w.length >= 4);
  const jdUnique = Array.from(new Set(jdTokens));

  const transcriptSet = new Set(tokens);
  const matchedKeywords = jdUnique.filter((k) => transcriptSet.has(k));
  const keywordCoverage = jdUnique.length > 0 ? Math.round((matchedKeywords.length / jdUnique.length) * 100) : null;

  const metrics = {
    wordCount,
    fillerCounts,
    fillerTotal,
    speechRatePerMinute,
    shortSentenceCount,
    keywordCoverage,
    matchedKeywords
  };

  // LLM-Powered Deep Analysis
  const llmAnalysis = await analyzeTranscriptWithLLM(transcript, jobDescription, roleType, interviewType, questionText, resumeText);

  const suggestions = [];

  if (llmAnalysis) {
    // Use LLM insights if available
    if (llmAnalysis.communicationFeedback.clarity) suggestions.push(llmAnalysis.communicationFeedback.clarity);
    if (llmAnalysis.technicalAnalysis.accuracyFeedback) suggestions.push(llmAnalysis.technicalAnalysis.accuracyFeedback);
    if (llmAnalysis.technicalAnalysis.relevanceFeedback) suggestions.push(`Relevance: ${llmAnalysis.technicalAnalysis.relevanceFeedback}`);
    if (llmAnalysis.technicalAnalysis.missingConcepts && llmAnalysis.technicalAnalysis.missingConcepts.length > 0) {
      suggestions.push(`Missing Depth: You could have also mentioned ${llmAnalysis.technicalAnalysis.missingConcepts.join(", ")}.`);
    }
    if (llmAnalysis.technicalAnalysis.architectureFeedback) suggestions.push(`Architecture: ${llmAnalysis.technicalAnalysis.architectureFeedback}`);
    if (llmAnalysis.resumeAlignment && llmAnalysis.resumeAlignment.feedback) {
      suggestions.push(`Resume Context: ${llmAnalysis.resumeAlignment.feedback}`);
    }
    
    const missingStar = Object.keys(llmAnalysis.starAnalysis).filter(k => !llmAnalysis.starAnalysis[k].detected);
    if (missingStar.length > 0) {
      suggestions.push(`LLM Insight: Your STAR structure could be improved. You seem to be missing or have a weak ${missingStar.join(", ")}.`);
    }
  } else {
    // Fallback to heuristics
    if (fillerTotal > wordCount * 0.03) {
      suggestions.push("Reduce filler words by pausing briefly instead of saying um or like.");
    }
    if (speechRatePerMinute !== null) {
      if (speechRatePerMinute < 100) suggestions.push("Speak a little faster to sound more confident.");
      else if (speechRatePerMinute > 170) suggestions.push("Slow down slightly so the interviewer can follow.");
    }
    const star = analyzeSTAR(transcript);
    const missingStar = Object.keys(star).filter(k => !star[k]);
    if (missingStar.length > 0) {
      suggestions.push(`Try to follow the STAR method more closely. Missing: ${missingStar.join(", ")}.`);
    }
  }

  const nonVerbal = nonVerbalData || analyzeNonVerbal(transcript, durationSeconds, metrics);
  
  const summaryParts = [];
  summaryParts.push(`The answer contains ${wordCount} words.`);
  if (speechRatePerMinute !== null) summaryParts.push(`Your pace is ${speechRatePerMinute} wpm.`);
  if (fillerTotal > 0) summaryParts.push(`${fillerTotal} filler words used.`);
  
  const summary = summaryParts.join(" ");

  const analysis = {
    metrics,
    summary,
    suggestions,
    starAnalysis: llmAnalysis ? {
      situation: llmAnalysis.starAnalysis.situation.detected,
      task: llmAnalysis.starAnalysis.task.detected,
      action: llmAnalysis.starAnalysis.action.detected,
      result: llmAnalysis.starAnalysis.result.detected
    } : analyzeSTAR(transcript),
    nonVerbal,
    llmDeepDive: llmAnalysis
  };

  const scoring = calculateReadinessScore(analysis, roleType);
  if (llmAnalysis) {
    // Blend LLM score into readiness score
    // Weighting relevance heavily if it's low
    const relevancePenalty = llmAnalysis.technicalAnalysis.relevanceScore < 50 ? 0.5 : 1.0;
    scoring.totalScore = Math.round(((scoring.totalScore * 0.4) + (llmAnalysis.overallScore * 0.6)) * relevancePenalty);
  }

  return {
    ...analysis,
    scoring
  };
}

async function transcribeFile(filePath) {
  const client = getOpenAIClient();

  if (!client) {
    return {
      transcript: "This is a placeholder transcript for testing purposes. I was working at my previous company and tasked with a goal to increase efficiency. I implemented a new system and finally achieved a 20% improvement in speed. I also created a detailed report basically to show the results to my manager, like you know, it was actually a great situation for the team.",
      durationSeconds: 45 // Mock duration
    };
  }


  try {
    const fileStream = fs.createReadStream(filePath);

    const response = await client.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1",
      response_format: "verbose_json"
    });

    const transcriptText = response.text || "";

    let durationSeconds = null;
    if (Array.isArray(response.segments) && response.segments.length > 0) {
      const last = response.segments[response.segments.length - 1];
      if (typeof last.end === "number") {
        durationSeconds = last.end;
      }
    }

    return {
      transcript: transcriptText,
      durationSeconds
    };
  } catch (error) {
    return {
      transcript: "Transcription failed for file.",
      durationSeconds: null
    };
  }
}

function segmentTranscript(transcript, questionsList) {
  // If user provided a list of questions, we try to split by those questions.
  // Otherwise, we split by generic sentence boundaries or long pauses.
  const questions = questionsList ? questionsList.split("\n").map(q => q.trim()).filter(Boolean) : [];
  
  if (questions.length > 0) {
    // Advanced: In a real app, you'd use an LLM or fuzzy matching to find where these questions are answered.
    // For now, we simulate segmentation by dividing the transcript into equal parts based on the number of questions.
    const segments = [];
    const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const chunkSize = Math.ceil(sentences.length / questions.length);
    
    for (let i = 0; i < questions.length; i++) {
      const start = i * chunkSize;
      const end = Math.min((i + 1) * chunkSize, sentences.length);
      segments.push({
        questionText: questions[i],
        transcript: sentences.slice(start, end).join(". ") + "."
      });
    }
    return segments;
  } else {
    // Auto-segmentation: split by "interviewer-like" triggers or just break into 2-3 logical chunks
    const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const mid = Math.floor(sentences.length / 2);
    
    return [
      { questionText: "Introduction / Opening", transcript: sentences.slice(0, mid).join(". ") + "." },
      { questionText: "Main Discussion / Closing", transcript: sentences.slice(mid).join(". ") + "." }
    ];
  }
}

function highlightTranscript(transcript) {
  let highlighted = transcript;
  
  const fillerWords = ["um", "uh", "like", "you know", "actually", "basically", "so", "well"];
  fillerWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    highlighted = highlighted.replace(regex, `<span style="background: #ef4444; color: white; padding: 2px 4px; border-radius: 3px;">$&</span>`);
  });

  const weakPhrases = ["i think", "i guess", "maybe", "sort of", "kind of"];
  weakPhrases.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    highlighted = highlighted.replace(regex, `<span style="background: #f97316; color: white; padding: 2px 4px; border-radius: 3px;">$&</span>`);
  });

  const strongPhrases = ["i achieved", "i led", "i managed", "i developed", "i created", "the result was"];
  strongPhrases.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    highlighted = highlighted.replace(regex, `<span style="background: #10b981; color: white; padding: 2px 4px; border-radius: 3px;">$&</span>`);
  });

  return highlighted;
}

function generateExampleAnswer(questionText, jobDescription) {
  const jdKeywords = jobDescription ? jobDescription.split(/\s+/).slice(0, 5).join(", ") : "relevant skills";
  return `Situation: In my previous role, we faced a challenge with ${jdKeywords}. \nTask: My responsibility was to resolve this and ensure team success. \nAction: I led the initiative, coordinated with stakeholders, and implemented a new workflow. \nResult: As a result, we improved efficiency by 25% and met all project deadlines.`;
}

function generatePracticeGoals(allQuestions) {
  const avgScores = {
    content: Math.round(allQuestions.reduce((a, q) => a + q.scoring.categoryScores.content, 0) / allQuestions.length),
    communication: Math.round(allQuestions.reduce((a, q) => a + q.scoring.categoryScores.communication, 0) / allQuestions.length),
    nonVerbal: Math.round(allQuestions.reduce((a, q) => a + q.scoring.categoryScores.nonVerbal, 0) / allQuestions.length)
  };

  const goals = [];
  if (avgScores.content < 80) goals.push("Structure your answers more clearly using the STAR method (especially the Result).");
  if (avgScores.communication < 80) goals.push("Reduce filler words like 'um' and 'like' by embracing short pauses.");
  if (avgScores.nonVerbal < 80) goals.push("Improve your delivery by maintaining steady eye contact and higher energy.");
  
  if (goals.length === 0) goals.push("Keep refining your delivery and try more complex behavioral scenarios.");
  
  return goals;
}

app.post("/api/analyze", requireAuth, upload.fields([{ name: "video", maxCount: 1 }, { name: "resume", maxCount: 1 }]), async (req, res) => {
  try {
    console.log("Analyze request received:", req.body.roleType);
    const roleType = req.body.roleType || "";
    const interviewType = req.body.interviewType || "";
    const jobDescription = req.body.jobDescription || "";
    const questionsList = req.body.questionsList || "";
    const nonVerbalData = req.body.nonVerbalData ? JSON.parse(req.body.nonVerbalData) : null;

    const videoFile = req.files["video"] ? req.files["video"][0] : null;
    const resumeFile = req.files["resume"] ? req.files["resume"][0] : null;

    if (!videoFile) {
      console.log("No video file uploaded");
      return res.status(400).json({ error: "Video file is required" });
    }

    let resumeText = "";
    if (resumeFile) {
      console.log("Parsing resume:", resumeFile.path);
      const dataBuffer = fs.readFileSync(resumeFile.path);
      const data = await pdf(dataBuffer);
      resumeText = data.text;
    }

    console.log("Transcribing file:", videoFile.path);
    const transcription = await transcribeFile(videoFile.path);
    console.log("Transcription complete, segmenting...");
    
    const segments = segmentTranscript(transcription.transcript, questionsList);
    console.log(`Found ${segments.length} segments`);
    
    const questionResults = [];
    let totalWordCount = 0;
    let totalFillers = 0;

    for (const segment of segments) {
      const analysis = await analyzeTranscript(segment.transcript, jobDescription, transcription.durationSeconds / segments.length, roleType, interviewType, segment.questionText, nonVerbalData, resumeText);
      
      totalWordCount += analysis.metrics.wordCount;
      totalFillers += analysis.metrics.fillerTotal;

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
    const overallSummary = `Analysis complete. Overall Readiness: ${avgScore}/100. ${practiceGoals[0]}`;

    const result = {
      roleType,
      interviewType,
      jobDescription,
      questions: questionResults,
      overallSummary,
      avgScore,
      practiceGoals
    };

    // Save to DB
    console.log("Saving results to database for user:", req.session.userId);
    db.run(`INSERT INTO results (user_id, role_type, interview_type, avg_score, overall_summary, questions_data) 
      VALUES (?, ?, ?, ?, ?, ?)`, 
      [req.session.userId, roleType, interviewType, avgScore, overallSummary, JSON.stringify(questionResults)],
      (err) => {
        if (err) console.error("Failed to save result:", err.message);
      }
    );

    res.json(result);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze interview" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  open(`http://localhost:${port}`);
});
