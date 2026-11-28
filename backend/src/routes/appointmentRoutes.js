const express = require('express');
const router = express.Router();
const {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  updateAppointmentConsent
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All appointment routes require authentication
router.use(protect);

router.post('/', createAppointment);
router.get('/', getAppointments);
router.get('/:id', getAppointmentById);
router.patch('/:id', updateAppointment);
router.patch('/:id/status', updateAppointment);
router.patch('/:id/consent', authorize('PATIENT'), updateAppointmentConsent);
router.delete('/:id', deleteAppointment);

module.exports = router;
