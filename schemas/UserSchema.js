import mongoose from 'mongoose';


const SectionSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  courseCode: { type: String, default: 'N/A' },
  semester: { type: String, default: 'N/A' },
  joinToken: { type: String, required: true, unique: true },
  joinCodeActive: { type: Boolean, default: true },
  teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] 
}, { timestamps: true });
const ProblemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
  description: { type: String, default: '' }
});

const LabSchema = new mongoose.Schema({
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  title: { type: String, required: true },
  date: { type: String, required: true },
  topic: { type: String, default: '' },
  description: { type: String, default: '' },
  status: { type: String, enum: ['Draft', 'Active'], default: 'Active' },
  problems: [ProblemSchema]
}, { timestamps: true });


const ScoreSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  labId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab', required: true },
  attendance: { type: String, enum: ['Present', 'Absent', 'N/A'], default: 'N/A' },
  submissions: [{
    problemId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: ['Solved', 'Failed', 'Unattempted'], default: 'Failed' }
  }],
  score: { type: Number, default: 0 }
}, { timestamps: true });


const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { 
    type: String, 
    enum: ['Student', 'Teacher', 'Maintance'], 
    default: 'Student' 
  },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  profilePicture: { type: String, default: "" },
  employeeId: { type: String, unique: true, sparse: true },
  password: { type: String },
  designation: { type: String, default: "" },
  department: { type: String, default: "" },
  officeAddress: { type: String, default: "" },
  officeRoom: { type: String, default: "" },
  phoneOffice: { type: String, default: "" },
  phoneNumber: { type: String, default: "" },
  details: { type: String, default: "" }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Section = mongoose.model('Section', SectionSchema);
const Lab = mongoose.model('Lab', LabSchema);
const Score = mongoose.model('Score', ScoreSchema);

export { Lab, Score, Section, User };
