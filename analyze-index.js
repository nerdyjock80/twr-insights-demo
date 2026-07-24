// Calls Azure AI Language for Sentiment Analysis + Key Phrase Extraction on
// a piece of pasted text (e.g. client feedback or a case note). Falls back
// to a clearly-labeled offline heuristic when Azure AI Language isn't
// configured yet, same pattern as the meme generator's caption fallback.

function fallbackAnalyze(text) {
  const positiveWords = ["thank", "grateful", "helped", "great", "amazing", "improved", "supportive", "hope", "progress", "good", "appreciate", "kind"];
  const negativeWords = ["frustrated", "waited", "confusing", "difficult", "delay", "disappointed", "unhelpful", "problem", "worried", "hard", "struggle"];

  const lower = text.toLowerCase();
  const posHits = positiveWords.filter((w) => lower.includes(w));
  const negHits = negativeWords.filter((w) => lower.includes(w));

  let sentiment = "neutral";
  if (posHits.length > negHits.length) sentiment = "positive";
  else if (negHits.length > posHits.length) sentiment = "negative";

  // crude key phrase guess: longer capitalized-ish words / distinct words, just for demo purposes
  const words = text
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 5);
  const keyPhrases = [...new Set(words)].slice(0, 5);

  return { sentiment, confidence: 0.6, keyPhrases, source: "fallback" };
}

async function callLanguage(endpoint, key, kind, text) {
  const url = `${endpoint}language/:analyze-text?api-version=2023-04-01`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key
    },
    body: JSON.stringify({
      kind,
      parameters: { modelVersion: "latest" },
      analysisInput: {
        documents: [{ id: "1", language: "en", text }]
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${kind} failed: ${res.status} ${errText}`);
  }
  return res.json();
}

module.exports = async function (context, req) {
  const text = req.body && req.body.text;

  if (!text || !text.trim()) {
    context.res = { status: 400, body: { error: "No text provided" } };
    return;
  }

  const endpoint = (process.env.AZURE_LANG_ENDPOINT || "").replace(/\/$/, "") + "/";
  const key = process.env.AZURE_LANG_KEY || "";

  if (!process.env.AZURE_LANG_ENDPOINT || !key) {
    context.res = { status: 200, body: fallbackAnalyze(text) };
    return;
  }

  try {
    const [sentimentData, keyPhraseData] = await Promise.all([
      callLanguage(endpoint, key, "SentimentAnalysis", text),
      callLanguage(endpoint, key, "KeyPhraseExtraction", text)
    ]);

    const doc = sentimentData.results.documents[0];
    const kpDoc = keyPhraseData.results.documents[0];

    context.res = {
      status: 200,
      body: {
        sentiment: doc.sentiment,
        confidence: doc.confidenceScores[doc.sentiment],
        keyPhrases: kpDoc.keyPhrases,
        source: "azure-ai-language"
      }
    };
  } catch (err) {
    context.log.error("Language analysis error:", err);
    context.res = { status: 200, body: { ...fallbackAnalyze(text), note: "Azure call failed, used fallback" } };
  }
};
