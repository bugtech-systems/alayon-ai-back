const mongoose = require('mongoose');

const resourceTagSchema = new mongoose.Schema({
    resourceType: { type: String, required: true },
    name: { type: String, required: true },
    fields: [{ type: String }],
    values: [{ type: mongoose.Schema.Types.Mixed }],
    resourceParent: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('ResourceTag', resourceTagSchema);
