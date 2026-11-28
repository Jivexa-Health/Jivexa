const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    },
    actorId: {
      type: String,
      required: true,
      index: true
    },
    actorRole: {
      type: String,
      default: 'PATIENT'
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    targetType: {
      type: String,
      default: ''
    },
    targetId: {
      type: String,
      default: '',
      index: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ip: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.virtual('id').get(function () {
  return this._id;
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
