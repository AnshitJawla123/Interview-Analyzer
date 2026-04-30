# 🎙️ AI Interview Analyzer

A web-based tool that analyzes recorded interview videos using AI to help candidates improve their performance. Upload a full interview recording and get a detailed report covering verbal communication, answer structure, content relevance, non-verbal cues, and an overall readiness score — all powered by OpenAI Whisper and GPT.

---

## ✨ Features

- **🎥 Video & Audio Upload** — Upload your full interview recording (up to 500MB); supports both video and audio file formats
- **📝 AI Transcription** — Uses OpenAI Whisper (`whisper-1`) to transcribe your recording with timestamps and duration
- **🔀 Auto Segmentation** — Splits the transcript into per-question segments; provide your question list for precise segmentation or let the AI divide it automatically
- **📄 Resume Upload & Alignment** — Upload your PDF resume to check if your answers align with your stated experience; discrepancies are flagged
- **🌟 STAR Method Analysis** — Detects Situation, Task, Action, and Result components in each answer using both GPT and heuristic fallback
- **🗣️ Verbal Communication Metrics** — Tracks word count, filler words (`um`, `uh`, `like`, `you know`, etc.), weak phrases (`I think`, `maybe`), speech rate (WPM), and short sentence patterns
- **📊 Highlighted Transcripts** — Colour-coded transcript view: 🔴 filler words, 🟠 weak phrases, 🟢 strong action-oriented language
- **🤖 GPT-Powered Deep Dive** — Uses `gpt-4o` for technical interviews and `gpt-4o-mini` for behavioral/HR rounds (hybrid routing for cost efficiency) to provide:
  - Technical accuracy, relevance, and depth scores
  - Missing concepts and architecture feedback
  - Suggested rewrites for weak sentences
  - JD keyword coverage analysis
- **📈 Readiness Scoring** — Weighted overall score (0–100) across three categories:
  - **Content** (40%) — STAR adherence + JD keyword coverage
  - **Communication** (30%) — Filler rate + speech pace
  - **Non-Verbal** (30%) — Confidence, energy, eye contact (heuristic simulation)
- **🎯 Role-Based Calibration** — Adjusts scoring benchmarks per role: Software Engineer, Product Manager, Data Analyst, and more
- **💡 Personalized Practice Goals** — Auto-generates top-priority improvement areas based on your weakest category scores
- **📋 Example Answers** — Provides a model STAR-structured answer for each question using job description context
- **🔐 User Authentication** — Sign up and log in with bcrypt-hashed passwords and session management
- **🕓 Interview History** — All past analyses are saved to your account for progress tracking over time

---

## 🛠️ Tech Stack

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)

| Layer              | Technology                                              |
|--------------------|---------------------------------------------------------|
| Backend            | Node.js, Express.js                                     |
| Frontend           | Vanilla HTML, CSS, JavaScript                           |
| Database           | SQLite3                                                 |
| AI Transcription   | OpenAI Whisper (`whisper-1`)                            |
| AI Analysis        | GPT-4o (technical) / GPT-4o-mini (behavioral)           |
| File Uploads       | Multer (video/audio + PDF resume, up to 500MB)          |
| Auth               | express-session + bcrypt                                |
| PDF Parsing        | pdf-parse                                               |

---

## 📁 Project Structure

```
Interview-Analyzer/
├── server.js           # All backend logic — routes, AI calls, scoring engine
├── package.json
├── .env                # API keys (not committed)
├── database.sqlite     # Auto-created on first run
├── uploads/            # Temp storage for uploaded files (auto-created)
└── public/
    └── index.html      # Single-page frontend UI
```

---

## ⚙️ Setup & Installation

### Prerequisites

- Node.js v18+
- An OpenAI API key (optional — app works in demo mode without one)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Interview-Analyzer.git
cd Interview-Analyzer
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

> **Note:** If you skip this step, the app runs in **demo mode** using a placeholder transcript — no API key is required to explore the UI and scoring system.

### 4. Start the Server

```bash
npm start
```

Open your browser at `http://localhost:3000`

---

## 🚀 How to Use

1. **Sign Up / Log In** — Create an account to save and track your interview history
2. **Configure Your Session:**
   - Select a **Role Type** (e.g., Software Engineer, Product Manager)
   - Select an **Interview Type** (Technical or Behavioral/HR)
   - *(Optional)* Paste the **Job Description** for keyword relevance analysis
   - *(Optional)* List the **questions** you were asked (one per line) for precise segmentation
   - *(Optional)* Upload your **resume (PDF)** to check answer-to-experience alignment
3. **Upload Your Recording** — Video or audio file, up to 500MB
4. **Click "Analyze Full Interview"** — Wait for transcription and analysis to complete
5. **Review Your Report:**
   - Overall Readiness Score and category breakdown
   - Colour-highlighted transcript per question
   - STAR method detection, non-verbal cues, and GPT-generated rewrites
   - Personalized practice goals and example model answers
6. **Track Progress** — Visit the **History & Progress** tab to revisit all past sessions

---

## 🔌 API Reference

| Method | Endpoint       | Auth Required | Description                                              |
|--------|----------------|:-------------:|----------------------------------------------------------|
| POST   | `/api/signup`  | ❌            | Register a new user account                              |
| POST   | `/api/login`   | ❌            | Log in with username and password                        |
| POST   | `/api/logout`  | ✅            | Destroy the current session                              |
| GET    | `/api/me`      | ❌            | Check current session login status                       |
| GET    | `/api/history` | ✅            | Fetch all past analyses for the logged-in user           |
| POST   | `/api/analyze` | ❌*           | Upload video/resume and run the full analysis pipeline   |

> *`/api/analyze` works without login, but results are only saved to history if the user is authenticated.

---

## 🧠 Scoring Breakdown

| Category      | Weight | What It Measures                                         |
|---------------|--------|----------------------------------------------------------|
| Content       | 40%    | STAR method adherence (70%) + JD keyword coverage (30%) |
| Communication | 30%    | Filler word rate (60%) + speech pace in WPM (40%)        |
| Non-Verbal    | 30%    | Eye contact (40%) + confidence (40%) + energy (20%)      |

When GPT is available, its score is blended at 60% weight into the final readiness score. If the answer relevance score falls below 50, an additional penalty is applied. Scores are also calibrated against role-specific benchmarks (e.g., Product Manager has a higher target bar than Data Analyst).

---

## ⚠️ Known Limitations

- Non-verbal scores (eye contact, facial expressions) are currently **heuristic simulations** derived from speech metrics — not actual video frame analysis
- Transcript segmentation by questions is approximated by dividing sentences into equal chunks — not true speaker diarization
- The `uploads/` folder is not automatically cleaned up; uploaded files persist on disk until manually deleted

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).