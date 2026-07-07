import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import dns from 'dns';
dotenv.config(); 
dns.setDefaultResultOrder('ipv4first');

import apiRoutes from './routes/api.js'; 

const app = express();


const allowedOrigins = [
  "http://localhost:5173",
  "https://diulab.vercel.app",
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
app.use(express.json({ limit: '10mb' }));


app.use('/api/v1', apiRoutes);


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected securely (No separate Section Schema).'))
  .catch((err) => console.error('Database connection error:', err));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ES Module server handling single section on port ${PORT}`));

export default app;
