const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

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
    if (!file.mimetype.startsWith("video/") && !file.mimetype.startsWith("audio/")) {
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

function analyzeTranscript(transcript, jobDescription, durationSeconds, roleType) {
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

  const suggestions = [];

  if (fillerTotal > wordCount * 0.03) {
    suggestions.push("Reduce filler words by pausing briefly instead of saying um or like.");
  }

  if (speechRatePerMinute !== null) {
    if (speechRatePerMinute < 100) {
      suggestions.push("Speak a little faster to sound more confident and engaged.");
    } else if (speechRatePerMinute > 170) {
      suggestions.push("Slow down slightly so the interviewer can follow your answers.");
    }
  }

  if (shortSentenceCount > sentences.length * 0.5) {
    suggestions.push("Extend your answers with more detail and concrete examples.");
  }

  if (keywordCoverage !== null && keywordCoverage < 40) {
    suggestions.push("Mention more skills and keywords from the job description in your answers.");
  }

  const star = analyzeSTAR(transcript);
  const missingStar = Object.keys(star).filter(k => !star[k]);
  if (missingStar.length > 0) {
    suggestions.push(`Try to follow the STAR method more closely. You seem to be missing: ${missingStar.join(", ")}.`);
  }

  const nonVerbal = analyzeNonVerbal(transcript, durationSeconds, metrics);
  
  if (nonVerbal.eyeContact < 60) {
    suggestions.push("Maintain more consistent eye contact with the camera.");
  }
  if (nonVerbal.energy < 40) {
    suggestions.push("Try to bring more energy and enthusiasm into your delivery.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Your answers are generally well structured. Focus on refining specific stories for key skills.");
  }

  const summaryParts = [];

  summaryParts.push(`The answer contains ${wordCount} words.`);

  if (speechRatePerMinute !== null) {
    summaryParts.push(`Your pace is ${speechRatePerMinute} wpm.`);
  }

  if (fillerTotal > 0) {
    summaryParts.push(`${fillerTotal} filler words used.`);
  }

  if (keywordCoverage !== null) {
    summaryParts.push(`${keywordCoverage}% JD keyword match.`);
  }

  const summary = summaryParts.join(" ");

  const analysis = {
    metrics,
    summary,
    suggestions,
    starAnalysis: star,
    nonVerbal
  };

  const scoring = calculateReadinessScore(analysis, roleType);

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

app.post("/api/analyze", upload.array("clips"), async (req, res) => {
  try {
    const roleType = req.body.roleType || "";
    const interviewType = req.body.interviewType || "";
    const jobDescription = req.body.jobDescription || "";
    const questionTexts = req.body.questionText || [];

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "At least one video/audio file is required" });
    }

    const questionResults = [];
    let totalWordCount = 0;
    let totalFillers = 0;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const qText = Array.isArray(questionTexts) ? questionTexts[i] : questionTexts;
      
      const transcription = await transcribeFile(file.path);
      const analysis = analyzeTranscript(transcription.transcript, jobDescription, transcription.durationSeconds, roleType);
      
      totalWordCount += analysis.metrics.wordCount;
      totalFillers += analysis.metrics.fillerTotal;

      questionResults.push({
        questionText: qText,
        transcript: transcription.transcript,
        durationSeconds: transcription.durationSeconds,
        analysis: analysis,
        starAnalysis: analysis.starAnalysis,
        scoring: analysis.scoring
      });
    }

    // Calculate overall session score
    const avgScore = Math.round(questionResults.reduce((acc, q) => acc + q.scoring.totalScore, 0) / req.files.length);
    const overallSummary = `Analysis complete for ${req.files.length} clips. Overall Readiness: ${avgScore}/100. Total words: ${totalWordCount}. Average filler words: ${Math.round(totalFillers / req.files.length)}.`;

    const result = {
      roleType,
      interviewType,
      jobDescription,
      questions: questionResults,
      overallSummary,
      avgScore
    };

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to analyze interview clips" });
  }
});

app.listen(port, () => {});
