const mongoose = require('mongoose');

const touchpointSchema = new mongoose.Schema({
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResourceTag', required: true },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Touchpoint', touchpointSchema);
