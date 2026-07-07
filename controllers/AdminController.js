import crypto from 'crypto';
import { User, Section, Lab, Score } from "../schemas/UserSchema.js";


export const getGradesAndUsers = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    const { sectionId } = req.query;
    let section;
    if (sectionId) {
      section = await Section.findOne({ _id: sectionId, teacherIds: teacher._id });
    } else {
      section = await Section.findOne({ teacherIds: teacher._id });
    }

    // If no section is found and no specific sectionId is requested, don't auto-create one.
    if (!section) {
      return res.status(200).json({
        success: true,
        joinToken: "",
        labs: [],
        users: [],
        section: null
      });
    }

    const labs = await Lab.find({ sectionId: section._id });
    const students = await User.find({ sectionIds: section._id, role: 'Student' });

    const studentIds = students.map(s => s._id);

    // Auto-create/sync Score records if missing for any student & lab
    for (const studentId of studentIds) {
      for (const lab of labs) {
        let scoreDoc = await Score.findOne({ studentId, labId: lab._id });
        if (!scoreDoc) {
          const submissions = lab.problems.map(prob => ({
            problemId: prob._id,
            status: 'Failed'
          }));
          await Score.create({
            studentId,
            labId: lab._id,
            attendance: 'N/A',
            submissions,
            score: 0
          });
        } else {
          let changed = false;
          // Sync new problems
          lab.problems.forEach(prob => {
            const exists = scoreDoc.submissions.some(sub => sub.problemId.toString() === prob._id.toString());
            if (!exists) {
              scoreDoc.submissions.push({ problemId: prob._id, status: 'Failed' });
              changed = true;
            }
          });
          // Remove deleted problems
          const problemIdsStr = lab.problems.map(prob => prob._id.toString());
          const cleanSubmissions = scoreDoc.submissions.filter(sub => problemIdsStr.includes(sub.problemId.toString()));
          if (cleanSubmissions.length !== scoreDoc.submissions.length) {
            scoreDoc.submissions = cleanSubmissions;
            changed = true;
          }
          if (changed) {
            const solvedCount = scoreDoc.submissions.filter(sub => sub.status === 'Solved').length;
            scoreDoc.score = solvedCount * 1;
            await scoreDoc.save();
          }
        }
      }
    }

    const labIds = labs.map(l => l._id);
    const allScores = await Score.find({ 
      studentId: { $in: studentIds },
      labId: { $in: labIds }
    });

    const scoresMap = {};
    allScores.forEach(score => {
      if (!scoresMap[score.studentId]) scoresMap[score.studentId] = {};
      scoresMap[score.studentId][score.labId.toString()] = score.score;
    });

    const studentsWithScores = students.map(s => ({
      ...s.toObject(),
      scores: scoresMap[s._id] || {}
    }));

    res.status(200).json({
      success: true,
      joinToken: section.joinToken,
      labs,
      users: studentsWithScores,
      scores: allScores, // Return raw scores for submission/attendance access
      section
    });

  } catch (error) {
    console.error("Error in getGradesAndUsers:", error);
    res.status(500).json({ success: false, message: "Server Error: " + error.message });
  }
};


export const addTodayLab = async (req, res) => {
  const { title, date, topic, description, status, sectionId } = req.body; 

  try {
    const teacher = await User.findById(req.user.id);
    let section;
    if (sectionId) {
      section = await Section.findOne({ _id: sectionId, teacherIds: teacher._id });
    } else {
      section = await Section.findOne({ teacherIds: teacher._id });
    }

    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }

    const newLab = await Lab.create({
      sectionId: section._id,
      title,
      date,
      topic: topic || "",
      description: description || "",
      status: status || "Active",
      problems: []
    });

    const students = await User.find({ sectionIds: section._id, role: 'Student' });

    for (let student of students) {
      await Score.create({
        studentId: student._id,
        labId: newLab._id,
        attendance: 'N/A',
        submissions: [],
        score: 0
      });
    }

    res.status(201).json({
      success: true,
      message: 'Lab Day created successfully',
      lab: newLab
    });
  } catch (error) {
    console.error("Error in addTodayLab:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const updateStudentMarks = async (req, res) => {
  const { studentId } = req.params;
  const { updatedScores } = req.body; 

  try {

    for (const [labId, scoreValue] of Object.entries(updatedScores)) {
      await Score.findOneAndUpdate(
        { studentId, labId },
        { score: scoreValue },
        { upsert: true, new: true }
      );
    }
    res.status(200).json({ success: true, message: 'Scores updated successfully' });
  } catch (error) {
    console.error("Error in updateStudentMarks:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const removeUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { sectionId } = req.query;

    if (!sectionId) {
      return res.status(400).json({ success: false, message: "sectionId query parameter is required" });
    }

    const student = await User.findById(userId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Remove sectionId from user's sectionIds
    student.sectionIds = (student.sectionIds || []).filter(id => id.toString() !== sectionId.toString());
    await student.save();

    // Find all labs of the section
    const labs = await Lab.find({ sectionId });
    const labIds = labs.map(l => l._id);

    // Delete scores for this section's labs
    await Score.deleteMany({ studentId: userId, labId: { $in: labIds } });

    res.status(200).json({ success: true, message: 'Student and their scores removed from this section successfully' });
  } catch (error) {
    console.error("Error in removeUser:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const regenerateJoinToken = async (req, res) => {
  const { sectionId } = req.body;
  try {
    const teacher = await User.findById(req.user.id);
    let section;
    if (sectionId) {
      section = await Section.findOne({ _id: sectionId, teacherIds: teacher._id });
    } else {
      section = await Section.findOne({ teacherIds: teacher._id });
    }

    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }

    section.joinToken = `CSE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await section.save();

    res.status(200).json({ success: true, joinToken: section.joinToken });
  } catch (error) {
    console.error("Error in regenerateJoinToken:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const clearSection = async (req, res) => {
  const { sectionId } = req.body;
  try {
    const teacher = await User.findById(req.user.id);
    let section;
    if (sectionId) {
      section = await Section.findOne({ _id: sectionId, teacherIds: teacher._id });
    } else {
      section = await Section.findOne({ teacherIds: teacher._id });
    }

    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }

   
    const labIds = await Lab.find({ sectionId: section._id }).distinct('_id');
  
    await Score.deleteMany({ labId: { $in: labIds } });

    await Lab.deleteMany({ sectionId: section._id });
  
    await User.updateMany(
      { sectionIds: section._id, role: 'Student' },
      { 
        $pull: { sectionIds: section._id },
        $set: { sectionId: null }
      }
    );

    res.status(200).json({ success: true, message: 'All labs and scores for this section cleared' });
  } catch (error) {
    console.error("Error in clearSection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTeacherSections = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    const sections = await Section.find({ teacherIds: teacher._id }).sort({ createdAt: -1 });

    // Compute stats
    const totalSections = sections.length;
    const sectionIds = sections.map(s => s._id);

    const totalStudents = await User.countDocuments({
      role: 'Student',
      sectionIds: { $in: sectionIds }
    });

    const labs = await Lab.find({ sectionId: { $in: sectionIds } });
    const totalLabs = labs.length;
    const totalProblems = labs.reduce((sum, lab) => sum + (lab.totalProblems || 0), 0);

    // Compute student count for each section
    const sectionsWithCount = await Promise.all(sections.map(async (sec) => {
      const studentCount = await User.countDocuments({ role: 'Student', sectionIds: sec._id });
      return {
        ...sec.toObject(),
        studentCount
      };
    }));

    res.status(200).json({
      success: true,
      stats: {
        totalSections,
        totalStudents,
        totalLabs,
        totalProblems
      },
      sections: sectionsWithCount
    });
  } catch (error) {
    console.error("Error in getTeacherSections:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createSection = async (req, res) => {
  const { name, courseCode, courseName, semester, joinToken } = req.body;

  try {
    const teacher = await User.findById(req.user.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    if (!name || !courseCode || !semester) {
      return res.status(400).json({ success: false, message: "Name, Course Code, and Semester are required." });
    }

    // Check duplicate courseCode + name + semester for this teacher
    const duplicateSection = await Section.findOne({
      courseCode: courseCode.trim(),
      name: name.trim(),
      semester: semester.trim(),
      teacherIds: teacher._id
    });
    if (duplicateSection) {
      return res.status(400).json({
        success: false,
        message: "You have already created a section with this Course Code, Section Name, and Semester."
      });
    }

    let token = joinToken;
    if (!token) {
      token = `CSE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    const existingSection = await Section.findOne({ joinToken: token });
    if (existingSection) {
      return res.status(400).json({ success: false, message: "Join code already exists. Please choose a different one." });
    }

    const newSection = await Section.create({
      name,
      courseCode,
      courseName: courseName || 'N/A',
      semester,
      joinToken: token,
      teacherIds: [teacher._id]
    });

    res.status(201).json({ success: true, section: newSection });
  } catch (error) {
    console.error("Error in createSection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSection = async (req, res) => {
  const { id } = req.params;
  const { name, courseCode, courseName, semester, joinToken } = req.body;

  try {
    const teacher = await User.findById(req.user.id);
    const section = await Section.findOne({ _id: id, teacherIds: teacher._id });
    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found or unauthorized." });
    }

    // Check duplicate courseCode + name + semester if being changed
    if (name || courseCode || semester) {
      const checkName = name || section.name;
      const checkCode = courseCode || section.courseCode;
      const checkSemester = semester || section.semester;

      const duplicateSection = await Section.findOne({
        _id: { $ne: id },
        courseCode: checkCode.trim(),
        name: checkName.trim(),
        semester: checkSemester.trim(),
        teacherIds: teacher._id
      });
      if (duplicateSection) {
        return res.status(400).json({
          success: false,
          message: "A section with this Course Code, Section Name, and Semester already exists for you."
        });
      }
    }

    if (joinToken && joinToken !== section.joinToken) {
      const existingSection = await Section.findOne({ joinToken });
      if (existingSection) {
        return res.status(400).json({ success: false, message: "Join code already exists." });
      }
      section.joinToken = joinToken;
    }

    if (name) section.name = name;
    if (courseCode) section.courseCode = courseCode;
    if (courseName) section.courseName = courseName;
    if (semester) section.semester = semester;
    if (req.body.joinCodeActive !== undefined) section.joinCodeActive = req.body.joinCodeActive;

    await section.save();
    res.status(200).json({ success: true, section });
  } catch (error) {
    console.error("Error in updateSection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteSection = async (req, res) => {
  const { id } = req.params;

  try {
    const teacher = await User.findById(req.user.id);
    const section = await Section.findOne({ _id: id, teacherIds: teacher._id });
    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found or unauthorized." });
    }

    const labsList = await Lab.find({ sectionId: id });
    const labIds = labsList.map(l => l._id);

    await Score.deleteMany({ labId: { $in: labIds } });
    await Lab.deleteMany({ sectionId: id });
    await User.updateMany(
      { $or: [{ sectionIds: id }, { sectionId: id }] },
      { 
        $pull: { sectionIds: id },
        $unset: { sectionId: "" } 
      }
    );
    await section.deleteOne();

    res.status(200).json({ success: true, message: "Section deleted successfully" });
  } catch (error) {
    console.error("Error in deleteSection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLabDay = async (req, res) => {
  const { id } = req.params;
  const { title, date, topic, description, status } = req.body;

  try {
    const teacher = await User.findById(req.user.id);
    const lab = await Lab.findById(id);
    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab Day not found" });
    }

    const section = await Section.findOne({ _id: lab.sectionId, teacherIds: teacher._id });
    if (!section) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    if (title !== undefined) lab.title = title;
    if (date !== undefined) lab.date = date;
    if (topic !== undefined) lab.topic = topic;
    if (description !== undefined) lab.description = description;
    if (status !== undefined) lab.status = status;

    await lab.save();
    res.status(200).json({ success: true, message: "Lab Day updated successfully", lab });
  } catch (error) {
    console.error("Error in updateLabDay:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteLabDay = async (req, res) => {
  const { id } = req.params;

  try {
    const teacher = await User.findById(req.user.id);
    const lab = await Lab.findById(id);
    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab Day not found" });
    }

    const section = await Section.findOne({ _id: lab.sectionId, teacherIds: teacher._id });
    if (!section) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    await Score.deleteMany({ labId: id });
    await lab.deleteOne();

    res.status(200).json({ success: true, message: "Lab Day deleted successfully" });
  } catch (error) {
    console.error("Error in deleteLabDay:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addProblemToLab = async (req, res) => {
  const { labId } = req.params;
  const { title, difficulty, description } = req.body;

  try {
    const teacher = await User.findById(req.user.id);
    const lab = await Lab.findById(labId);
    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab Day not found" });
    }

    const section = await Section.findOne({ _id: lab.sectionId, teacherIds: teacher._id });
    if (!section) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    if (!title || !difficulty) {
      return res.status(400).json({ success: false, message: "Title and Difficulty are required" });
    }

    lab.problems.push({ title, difficulty, description: description || "" });
    await lab.save();

    const newProblem = lab.problems[lab.problems.length - 1];

    // Sync score documents for all students by adding this problem
    await Score.updateMany(
      { labId },
      { $push: { submissions: { problemId: newProblem._id, status: 'Failed' } } }
    );

    res.status(201).json({ success: true, message: "Problem added successfully", problem: newProblem });
  } catch (error) {
    console.error("Error in addProblemToLab:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProblemInLab = async (req, res) => {
  const { labId, problemId } = req.params;
  const { title, difficulty, description } = req.body;

  try {
    const teacher = await User.findById(req.user.id);
    const lab = await Lab.findById(labId);
    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab Day not found" });
    }

    const section = await Section.findOne({ _id: lab.sectionId, teacherIds: teacher._id });
    if (!section) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    const problem = lab.problems.id(problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: "Problem not found" });
    }

    if (title !== undefined) problem.title = title;
    if (difficulty !== undefined) problem.difficulty = difficulty;
    if (description !== undefined) problem.description = description;

    await lab.save();
    res.status(200).json({ success: true, message: "Problem updated successfully", problem });
  } catch (error) {
    console.error("Error in updateProblemInLab:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteProblemFromLab = async (req, res) => {
  const { labId, problemId } = req.params;

  try {
    const teacher = await User.findById(req.user.id);
    const lab = await Lab.findById(labId);
    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab Day not found" });
    }

    const section = await Section.findOne({ _id: lab.sectionId, teacherIds: teacher._id });
    if (!section) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    const problem = lab.problems.id(problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: "Problem not found" });
    }

    lab.problems.pull(problemId);
    await lab.save();

    // Remove corresponding submissions in Score documents and recalculate score
    const scores = await Score.find({ labId });
    for (let scoreDoc of scores) {
      scoreDoc.submissions = scoreDoc.submissions.filter(sub => sub.problemId.toString() !== problemId);
      const solvedCount = scoreDoc.submissions.filter(sub => sub.status === 'Solved').length;
      scoreDoc.score = solvedCount * 1;
      await scoreDoc.save();
    }

    res.status(200).json({ success: true, message: "Problem deleted successfully" });
  } catch (error) {
    console.error("Error in deleteProblemFromLab:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSubmissionStatus = async (req, res) => {
  const { labId } = req.params;
  const { studentId, problemId, status } = req.body;

  try {
    const teacher = await User.findById(req.user.id);
    const lab = await Lab.findById(labId);
    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab Day not found" });
    }

    const section = await Section.findOne({ _id: lab.sectionId, teacherIds: teacher._id });
    if (!section) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    let scoreDoc = await Score.findOne({ studentId, labId });
    if (!scoreDoc) {
      scoreDoc = await Score.create({
        studentId,
        labId,
        attendance: 'N/A',
        submissions: []
      });
    }

    let subEntry = scoreDoc.submissions.find(sub => sub.problemId.toString() === problemId);
    if (!subEntry) {
      scoreDoc.submissions.push({ problemId, status });
    } else {
      subEntry.status = status;
    }

    const solvedCount = scoreDoc.submissions.filter(sub => sub.status === 'Solved').length;
    scoreDoc.score = solvedCount * 1;

    await scoreDoc.save();
    res.status(200).json({ success: true, message: "Status updated successfully", scoreDoc });
  } catch (error) {
    console.error("Error in updateSubmissionStatus:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAttendance = async (req, res) => {
  const { labId } = req.params;
  const { attendanceList } = req.body; // array of { studentId, attendance }

  try {
    const teacher = await User.findById(req.user.id);
    const lab = await Lab.findById(labId);
    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab Day not found" });
    }

    const section = await Section.findOne({ _id: lab.sectionId, teacherIds: teacher._id });
    if (!section) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    if (!Array.isArray(attendanceList)) {
      return res.status(400).json({ success: false, message: "attendanceList must be an array" });
    }

    for (const item of attendanceList) {
      const { studentId, attendance } = item;
      await Score.findOneAndUpdate(
        { studentId, labId },
        { $set: { attendance } },
        { upsert: true }
      );
    }

    res.status(200).json({ success: true, message: "Attendance updated successfully" });
  } catch (error) {
    console.error("Error in updateAttendance:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};