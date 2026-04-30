const { getOpenAIClient } = require("../stt/whisper");

async function analyzeTranscriptWithLLM(transcript, jobDescription, roleType, interviewType, questionText, resumeText) {
  const client = getOpenAIClient();
  if (!client) return null;

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
        "result": { "detected": boolean, "feedback": "string" },
        "learning": { "detected": boolean, "feedback": "string" }
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

module.exports = { analyzeTranscriptWithLLM };
