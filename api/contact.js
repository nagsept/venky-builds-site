// POST /api/contact - emails project enquiries to CONTACT_TO.
// Hardened: same-origin check (CSRF), JSON-only, strict validation, HTML escaping,
// header-injection stripping, rate limits, no secrets or personal data in logs.
const nodemailer = require('nodemailer');

const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5; // per visitor IP per window
let globalCount = 0;
let globalResetAt = Date.now() + 60 * 60 * 1000;
const GLOBAL_MAX = 60; // emails per hour across all visitors (per server instance)

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s) => String(s).replace(/[\r\n\u0000-\u001f]+/g, ' ').trim();

function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!sameOrigin(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ ok: false, error: 'Unsupported content type' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.company) return res.status(200).json({ ok: true }); // honeypot

  if (![body.name, body.email, body.message].every((v) => typeof v === 'string')) {
    return res.status(400).json({ ok: false, error: 'Please fill in every field.' });
  }
  const name = clean(body.name).slice(0, 100);
  const email = clean(body.email).slice(0, 200);
  const message = body.message.replace(/\u0000/g, '').trim().slice(0, 4000);

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please fill in your name, a valid email, and a message.' });
  }

  const now = Date.now();
  if (now > globalResetAt) {
    globalCount = 0;
    globalResetAt = now + 60 * 60 * 1000;
  }
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (hits.size > 2000) hits.clear();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS || globalCount >= GLOBAL_MAX) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }
  recent.push(now);
  hits.set(ip, recent);
  globalCount += 1;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error('Email is not configured: missing environment variables');
    return res.status(500).json({ ok: false, error: 'Email is not configured.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await transporter.sendMail({
      from: `"Venky Builds Website" <${user}>`,
      to: process.env.CONTACT_TO || 'venkybuilds67@gmail.com',
      replyTo: `"${name.replace(/["<>]/g, '')}" <${email}>`,
      subject: `New project enquiry from ${name}`.slice(0, 150),
      text: `Name: ${name}\nEmail: ${email}\n\nProject details:\n${message}`,
      html:
        `<p><strong>Name:</strong> ${esc(name)}<br><strong>Email:</strong> ${esc(email)}</p>` +
        `<p><strong>Project details:</strong></p><p>${esc(message).replace(/\n/g, '<br>')}</p>`,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('sendMail failed:', err && err.code ? err.code : 'unknown error');
    return res.status(500).json({ ok: false, error: 'Could not send your message. Please try again.' });
  }
};
