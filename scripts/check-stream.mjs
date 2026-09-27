const api = process.env.WEBB_API_URL || 'https://webb-api.collins-coordinator-worker.workers.dev';
const origin = process.env.WEBB_ORIGIN || 'https://webb-five-puce.vercel.app';
const tokenResponse = await fetch(`${api}/assemblyai-token`, { headers: { Origin: origin } });
if (!tokenResponse.ok) throw new Error(`Webb token endpoint returned ${tokenResponse.status}`);
const { token } = await tokenResponse.json();
if (typeof token !== 'string') throw new Error('Webb token endpoint returned no token');

const url = new URL('wss://streaming.assemblyai.com/v3/ws');
url.searchParams.set('sample_rate', '16000');
url.searchParams.set('speech_model', 'u3-rt-pro');
url.searchParams.set('token', token);
const socket = new WebSocket(url);

await Promise.race([
  new Promise((resolve, reject) => {
    socket.addEventListener('message', event => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'Begin') resolve();
    });
    socket.addEventListener('error', () => reject(new Error('AssemblyAI WebSocket connection failed')));
    socket.addEventListener('close', event => reject(new Error(`AssemblyAI WebSocket closed (${event.code})`)));
  }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('AssemblyAI WebSocket timed out')), 12000)),
]).finally(() => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'Terminate' }));
  socket.close();
});

console.log('Webb token and AssemblyAI streaming session connected.');
