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
// Never let a test reach WhatsApp: no credentials, sandbox delivery, and
// no background worker — tests drive processDueDeliveries() themselves.
for (const k of Object.keys(process.env)) if (k.startsWith("WHATSAPP_")) delete process.env[k];
process.env.NOTIFICATION_DELIVERY_MODE = "sandbox";
process.env.DELIVERY_WORKER = "off";
delete process.env.NOTIFY_WHATSAPP_ENABLED;
delete process.env.PUBLIC_APP_URL;
