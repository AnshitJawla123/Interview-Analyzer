function analyzeSTAR(transcript) {
  const text = transcript.toLowerCase();
  
  const indicators = {
    situation: ["situation", "background", "context", "was working at", "at my previous", "there was a time", "when i was", "started when"],
    task: ["tasked with", "responsibility", "goal was", "objective", "needed to", "required to", "my job was", "challenge was"],
    action: ["i did", "i implemented", "i created", "i managed", "i developed", "i led", "i coordinated", "i spoke with", "i built", "i designed"],
    result: ["result", "outcome", "finally", "consequently", "ended up", "achieved", "increased", "decreased", "saved", "impact", "learned"],
    learning: ["learned that", "takeaway", "reflecting on", "next time", "realized", "discovered", "growth", "improvement", "insight"]
  };

  const analysis = {
    situation: indicators.situation.some(word => text.includes(word)),
    task: indicators.task.some(word => text.includes(word)),
    action: indicators.action.some(word => text.includes(word)),
    result: indicators.result.some(word => text.includes(word)),
    learning: indicators.learning.some(word => text.includes(word))
  };

  return analysis;
}

function analyzeNonVerbal(transcript, durationSeconds, metrics) {
  const fillerRate = metrics.fillerTotal / (metrics.wordCount || 1);
  const pace = metrics.speechRatePerMinute || 130;
  
  let confidence = 0.5 + (0.5 - fillerRate * 5); 
  if (pace > 110 && pace < 160) confidence += 0.1;
  confidence = Math.min(1.0, Math.max(0.1, confidence));
  
  let energy = 0.5 + (pace - 130) / 100; 
  energy = Math.min(1.0, Math.max(0.1, energy));

  const eyeContact = 0.7 + (Math.random() * 0.2); 
  const dominantExpression = confidence > 0.6 ? "Positive" : "Neutral";

  return {
    confidence: Math.round(confidence * 100),
    energy: Math.round(energy * 100),
    eyeContact: Math.round(eyeContact * 100),
    dominantExpression
  };
}

module.exports = { analyzeSTAR, analyzeNonVerbal };
