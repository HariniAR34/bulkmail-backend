require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const Email = require('./models/Email');

const app = express();
const allowedOrigin = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://hariniraman1979_db_user:3zhwCargYUl0pJJ7@cluster0.lddfred.mongodb.net/bulkmaildb?retryWrites=true&w=majority';

console.log('Using MONGO_URI (sanitized):', MONGO_URI.replace(/(:[^@]+)@/, ':*****@'));

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected:', mongoose.connection.name))
  .catch(err => console.error('MongoDB connection error', err));

let transporterPromise;

async function createTransporter() {
  if (transporterPromise) {
    return transporterPromise;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporterPromise = Promise.resolve(nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }));

    return transporterPromise;
  }

  transporterPromise = nodemailer.createTestAccount().then((testAccount) => {
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  });

  return transporterPromise;
}

app.post('/api/send', async (req, res) => {
  const { subject, body, recipients } = req.body;
  if (!subject || !body || !recipients) return res.status(400).json({ error: 'Missing fields' });

  const recips = Array.isArray(recipients)
    ? recipients
    : recipients.split(',').map(s => s.trim()).filter(Boolean);

  const emailDoc = new Email({ subject, body, recipients: recips, status: 'pending' });
  try {
    await emailDoc.save();
    console.log('Email saved', { id: emailDoc._id, recipients: recips.length });
  } catch (saveErr) {
    console.error('Error saving email to DB', saveErr);
  }

  try {
    const transporter = await createTransporter();
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@example.com',
      to: recips.join(','),
      subject,
      text: body,
      html: body
    });

    emailDoc.status = 'sent';
    emailDoc.info = { messageId: info.messageId, response: info.response };
    await emailDoc.save();

    const preview = nodemailer.getTestMessageUrl(info) || null;

    res.json({ success: true, id: emailDoc._id, previewUrl: preview, info: emailDoc.info });
  } catch (err) {
    console.error('Send error', err);
    emailDoc.status = 'failed';
    emailDoc.info = { error: err.message };
    await emailDoc.save();
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/emails', async (req, res) => {
  try {
    const list = await Email.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(list);
  } catch (err) {
    console.error('Error fetching emails', err);
    res.status(500).json({ error: 'DB fetch failed' });
  }
});

// Debug endpoint to inspect current mongoose connection
app.get('/api/_debug/db', (req, res) => {
  res.json({ readyState: mongoose.connection.readyState, name: mongoose.connection.name, host: mongoose.connection.host });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, mongoReadyState: mongoose.connection.readyState, db: mongoose.connection.name });
});

app.listen(PORT, ()=> console.log(`Server listening on ${PORT}`));
