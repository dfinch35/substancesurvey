import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

export default async function handler(req, res) {

 // --- CORS HEADERS ---
  res.setHeader("Access-Control-Allow-Origin", "https://northstaraudioinnovations.com/surveychat");
 res.setHeader("Access-Control-Allow-Origin", "https://brass-piano-cckj.squarespace.com");
 // res.setHeader("Access-Control-Allow-Origin", "https://falcon-gold-skhg.squarespace.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question } = req.body;

  // Qdrant cluster details (safe to hardcode)
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

  // 1. Embed the question
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });

  // 2. Query Qdrant
  const search = await qdrant.search(QDRANT_COLLECTION, {
    vector: embedding.data[0].embedding,
    limit: 5,
  });

  const context = search
    .map((p) => p.payload?.Comments || "")
    .join("\n\n");

  // 3. Build RAG prompt
  const prompt = `
You are analyzing church health survey data from the Qdrant cluster "${QDRANT_CLUSTER}" (ID: 8c74508a-15d3-403a-8344-00eaeb71362e).

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

  res.status(200).json({ answer: completion.choices[0].message.content });
}
