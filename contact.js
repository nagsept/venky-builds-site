// Vercel serverless function: POST /api/contact
// Emails every project enquiry to CONTACT_TO (default: venkybuilds67@gmail.com).
const nodemailer = require('nodemailer');

const hits = new Map(); // best-effort rate limit per IP (resets when the function restarts)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: real visitors never fill this hidden field.
  if (body.company) return res.status(200).json({ ok: true });

  const name = clean(body.name).slice(0, 100);
  const email = clean(body.email).slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 4000);

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please fill in your name, a valid email, and a message.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }
  recent.push(now);
  hits.set(ip, recent);

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');
    return res.status(500).json({ ok: false, error: 'Email is not configured.' });
  }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

  try {
    await transporter.sendMail({
      from: `"Venky Builds Website" <${user}>`,
      to: process.env.CONTACT_TO || 'venkybuilds67@gmail.com',
      replyTo: `"${name.replace(/"/g, '')}" <${email}>`,
      subject: `New project enquiry from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nProject details:\n${message}`,
      html:
        `<p><strong>Name:</strong> ${esc(name)}<br><strong>Email:</strong> ${esc(email)}</p>` +
        `<p><strong>Project details:</strong></p><p>${esc(message).replace(/\n/g, '<br>')}</p>`,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('sendMail failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not send your message. Please try again.' });
  }
};
