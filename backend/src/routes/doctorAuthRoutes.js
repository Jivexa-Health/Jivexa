const express = require('express');
const router = express.Router();
const {
  getOwnDoctorProfile,
  updateOwnDoctorProfile,
  getDoctorDashboard,
  getSharedRecordsForPatient
} = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Protected Doctor Portal Routes (uses unified /api/auth authentication, strictly DOCTOR role)
router.get('/profile', protect, authorize('DOCTOR'), getOwnDoctorProfile);
router.put('/profile', protect, authorize('DOCTOR'), updateOwnDoctorProfile);
router.get('/dashboard', protect, authorize('DOCTOR'), getDoctorDashboard);
router.get('/patients/:patientId/shared-records', protect, authorize('DOCTOR'), getSharedRecordsForPatient);

module.exports = router;
