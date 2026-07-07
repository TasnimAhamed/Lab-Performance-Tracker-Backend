import cors from 'cors';
import dns from 'dns';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
dotenv.config(); 
dns.setDefaultResultOrder('ipv4first');

import apiRoutes from './routes/api.js';

const app = express();


const allowedOrigins = [
  "http://localhost:5173",
  "https://lab-performance-tracker.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  res.setHeader(
    "Cross-Origin-Opener-Policy",
    "same-origin-allow-popups"
  );
  next();
});

app.use(express.json({ limit: '10mb' }));


app.use(async (req, res, next) => {
  if (mongoose.connection.readyState >= 1) {
    return next();
  }
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI environment variable is missing.");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected securely.');
    next();
  } catch (err) {
    console.error('Database connection error in middleware:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Database connection failed', 
      error: err.message 
    });
  }
});

app.use('/api/v1', apiRoutes);

// const PORT = process.env.PORT || 8080;
// app.listen(PORT, () => console.log(`ES Module server handling single section on port ${PORT}`));

export default app;
