import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader("Access-Control-Allow-Origin", "https://northstaraudioinnovations.com");
  res.setHeader("Access-Control-Allow-Origin", "https://brass-piano-cckj.squarespace.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question } = req.body;

  const QDRANT_URL =
    "https://8c74508a-15d3-403a-8344-00eaeb71362e.us-west-1-0.aws.cloud.qdrant.io:6333";
  const QDRANT_CLUSTER = "org_health";
  const QDRANT_COLLECTION = "church_survey";

  const qdrant = new QdrantClient({
    url: QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
  });

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // -----------------------------
  // 1. Scroll all points for analytics
  // -----------------------------
  const scrollResult = await qdrant.scroll(QDRANT_COLLECTION, {
    limit: 1000,
    with_payload: true,
  });

  const CATEGORY_FIELDS = [
    { key: "Gods_Prese", label: "God's Empowering Presence" },
    { key: "Christ-Cent", label: "Christ-Centered Preaching & Teaching" },
    { key: "Authentic_Inspiring", label: "Authentic Community & Loving Relationships" },
    { key: "Inspiring_and_Engaging_Worship", label: "Inspiring & Engaging Worship" },
    { key: "Er_Holistic", label: "Holistic Discipleship & Spiritual Formation" },
    { key: "Gift-Orient", label: "Gift-Oriented Ministry & Service" },
    { key: "Need-Orier", label: "Need-Oriented Outreach & Evangelism" },
    { key: "Effective_Leadership", label: "Effective Leadership & Structure" },
    { key: "Stewardship", label: "Stewardship & Generosity" },
    { key: "Vision_Mission", label: "Vision, Mission & Momentum" },
  ];

  const allScores = [];
  const categoryStats = {};
  const campusStats = {};
  const commentsByCategory = {};

  CATEGORY_FIELDS.forEach(({ key, label }) => {
    categoryStats[key] = { label, sum: 0, count: 0 };
    commentsByCategory[key] = [];
  });

  for (const point of scrollResult.points || []) {
    const payload = point.payload || {};
    const meta = payload.document_metadata || payload;

    const campus = meta["Campus"] || "Unknown";
    const age = meta["Age"] || "Unknown";
    const comments = meta["Comments"] || "";

    let pointTotal = 0;
    let pointCount = 0;

    for (const { key, label } of CATEGORY_FIELDS) {
      const raw = meta[key];
      const value = typeof raw === "number" ? raw : Number(raw);

      if (!Number.isNaN(value)) {
        allScores.push(value);
        categoryStats[key].sum += value;
        categoryStats[key].count += 1;

        pointTotal += value;
        pointCount += 1;

        commentsByCategory[key].push({
          value,
          comments,
          campus,
          age,
          categoryLabel: label,
        });
      }
    }

    if (pointCount > 0) {
      const avgForPoint = pointTotal / pointCount;
      if (!campusStats[campus]) {
        campusStats[campus] = { sum: 0, count: 0 };
      }
      campusStats[campus].sum += avgForPoint;
      campusStats[campus].count += 1;
    }
  }

  let highestScore = null;
  let lowestScore = null;
  let averageScore = null;
  let scoreByCategory = {};
  let scoreByCampus = {};
  let lowestCategoryKey = null;
  let lowestCategoryLabel = null;
  let topCommentsForLowestCategory = [];

  if (allScores.length > 0) {
    highestScore = Math.max(...allScores);
    lowestScore = Math.min(...allScores);
    averageScore =
      allScores.reduce((acc, v) => acc + v, 0) / allScores.length;

    // Category averages
    let minCategoryAvg = Infinity;
    for (const { key, label } of CATEGORY_FIELDS) {
      const { sum, count } = categoryStats[key];
      if (count > 0) {
        const avg = sum / count;
        scoreByCategory[label] = avg;

        if (avg < minCategoryAvg) {
          minCategoryAvg = avg;
          lowestCategoryKey = key;
          lowestCategoryLabel = label;
        }
      }
    }

    // Campus averages
    for (const [campus, { sum, count }] of Object.entries(campusStats)) {
      if (count > 0) {
        scoreByCampus[campus] = sum / count;
      }
    }

    // Top 10 comments for lowest-scoring category
    if (lowestCategoryKey && commentsByCategory[lowestCategoryKey]) {
      topCommentsForLowestCategory = commentsByCategory[lowestCategoryKey]
        .filter((c) => c.comments && c.comments.trim().length > 0)
        .sort((a, b) => a.value - b.value) // lowest scores first
        .slice(0, 10);
    }
  }

  const analytics = {
    highestScore,
    lowestScore,
    averageScore,
    scoreByCategory,
    scoreByCampus,
    lowestCategory: lowestCategoryLabel,
    topCommentsForLowestCategory,
  };

  // -----------------------------
  // 2. Embed the question
  // -----------------------------
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });

  // -----------------------------
  // 3. Semantic search in Qdrant
  // -----------------------------
  const search = await qdrant.search(QDRANT_COLLECTION, {
    vector: embedding.data[0].embedding,
    limit: 5,
  });

  const context = search
    .map((p) => {
      const payload = p.payload || {};
      const meta = payload.document_metadata || payload;
      return meta.Comments || "";
    })
    .filter(Boolean)
    .join("\n\n");

  // -----------------------------
  // 4. Build RAG prompt with analytics
  // -----------------------------
  const prompt = `
You are analyzing church health survey data from the Qdrant cluster "${QDRANT_CLUSTER}".

You have access to the following precomputed analytics:

${JSON.stringify(analytics, null, 2)}

Use BOTH:
- The analytics above
- The contextual comments below

to answer the user's question clearly and practically for church leaders.

Contextual comments:
${context}

User question:
${question}
`;

  // -----------------------------
  // 5. Generate answer
  // -----------------------------
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  res.status(200).json({
    answer: completion.choices[0].message.content,
    analytics,
  });
}
