const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

const config = require('./config/env');
const logger = require('./utils/logger');
const ApiError = require('./utils/ApiError');
const ApiResponse = require('./utils/ApiResponse');
const { globalLimiter } = require('./middlewares/rateLimiter.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');
const identifySchoolBySubdomain = require('./middlewares/subdomain.middleware');
const routes = require('./routes/index');

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet());

// Dynamic CORS: allow platform domain + all subdomains
const allowedOriginPattern = new RegExp(
  `^https?://([a-z0-9-]+\\.)?${config.PLATFORM_DOMAIN.replace('.', '\\.')}(:\\d+)?$`
);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (origin === config.FRONTEND_URL || allowedOriginPattern.test(origin)) {
      return callback(null, true);
    }
    // In development, also allow localhost variants
    if (config.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-School-Subdomain'],
}));
app.use(mongoSanitize()); // Prevent NoSQL injection

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (config.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use(globalLimiter);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json(new ApiResponse(200, {
    status: 'ok',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  }));
});

// ─── Subdomain Detection ─────────────────────────────────────────────────────
app.use(identifySchoolBySubdomain);

// ─── Local Uploads Fallback ──────────────────────────────────────────────────
app.use('/local-uploads', express.static(path.resolve(__dirname, '..', config.LOCAL_UPLOADS_DIR)));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use(config.API_PREFIX, routes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
