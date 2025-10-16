api/
└─ generateVideo.js
// /api/generateVideo — вернёт демо-видео (бесплатно), а позже сможет вызывать Sora 2.
// Работает на Vercel как серверная функция (Node 18+).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const demo = String(process.env.DEMO_MODE).toLowerCase() === 'true';
    const { prompt, duration = 8, resolution = '1280x720' } = req.body || {};

    // === ДЕМО (бесплатно) ===
    if (demo) {
      return res.status(200).json({
        status: 'completed',
        demo: true,
        // Публичный тестовый mp4 — просто чтобы плеер показал видео
        url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        note: 'Демо-режим: видео не генерируется, показываем тестовый ролик.'
      });
    }

    // === РЕАЛЬНЫЙ ВЫЗОВ (платно) — заполни OPENAI_API_KEY и сними DEMO_MODE ===
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.SORA_MODEL || 'sora-2';

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Нет OPENAI_API_KEY в переменных окружения' });
    }

    // 1) Старт задачи рендера
    const createRes = await fetch('https://api.openai.com/v1/videos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: MODEL, prompt, duration, resolution })
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return res.status(500).json({ error: `Create failed: ${err}` });
    }

    const job = await createRes.json(); // { id, status, ... }

    // 2) Простое ожидание (polling) — для демо. В проде лучше вебхук.
    const started = Date.now();
    const TIMEOUT = 90_000;
    const INTERVAL = 2000;
    let status = job.status;
    let last;

    while (Date.now() - started < TIMEOUT) {
      await new Promise(r => setTimeout(r, INTERVAL));
      const s = await fetch(`https://api.openai.com/v1/videos/${job.id}`, {
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
      });
      if (!s.ok) {
        const err = await s.text();
        return res.status(500).json({ error: `Status failed: ${err}` });
      }
      last = await s.json();
      status = last.status;
      if (['completed', 'failed', 'canceled'].includes(status)) break;
    }

    if (status !== 'completed') {
      return res.status(202).json({ jobId: job.id, status, note: 'Видео ещё рендерится' });
    }

    // 3) Получить контент (ссылки на ассеты)
    const c = await fetch(`https://api.openai.com/v1/videos/${job.id}/content`, {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
    });
    if (!c.ok) {
      const err = await c.text();
      return res.status(500).json({ error: `Content failed: ${err}` });
    }
    const content = await c.json(); // { assets: [{type,url}, ...] }
    const video = (content.assets || []).find(a => a.type === 'video') || (content.assets || [])[0];

    return res.status(200).json({ jobId: job.id, status: 'completed', url: video && video.url, assets: content.assets });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
