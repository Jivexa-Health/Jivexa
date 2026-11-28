const express = require('express');
const router = express.Router();
const { adminListDoctors, adminVerifyDoctor } = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('ADMIN'));

router.get('/doctors', adminListDoctors);
router.patch('/doctors/:id/verify', adminVerifyDoctor);

module.exports = router;
