import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

export default async function handler(req, res) {

  // --- CORS HEADERS ---
  res.setHeader("Access-Control-Allow-Origin", "https://northstaraudioinnovations.com");
  res.setHeader("Access-Control-Allow-Origin", "https://brass-piano-cckj.squarespace.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question } = req.body;

  // Qdrant cluster details
  const QDRANT_URL =
    "https://8c74508a-15d3-403a-8344-00eaeb71362e.us-west-1-0.aws.cloud.qdrant.io:6333";
  const QDRANT_CLUSTER = "org_health";
  const QDRANT_COLLECTION = "church_survey";

  // Qdrant client
  const qdrant = new QdrantClient({
    url: QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
  });

  // OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // ---------------------------------------------------------
  // ⭐ NEW: Fetch all points and compute highest numeric score
  // ---------------------------------------------------------
  const scrollResult = await qdrant.scroll(QDRANT_COLLECTION, {
    limit: 1000,
    with_payload: true,
  });

  const allScores = scrollResult.points.flatMap((p) => {
    const payload = p.payload || {};
    return [
      payload.worship_score,
      payload.community_score,
      payload.discipleship_score,
      payload.mission_score,
      payload.generosity_score,
      payload.volunteer_score,
      payload.scripture_score,
      payload.prayer_score,
      payload.leadership_score,
      payload.health_score,
    ].filter((n) => typeof n === "number");
  });

  const highestScore =
    allScores.length > 0 ? Math.max(...allScores) : "No scores found";
  // ---------------------------------------------------------

  // 1. Embed the question
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });

  // 2. Query Qdrant for semantic context
  const search = await qdrant.search(QDRANT_COLLECTION, {
    vector: embedding.data[0].embedding,
    limit: 5,
  });

  const context = search
    .map((p) => p.payload?.Comments || "")
    .join("\n\n");

  // 3. Build RAG prompt (⭐ now includes highestScore)
  const prompt = `
You are analyzing church health survey data from the Qdrant cluster "${QDRANT_CLUSTER}".

The highest numeric survey score in the dataset is: ${highestScore}

Use the context below to answer the question.

Context:
${context}

Question:
${question}
`;

  // 4. Generate answer
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  res.status(200).json({
    answer: completion.choices[0].message.content,
    highestScore,
  });
}
