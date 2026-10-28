// Imported first by every test file so these are set before app.js loads.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-secret-not-used-anywhere-else";
process.env.DISABLE_CRON = "true";
// Point the ML client at a closed port: tests must behave the same whether
// or not a developer has the ML service running locally.
process.env.ML_SERVICE_URL = "http://127.0.0.1:9";
// Never let a test reach a real database or mail server.
delete process.env.MONGO_URI;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
