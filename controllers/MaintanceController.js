import { User, Section, Lab, Score } from "../schemas/UserSchema.js"; 


export const getAllUsers = async (req, res) => {
  try {
 
    const users = await User.find().populate('sectionId', 'name'); 
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body; 

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // যদি রোল ইতিমধ্যে একই হয়, তাহলে কোনো পরিবর্তন নয়
    if (user.role === role) {
      return res.status(200).json({
        success: true,
        message: `User already has role ${role}`,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          sectionId: user.sectionId
        }
      });
    }

    // ---- টিচার বানানো ----
    if (role === 'Teacher') {
      user.role = 'Teacher';   // ✅ ঠিক করা হয়েছে
      user.sectionId = null;

      // স্টুডেন্ট থাকাকালীন স্কোর মুছে ফেলুন (টিচারের স্কোর দরকার নেই)
      await Score.deleteMany({ studentId: user._id });

      await user.save();
      console.log(`✅ User ${user.name} promoted to Teacher`);
    }
    // ---- স্টুডেন্ট বানানো ----
    else if (role === 'Student') {
      user.role = 'Student';   // ✅ ঠিক করা হয়েছে

      // যদি আগে কোনো সেকশনের টিচার ছিলেন, তবে সেখান থেকে সরান
      await Section.updateMany(
        { teacherIds: user._id },
        { $pull: { teacherIds: user._id } }
      );

      // সেকশন থেকে বের করে দিন (জয়েন টোকেন দিয়ে আবার জয়েন করতে হবে)
      user.sectionId = null;

      // পুরোনো স্কোর ডিলিট করুন (নতুন সেকশনে জয়েন করলে নতুন স্কোর পাবেন)
      await Score.deleteMany({ studentId: user._id });

      await user.save();
      console.log(`✅ User ${user.name} demoted to Student and removed from sections.`);
    }
    // ---- অন্যান্য রোল (যেমন Maintance) ----
    else {
      user.role = role;
      await user.save();
    }

    // সফল রেসপন্স
    res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        sectionId: user.sectionId
      }
    });

  } catch (error) {
    console.error("Role update error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await Score.deleteMany({ studentId: userId });


    await user.deleteOne();
    
    res.status(200).json({ success: true, message: 'User and their scores deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const resetAllSystem = async (req, res) => {
  try {

    await User.deleteMany({ role: { $ne: 'Maintance' } }); 
    await Section.deleteMany({});
    await Lab.deleteMany({});
    await Score.deleteMany({});

    res.status(200).json({ success: true, message: 'System reset: All Users (except Maintance), Sections, Labs, and Scores have been wiped.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};