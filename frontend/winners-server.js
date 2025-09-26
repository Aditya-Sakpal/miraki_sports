import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';

// Simple Express server exposing endpoints to insert and fetch winners
// Intended to be deployed separately (e.g., Vercel) as per user's request

const app = express();
const PORT = process.env.PORT || 5055;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

// MongoDB connection
// NOTE: Embedding credentials is insecure; this is for the requested quick setup only.
const uri = "mongodb+srv://rexsona:pass123@cluster0.ehe4owt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function getWinnersCollection() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  return client.db('club_rexsona').collection('winners');
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', endpoints: ['/winners [GET, POST]'] });
});

// Fetch winners
app.get('/winners', async (req, res) => {
  try {
    const col = await getWinnersCollection();
    const docs = await col.find({}).sort({ createdAt: -1 }).limit(200).toArray();
    const winners = docs.map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      city: d.city,
      email: d.email || undefined,
      createdAt: d.createdAt,
    }));
    res.json({ success: true, winners });
  } catch (err) {
    console.error('GET /winners error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch winners' });
  }
});

// Insert/replace winners
app.post('/winners', async (req, res) => {
  try {
    const winners = req.body?.winners;
    if (!Array.isArray(winners)) {
      return res.status(400).json({ success: false, error: 'Invalid body: { winners: Winner[] } required' });
    }

    const col = await getWinnersCollection();
    // Replace entire collection content with the provided winners
    await col.deleteMany({});
    if (winners.length > 0) {
      const now = new Date().toISOString();
      const documents = winners.map((w) => ({
        id: w.id,
        name: w.name,
        phone: w.phone,
        city: w.city,
        email: w.email || null,
        createdAt: now,
      }));
      const result = await col.insertMany(documents);
      return res.json({ success: true, insertedCount: result.insertedCount });
    }
    return res.json({ success: true, insertedCount: 0 });
  } catch (err) {
    console.error('POST /winners error:', err);
    res.status(500).json({ success: false, error: 'Failed to save winners' });
  }
});

app.listen(PORT, () => {
  console.log(`Winners server listening on port ${PORT}`);
});


