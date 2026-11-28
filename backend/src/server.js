const config = require('./config/env');
config.validateEnv();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const { connectDB, isMongoConfigured, checkDatabaseHealth, isDatabaseConnected } = require('./config/db');
const { MongoDb } = require('./services/mongoDbService');

const app = express();

// Trust proxy for secure cookies behind reverse proxies (Render, Cloudflare, Vercel, etc.)
app.set('trust proxy', 1);

// Configure CORS for Cookie & Authorization header transmission across trusted JIVEXA origins
const configuredCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const ALLOWED_EXACT_ORIGINS = new Set([
  config.server.frontendUrl.replace(/\/$/, ''),
  'https://jivexa-mvp.vercel.app',
  'https://frontend-beryl-two-18.vercel.app',
  'https://jivexa.in',
  'https://www.jivexa.in',
  ...configuredCorsOrigins
].filter(Boolean));

const isAllowedCorsOrigin = (origin) => {
  if (!origin) return true; // Non-browser clients, health probes, and local server tests
  const cleanOrigin = origin.replace(/\/$/, '');
  if (ALLOWED_EXACT_ORIGINS.has(cleanOrigin)) return true;
  if (/^https:\/\/(?:jivexa|frontend)[a-z0-9-]*\.vercel\.app$/i.test(cleanOrigin)) return true;
  if (/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?$/i.test(cleanOrigin)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    callback(null, isAllowedCorsOrigin(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Cookie',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Accept-Language',
    'Range'
  ],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Handle JSON syntax parsing errors safely
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload', message: err.message });
  }
  next(err);
});

app.use(cookieParser());

// Database connection guard middleware for auth endpoints
const requireDbConnection = (req, res, next) => {
  if (!isDatabaseConnected() && (!MongoDb || !MongoDb.isAvailable || !MongoDb.isAvailable())) {
    return res.status(503).json({
      success: false,
      error: 'Database is not connected',
      message: 'Database service is currently unavailable. Please ensure MongoDB is connected.'
    });
  }
  next();
};

// Auth, Clinical, Doctor, Admin, Pharmacy, Ambulance & AI API Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', requireDbConnection, authRoutes);
app.use('/user', requireDbConnection, authRoutes);
app.use('/api/doctors', requireDbConnection, require('./routes/doctorRoutes'));
app.use('/api/doctor', requireDbConnection, require('./routes/doctorAuthRoutes'));
app.use('/api/admin', requireDbConnection, require('./routes/adminRoutes'));
app.use('/api/health-id', require('./routes/healthIdRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/prescriptions', require('./routes/prescriptionRoutes'));
app.use('/api/pharmacy', require('./routes/pharmacyRoutes'));
app.use('/api/ambulance', require('./routes/ambulanceRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// System Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const isMongo = isMongoConfigured();
  let dbStatus = { configured: isMongo, connected: false };
  try {
    dbStatus = await checkDatabaseHealth();
  } catch (e) {
    dbStatus = { configured: isMongo, connected: false, error: e.message };
  }

  const isConnected = Boolean(dbStatus.connected);
  const isResilientReady = Boolean(MongoDb && MongoDb.isAvailable && MongoDb.isAvailable());

  res.json({
    status: isConnected ? 'OK' : (isResilientReady ? 'STANDBY' : 'DEGRADED'),
    service: 'JIVEXA Health OS Backend Service',
    database: isConnected ? 'MongoDB Atlas' : (isResilientReady ? 'MongoDB Atlas (Standby / Local Resilient Mode)' : 'MongoDB Atlas (Unreachable)'),
    activeDatabase: isConnected
      ? 'MongoDB Atlas'
      : (isResilientReady ? 'Local Resilient Storage (Atlas Standby)' : 'DISCONNECTED'),
    authProvider: 'Native JWT / MongoDB Auth',
    otp: {
      enabled: config.auth.otpEnabled,
      status: config.auth.otpEnabled ? 'ACTIVE' : 'TEMPORARILY_DISABLED_FOR_LAUNCH'
    },
    mvpMode: {
      patientMvpOnly: config.auth.patientMvpOnly,
      mode: 'PATIENT_AND_DOCTOR_MVP',
      activeModules: [
        'PATIENT_SIGNUP',
        'PATIENT_LOGIN',
        'EMAIL_VERIFICATION',
        'PATIENT_DASHBOARD',
        'PATIENT_PROFILE',
        'FIND_DOCTOR',
        'APPOINTMENT_BOOKING',
        'AI_HEALTH_REPORT_ANALYZER',
        'AI_HEALTH_CHATBOT',
        'HEALTH_RECORDS',
        'HEALTH_ID',
        'DOCTOR_PORTAL',
        'DOCTOR_DASHBOARD',
        'DOCTOR_APPOINTMENT_MANAGEMENT'
      ],
      upcomingModules: [
        { name: 'Pharmacy & Medicine Delivery', version: 'V3', status: 'COMING_SOON' },
        { name: 'Ambulance Partner Emergency Fleet', version: 'V4', status: 'COMING_SOON' },
        { name: 'Hospital & Healthcare Ecosystem Admin', version: 'V5', status: 'COMING_SOON' }
      ]
    },
    mongodb: dbStatus,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'JIVEXA Health OS Backend Service',
    database: 'MongoDB Atlas',
    timestamp: new Date().toISOString()
  });
});

// Global catch-all Express error handler
app.use((err, req, res, next) => {
  console.warn('[Server] Express error caught safely:', err.message);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Process safety guards to prevent unhandled EventEmitter or rejection crashes
process.on('unhandledRejection', (reason) => {
  console.warn('[Process] Handled unhandled rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Fatal uncaught exception:', err?.stack || err);
  process.exit(1);
});

const PORT = config.server.port;
const HOST = config.server.host;

const startServer = async () => {
  try {
    // 0. Ensure JWT_SECRET is configured
    if (!config.auth.jwtSecret) {
      console.error('[JIVEXA Backend] Fatal Error: JWT_SECRET environment variable is missing. A secure secret is required to sign and verify authentication tokens. Please configure JWT_SECRET in .env.');
      process.exit(1);
    }

    // 1. Start Express HTTP listener immediately so health & SSE routes never fail startup 503s while Atlas connects
    const listenCallback = () => {
      console.log(
        `[JIVEXA Backend] Production-Grade Auth Server running in ${
          config.server.nodeEnv
        } mode on http://localhost:${PORT} (dual-stack listening on port ${PORT})`
      );
    };

    const bindHost = HOST || '0.0.0.0';
    const server = app.listen(PORT, bindHost, listenCallback);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `[JIVEXA Backend] Port ${PORT} is already in use by another process. Please terminate the existing process listening on port ${PORT}.`
        );
      } else {
        console.error('[JIVEXA Backend] Server error:', err.message);
      }
    });

    // 2. Connect to MongoDB with bounded background retry (up to 3 attempts) without blocking HTTP readiness
    if (isMongoConfigured()) {
      console.log(`[MongoDB] URI detected (${config.db.getMaskedUri()}). Connecting to MongoDB...`);
      (async () => {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 1500;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            await connectDB();
            if (isDatabaseConnected()) break;
          } catch (err) {
            console.warn(`[MongoDB] Startup connection attempt ${attempt}/${MAX_RETRIES} error:`, err.message);
          }
          if (!isDatabaseConnected() && attempt < MAX_RETRIES) {
            console.log(`[MongoDB] Retrying database connection in ${RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_RETRIES})...`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
        if (!isDatabaseConnected()) {
          console.warn('[MongoDB] Failed to connect to MongoDB after 3 attempts. Server will run in degraded mode.');
        }
      })();
    } else {
      console.warn('[MongoDB] Database URI (MONGO_URI / MONGO_URL) is not set in backend/.env. Server will run in degraded mode until configured.');
    }
  } catch (error) {
    console.error('[JIVEXA Backend] Unexpected startup error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
