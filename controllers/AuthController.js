import jwt from 'jsonwebtoken';
import axios from 'axios';
import { User } from '../schemas/UserSchema.js'; 

export const googleLogin = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Token is missing' });
  }

  try {
    const googleRes = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${idToken}`);
    const { sub: googleId, name, email } = googleRes.data;

    if (!googleId) {
      return res.status(400).json({ success: false, message: 'Invalid Google token' });
    }

    let user = await User.findOne({ googleId });

    if (!user) {
      const userCount = await User.countDocuments({});
      const isFirstUser = userCount === 0;

      user = await User.create({
        googleId,
        name,
        email,
        role: isFirstUser ? 'Maintance' : 'Student',
        sectionId: null 
      });
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
    res.status(500).json({ 
      success: false, 
      message: 'Google login failed', 
      debug: error.message 
    });
  }
};
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('sectionId');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};