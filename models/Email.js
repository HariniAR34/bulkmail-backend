const mongoose = require('mongoose');

const EmailSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  body: { type: String, required: true },
  recipients: { type: [String], required: true },
  status: { type: String, enum: ['pending','sent','failed'], default: 'pending' },
  info: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Email', EmailSchema);
