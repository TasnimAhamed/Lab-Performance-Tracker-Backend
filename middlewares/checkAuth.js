import jwt from 'jsonwebtoken';

import {User}  from '../schemas/UserSchema.js';


export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalid' });
  }
};


export const authorizeTeacher = (req, res, next) => {
  if (req.user && req.user.role === 'Teacher') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Teacher role required' });
  }
};


export const authorizeAdmin = (req, res, next) => {

  if (req.user && req.user.role === 'Maintance') {
    next();
  } else {

    res.status(403).json({ 
      success: false, 
      message: "Access Denied: Only Admins can perform this action." 
    });
  }
};