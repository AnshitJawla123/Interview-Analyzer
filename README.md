# AI Interview Analyzer

This project is a web-based tool designed to help users improve their interview skills by analyzing pre-recorded interview videos. Users can upload a full interview recording, and the application uses AI to provide detailed feedback on verbal communication, answer structure (STAR method), non-verbal cues, and overall performance.

## Features

- **Single Video Upload**: Upload a full interview recording instead of separate clips.
- **Automatic Segmentation**: The AI intelligently divides the video transcript into individual question-and-answer segments.
- **Comprehensive Analysis**:
    - **Verbal Communication**: Analyzes speaking pace, filler words (`um`, `like`, etc.), and word count.
    - **Content & Structure**: Detects adherence to the STAR (Situation, Task, Action, Result) method for behavioral questions.
    - **Non-Verbal Cues (Simulated)**: Provides feedback on eye contact, confidence, and energy levels.
- **Readiness Scoring**:
    - **Overall Score**: A weighted score out of 100 to gauge interview readiness.
    - **Category Scores**: Individual scores for Content, Communication, and Non-Verbal delivery.
    - **Role-Based Benchmarks**: Calibrates scores against industry standards for different roles (e.g., Software Engineer, Product Manager).
- **Interactive Coaching**:
    - **Highlighted Transcripts**: Visually pinpoints filler words, weak phrases, and strong action-oriented language.
    - **Personalized Goals**: Generates top-priority practice goals based on your performance.
    - **Example Answers**: Provides model answers for comparison.
- **User Accounts & Progress Tracking**:
    - **Authentication**: Sign up and log in to save your session history.
    - **Interview History**: Review past analyses to track your improvement over time.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: HTML, CSS, JavaScript (no framework)
- **Database**: SQLite for user accounts and results history.
- **File Uploads**: `multer`
- **Authentication**: `express-session`
- **AI Transcription**: OpenAI Whisper (via the `openai` npm package)

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd AI-Interview-Analyzer
    ```

2.  **Install dependencies:**
    Make sure you have Node.js installed. Then, run:
    ```bash
    npm install
    ```

3.  **Configure Environment Variables (Optional):**
    To enable real AI-powered transcription, you need an OpenAI API key.
    - Create a `.env` file in the root of the project.
    - Add your API key to the file:
      ```
      OPENAI_API_KEY="your_openai_api_key_here"
      ```
    *If you do not provide an API key, the application will use a placeholder transcript for demonstration purposes.*

4.  **Start the server:**
    ```bash
    npm start
    ```

5.  **Access the application:**
    Open your web browser and navigate to `http://localhost:3000`.

## How to Use

1.  **Sign Up / Login**: Create an account to save and track your progress.
2.  **Navigate to "New Analysis"**:
    - Select the **Role Type** and **Interview Type**.
    - (Optional) Paste the job description for more accurate keyword analysis.
    - (Optional) List the questions you were asked, one per line. This helps the AI segment your answers more accurately.
3.  **Upload Your Video**: Upload the full recorded interview file.
4.  **Analyze**: Click "Analyze Full Interview" and wait for the processing to complete.
5.  **Review Your Report**:
    - Check your **Overall Readiness Score** and category breakdowns.
    - For each answer segment, review the highlighted transcript, non-verbal cues, and specific suggestions.
6.  **Track Your Progress**: Navigate to the **"History & Progress"** tab to see all your past sessions and scores.
