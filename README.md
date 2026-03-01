# substancesurvey — Vercel RAG Backend

This project is a serverless backend for a Generative AI front end hosted on Squarespace.  
It connects to a Qdrant cluster (`org_health`) and exposes a `/api/rag` endpoint.

---

## 🚀 Deployment (Vercel)

1. Push this folder to GitHub.
2. Go to https://vercel.com → New Project.
3. Import this repository.
4. Vercel will auto-detect the `api/` folder as serverless functions.

### Environment Variables (required)

| Key              | Value (example) |
|------------------|-----------------|
| `QDRANT_API_KEY` | your Qdrant API key |
| `OPENAI_API_KEY` | your OpenAI API key |

No other variables are required.

---

## 🔌 API Endpoint

After deployment, your endpoint will look like:
