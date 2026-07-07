import express from 'express';
const router = express.Router();

// ইম্পোর্টসমূহ (সরাসরি ফাংশন ইম্পোর্ট)
import { googleLogin, getMe } from '../controllers/AuthController.js';
import { joinSectionByToken, getDashboardData, getUserProfile, updateUserProfile, loginWithCredentials } from '../controllers/UserController.js';
import * as adminController from '../controllers/AdminController.js'; // এটি ঠিক আছে যদি সব ফাংশন AdminController থেকে আসে
import * as maintanceController from '../controllers/MaintanceController.js'; 
import { protect, authorizeTeacher, authorizeAdmin } from '../middlewares/checkAuth.js';


router.post('/auth/google', googleLogin);
router.post('/auth/login-local', loginWithCredentials);
router.get('/auth/me', protect, getMe);


router.post('/user/join', protect, joinSectionByToken);
router.get('/user/dashboard', protect, getDashboardData);
router.get('/user/profile', protect, getUserProfile);
router.put('/user/profile', protect, updateUserProfile);


router.get('/admin/sections', protect, authorizeTeacher, adminController.getTeacherSections);
router.post('/admin/sections', protect, authorizeTeacher, adminController.createSection);
router.put('/admin/sections/:id', protect, authorizeTeacher, adminController.updateSection);
router.delete('/admin/sections/:id', protect, authorizeTeacher, adminController.deleteSection);

router.get('/admin/overview', protect, authorizeTeacher, adminController.getGradesAndUsers);
router.post('/admin/labs', protect, authorizeTeacher, adminController.addTodayLab);
router.put('/admin/labs/:id', protect, authorizeTeacher, adminController.updateLabDay);
router.delete('/admin/labs/:id', protect, authorizeTeacher, adminController.deleteLabDay);
router.post('/admin/labs/:labId/problems', protect, authorizeTeacher, adminController.addProblemToLab);
router.put('/admin/labs/:labId/problems/:problemId', protect, authorizeTeacher, adminController.updateProblemInLab);
router.delete('/admin/labs/:labId/problems/:problemId', protect, authorizeTeacher, adminController.deleteProblemFromLab);
router.put('/admin/labs/:labId/submissions', protect, authorizeTeacher, adminController.updateSubmissionStatus);
router.put('/admin/labs/:labId/attendance', protect, authorizeTeacher, adminController.updateAttendance);
router.put('/admin/students/:studentId/marks', protect, authorizeTeacher, adminController.updateStudentMarks);
router.delete('/admin/users/:id', protect, authorizeTeacher, adminController.removeUser);
router.post('/admin/token/regenerate', protect, authorizeTeacher, adminController.regenerateJoinToken);
router.post('/admin/danger/clear', protect, authorizeTeacher, adminController.clearSection);


router.get('/users', protect, authorizeAdmin, maintanceController.getAllUsers);
router.patch('/users/:id/role', protect, authorizeAdmin, maintanceController.updateUserRole);
router.delete('/users/:id', protect, authorizeAdmin, maintanceController.deleteUser);
router.post('/reset-all', protect, authorizeAdmin, maintanceController.resetAllSystem);

export default router;