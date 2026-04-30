function calculateReadinessScore(analysis, roleType) {
  const { metrics, starAnalysis, nonVerbal } = analysis;
  
  // Scoring weights
  const weights = {
    content: 0.4,
    communication: 0.3,
    nonVerbal: 0.3
  };

  // 1. Content Score (STAR-L + Keywords)
  const starCount = Object.values(starAnalysis).filter(Boolean).length;
  const starScore = (starCount / 5) * 100;
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

module.exports = { calculateReadinessScore };
