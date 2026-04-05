import { safeFetch } from '../utils/fetch.mjs';

const API_BASE = 'https://fofa.info/api/v1';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const email = process.env.FOFA_EMAIL;
  const key = process.env.FOFA_API_KEY;

  if (!email || !key) {
    return {
      source: 'FOFA',
      timestamp,
      status: 'no_credentials',
      message: 'Set FOFA_EMAIL and FOFA_API_KEY in .env. Register at https://fofa.info for API access.',
      signals: [],
    };
  }

  try {
    const query = 'port=22 && country=CN';
    const qbase64 = Buffer.from(query).toString('base64');
    const url = `${API_BASE}/search/all?email=${encodeURIComponent(email)}&key=${key}&qbase64=${qbase64}&size=10`;

    const data = await safeFetch(url, { timeout: 15000 });

    if (data.error) {
      if (data.error.includes('401') || data.error.includes('403')) {
        return {
          source: 'FOFA',
          timestamp,
          status: 'auth_failed',
          message: 'FOFA API authentication failed. Check your email and API key.',
          signals: [],
        };
      }
      return { source: 'FOFA', timestamp, status: 'api_error', error: data.error, signals: [] };
    }

    const results = data.results || [];
    const total = data.size || results.length;

    const signals = [];
    if (total > 0) {
      signals.push({ severity: 'info', signal: `FOFA found ${total.toLocaleString()} results for sample query` });
    }

    return {
      source: 'FOFA',
      timestamp,
      status: 'connected',
      totalResults: total,
      sampleResults: results.slice(0, 10),
      signals,
    };
  } catch (e) {
    return { source: 'FOFA', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('fofa.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
