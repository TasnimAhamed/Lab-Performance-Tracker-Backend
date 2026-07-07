import { Lab, Score, Section, User } from "../schemas/UserSchema.js";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';


export const joinSectionByToken = async (req, res) => {
  const { joinToken } = req.body;

  try {
    const section = await Section.findOne({ joinToken });
    if (!section) {
      return res.status(400).json({ success: false, message: 'Invalid join token' });
    }

    if (section.joinCodeActive === false) {
      return res.status(400).json({ success: false, message: 'This join code is currently disabled. Please contact your teacher.' });
    }

    const student = await User.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Initialize sectionIds if it doesn't exist
    if (!student.sectionIds) {
      student.sectionIds = [];
    }

    // Check if he already joined or not
    const alreadyJoined = student.sectionIds.some(
      id => id.toString() === section._id.toString()
    );
    if (alreadyJoined) {
      return res.status(400).json({ success: false, message: 'You have already joined this section.' });
    }

    student.sectionIds.push(section._id);
    // Backward compatibility: set sectionId as the latest joined section
    student.sectionId = section._id;

    await student.save();

    const sectionLabs = await Lab.find({ sectionId: section._id });
    for (const lab of sectionLabs) {
      const submissions = lab.problems.map(prob => ({
        problemId: prob._id,
        status: 'Failed'
      }));
      await Score.findOneAndUpdate(
        { studentId: student._id, labId: lab._id },
        { 
          $setOnInsert: { 
            attendance: 'N/A', 
            submissions 
          }, 
          $set: { score: 0 } 
        },
        { upsert: true }
      );
    }

    res.status(200).json({ success: true, message: 'Successfully joined section' });
  } catch (error) {
    console.error("Join section error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const leaveSection = async (req, res) => {
  const { sectionId } = req.body;

  try {
    const student = await User.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!student.sectionIds || student.sectionIds.length === 0) {
      return res.status(400).json({ success: false, message: 'You are not enrolled in this section.' });
    }

    // Pull from sectionIds array
    student.sectionIds = student.sectionIds.filter(
      id => id.toString() !== sectionId
    );

    // If active sectionId was this one, update it to the next available or null
    if (student.sectionId && student.sectionId.toString() === sectionId) {
      student.sectionId = student.sectionIds.length > 0 ? student.sectionIds[0] : null;
    }

    await student.save();

    // Delete student scores for labs belonging to this section
    const sectionLabs = await Lab.find({ sectionId });
    const labIds = sectionLabs.map(l => l._id);
    await Score.deleteMany({ studentId: student._id, labId: { $in: labIds } });

    res.status(200).json({ success: true, message: 'Successfully left section' });
  } catch (error) {
    console.error("Leave section error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getDashboardData = async (req, res) => {
  try {
    const { sectionId } = req.query;
    const student = await User.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const activeSectionId = sectionId || student.sectionId;

    if (!activeSectionId) {
      return res.status(200).json({
        success: true,
        result: { user: student } 
      });
    }

    // Verify enrollment
    const isEnrolled = student.sectionIds && student.sectionIds.some(
      id => id.toString() === activeSectionId.toString()
    );
    if (!isEnrolled && student.sectionId?.toString() !== activeSectionId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized or not enrolled in this section" });
    }

    const labsList = await Lab.find({ sectionId: activeSectionId });
    const userScores = await Score.find({ studentId: student._id });

    const user_labs = labsList.map(lab => {
      const scoreObj = userScores.find(s => s.labId.toString() === lab._id.toString());
      const totalProblems = lab.problems?.length || 0;
      const solvedProblems = scoreObj?.submissions?.filter(sub => sub.status === 'Solved').length || 0;
      return {
        lab: lab,          
        solved: solvedProblems,
        totalProblems: totalProblems,
        attendance: scoreObj?.attendance || 'N/A',
        score: scoreObj ? scoreObj.score : 0
      };
    });

    const totalSolved = userScores.filter(s => 
      labsList.some(lab => lab._id.toString() === s.labId.toString())
    ).reduce((sum, s) => sum + s.score, 0);

    const totalPossibleProblems = labsList.reduce((sum, l) => sum + (l.problems?.length || l.totalProblems || 0), 0);

    const allStudents = await User.find({ sectionIds: activeSectionId });
    const allScores = await Score.find({
      studentId: { $in: allStudents.map(s => s._id) }
    });

    const leaderboard = allStudents
      .filter(s => s.role === 'Student')
      .map(s => {
        const studentSectionScores = allScores.filter(
          score => score.studentId.toString() === s._id.toString() &&
          labsList.some(lab => lab._id.toString() === score.labId.toString())
        );
        const sTotal = studentSectionScores.reduce((sum, sc) => sum + sc.score, 0);
        return {
          userId: { _id: s._id, name: s.name },
          solved_problems: sTotal
        };
      }).sort((a, b) => b.solved_problems - a.solved_problems);

    res.status(200).json({
      success: true,
      result: {
        user: student,
        user_labs,
        all_students_profile_in_this_section: leaderboard,
        total_problems: totalPossibleProblems,
        solved_problems: totalSolved
      }
    });
  } catch (error) {
    console.error("Dashboard data error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .populate('sectionId', 'name description')
      .populate({
        path: 'sectionIds',
        populate: { path: 'teacherIds', select: 'name email' }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const hasPassword = !!user.password;
    const userObj = user.toObject();
    delete userObj.password;

    res.status(200).json({
      success: true,
      user: {
        ...userObj,
        hasPassword
      }
    });
  } catch (error) {
    console.error("Profile Fetch Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching profile"
    });
  }
};

export const updateUserProfile = async (req, res) => {
  const { 
    name, 
    profilePicture, 
    employeeId, 
    currentPassword,
    password, 
    designation, 
    department, 
    officeAddress, 
    officeRoom, 
    phoneOffice, 
    phoneNumber, 
    details 
  } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
    
    if (employeeId !== undefined) {
      user.employeeId = employeeId;
    }

    if (password) {
      const idToCheck = employeeId || user.employeeId;
      if (!idToCheck || idToCheck.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          message: 'You must set an Employee ID / Student ID before setting a password.' 
        });
      }

      if (user.password) {
        if (!currentPassword) {
          return res.status(400).json({ 
            success: false, 
            message: 'Current password is required to change password.' 
          });
        }
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
          return res.status(400).json({ 
            success: false, 
            message: 'Incorrect current password.' 
          });
        }
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    if (designation !== undefined) user.designation = designation;
    if (department !== undefined) user.department = department;
    if (officeAddress !== undefined) user.officeAddress = officeAddress;
    if (officeRoom !== undefined) user.officeRoom = officeRoom;
    if (phoneOffice !== undefined) user.phoneOffice = phoneOffice;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (details !== undefined) user.details = details;

    await user.save();

    const userObj = user.toObject();
    delete userObj.password;

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        ...userObj,
        hasPassword: true
      }
    });
  } catch (error) {
    console.error("Profile update error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'This Employee ID / Student ID is already in use by another user.' 
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const loginWithCredentials = async (req, res) => {
  const { employeeId, password } = req.body;

  if (!employeeId || !password) {
    return res.status(400).json({ success: false, message: 'ID and Password are required' });
  }

  try {
    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this ID' });
    }

    if (!user.password) {
      return res.status(400).json({ 
        success: false, 
        message: 'No password configured for this account. Please sign in with Google first and configure a password.' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid ID or Password' });
    }

    const token = jwt.sign(
      { id: user._id }, 
      process.env.JWT_SECRET || 'secret-key-fallback-12345', 
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        sectionId: user.sectionId 
      }
    });
  } catch (error) {
    console.error("Local login error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAvailableSections = async (req, res) => {
  try {
    const sections = await Section.find({}).populate('teacherIds', 'name email');
    res.status(200).json({ success: true, sections });
  } catch (error) {
    console.error("Get available sections error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};