import cors from 'cors';
import dns from 'dns';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
dotenv.config(); 
dns.setDefaultResultOrder('ipv4first');

import apiRoutes from './routes/api.js';
import { Section } from './schemas/UserSchema.js';

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

    // One-time database migration to fix shared sections
    try {
      const sharedSections = await Section.find({ "teacherIds.1": { $exists: true } });
      if (sharedSections.length > 0) {
        console.log(`[Migration] Found ${sharedSections.length} sections with multiple teachers. Cleaning up...`);
        for (const sec of sharedSections) {
          if (sec.teacherIds && sec.teacherIds.length > 1) {
            sec.teacherIds = [sec.teacherIds[0]];
            await sec.save();
          }
        }
        console.log('[Migration] Successfully cleaned up shared sections.');
      }
      
      // One-time migration to backfill courseName if missing
      try {
        const result = await Section.updateMany({ courseName: { $exists: false } }, { $set: { courseName: 'N/A' } });
        if (result.modifiedCount > 0) {
          console.log(`[Migration] Backfilled courseName for ${result.modifiedCount} sections.`);
        }
      } catch (migError) {
        console.error('[Migration] Error backfilling courseName:', migError);
      }

      // One-time migration to backfill sectionIds array from sectionId for legacy students
      try {
        const User = mongoose.model('User');
        const legacyStudents = await User.find({ 
          role: 'Student', 
          sectionId: { $ne: null },
          $or: [
            { sectionIds: { $exists: false } },
            { sectionIds: { $size: 0 } }
          ]
        });
        if (legacyStudents.length > 0) {
          console.log(`[Migration] Found ${legacyStudents.length} legacy students. Backfilling sectionIds...`);
          for (const s of legacyStudents) {
            s.sectionIds = [s.sectionId];
            await s.save();
          }
          console.log('[Migration] Successfully backfilled sectionIds array.');
        }
      } catch (migError) {
        console.error('[Migration] Error backfilling sectionIds array:', migError);
      }
    } catch (migError) {
      console.error('[Migration] Error running migrations:', migError);
    }

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ES Module server handling single section on port ${PORT}`));

export default app;
