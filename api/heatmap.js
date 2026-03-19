import { QdrantClient } from "@qdrant/js-client-rest";

export default async function handler(req, res) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY });

  // Example: aggregate average score by campus × category
  const campuses = ["Main", "East", "West"];
  const categories = ["Worship", "Community", "Teaching", "Outreach"];

  const matrix = [];

  for (let c = 0; c < campuses.length; c++) {
    matrix[c] = [];
    for (let k = 0; k < categories.length; k++) {
      const points = await client.scroll("org_health", {
        filter: {
          must: [
            { key: "campus", match: { value: campuses[c] }},
            { key: "category", match: { value: categories[k] }}
          ]
        }
      });

      const scores = points.points.map(p => p.payload.score);
      const avg = scores.length ? scores.reduce((a,b)=>a+b,0) / scores.length : 0;

      matrix[c][k] = avg;
    }
  }

  res.status(200).json({
    campuses,
    categories,
    matrix
  });
}
