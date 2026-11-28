const express = require('express');
const router = express.Router();
const {
  listApprovedDoctors,
  getNearbyDoctors,
  getApprovedDoctorById,
  getDoctorSlotsForDate
} = require('../controllers/doctorController');

// Public / Patient-facing verified doctor directory endpoints
router.get('/nearby', getNearbyDoctors);
router.get('/', listApprovedDoctors);
router.get('/:id', getApprovedDoctorById);
router.get('/:id/slots', getDoctorSlotsForDate);

module.exports = router;
