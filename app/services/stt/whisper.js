const OpenAI = require("openai");
const fs = require("fs");

let cachedClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

async function transcribeFile(filePath) {
  const client = getOpenAIClient();

  if (!client) {
    return {
      transcript: "This is a placeholder transcript for testing purposes. I was working at my previous company and tasked with a goal to increase efficiency. I implemented a new system and finally achieved a 20% improvement in speed. I also created a detailed report basically to show the results to my manager, like you know, it was actually a great situation for the team.",
      durationSeconds: 45
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
    console.error("Transcription Error:", error);
    return {
      transcript: "Transcription failed for file.",
      durationSeconds: null
    };
  }
}

module.exports = { transcribeFile, getOpenAIClient };
