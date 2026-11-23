import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setup, teardown, reset, createUser, createStudent, api } from "./helpers.js";
import ContactMessage from "../models/ContactMessage.js";
import Notification from "../models/Notification.js";
import Drive from "../models/Drive.js";

/** The contact form, the administrators' inbox, and the staff quick search. */

before(setup);
after(teardown);
beforeEach(reset);

const valid = { name: "Asha Rao", email: "asha@college.edu", topic: "account", message: "I cannot sign in to my account." };

test("contact: validation, storage, admin alert, inbox and status changes", async () => {
  const anon = api(null);
  const { user: admin, token: adminToken } = await createUser("admin");

  const bad = await anon.post("/contact", { name: "A", email: "nope", topic: "spam", message: "short" });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.errors).sort(), ["email", "message", "name", "topic"]);
  assert.equal(await ContactMessage.countDocuments(), 0, "invalid messages are not stored");

  const ok = await anon.post("/contact", valid);
  assert.equal(ok.status, 201);
  assert.ok(ok.body.id && ok.body.receivedAt);
  const stored = await ContactMessage.findById(ok.body.id).lean();
  assert.equal(stored.status, "new");
  assert.equal(stored.userId, undefined, "anonymous sender has no account link");

  const alerts = await Notification.find({ userId: admin._id }).lean();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].link, "/admin/messages");

  // A signed-in sender is linked to their account.
  const { user: student, token } = await createStudent();
  const signed = await api(token).post("/contact", { ...valid, topic: "privacy" });
  assert.equal((await ContactMessage.findById(signed.body.id)).userId.toString(), student._id.toString());

  // The hidden honeypot field: accepted silently, never stored.
  const bot = await anon.post("/contact", { ...valid, website: "http://spam.example" });
  assert.equal(bot.status, 201);
  assert.equal(await ContactMessage.countDocuments(), 2);

  // Only administrators can read the inbox.
  assert.equal((await api(token).get("/admin/messages")).status, 403);
  const inbox = await api(adminToken).get("/admin/messages");
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.messages.length, 2);
  assert.equal(inbox.body.newCount, 2);
  assert.equal(inbox.body.messages[0].topicLabel, "Privacy and my data", "newest first");
  assert.equal(inbox.body.messages[0].account.role, "student");

  const done = await api(adminToken).patch(`/admin/messages/${ok.body.id}`, { status: "resolved" });
  assert.equal(done.status, 200);
  assert.equal(done.body.message.status, "resolved");
  assert.ok(done.body.message.resolvedAt);
  assert.equal((await api(adminToken).get("/admin/messages?status=new")).body.messages.length, 1);
  assert.equal((await api(adminToken).patch(`/admin/messages/${ok.body.id}`, { status: "archived" })).status, 400);
  assert.equal((await api(adminToken).patch(`/admin/messages/${new mongoose.Types.ObjectId()}`, { status: "new" })).status, 404);
});

test("contact: one address is limited to five messages an hour", async () => {
  const anon = api(null);
  // The previous test used this address too; the limiter keeps counting.
  let last;
  for (let i = 0; i < 6; i += 1) last = await anon.post("/contact", valid);
  assert.equal(last.status, 429);
});

test("search: scoped by role", async () => {
  const { token: officer } = await createUser("placement_officer");
  const { token: faculty } = await createUser("faculty", { department: "ISE" });
  const { token: student } = await createStudent({ usn: "4MT26CS0001", branch: "CSE" }, { name: "Kavya Shetty" });
  await createStudent({ usn: "4MT26IS0002", branch: "ISE" }, { name: "Kavya Nayak" });
  await Drive.collection.insertOne({
    companyName: "Northwind Systems",
    role: "Graduate engineer",
    driveDate: new Date(),
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const all = await api(officer).get("/search?q=kavya");
  assert.equal(all.status, 200);
  assert.equal(all.body.students.length, 2);

  const byUsn = await api(officer).get("/search?q=4MT26IS");
  assert.deepEqual(byUsn.body.students.map((s) => s.usn), ["4MT26IS0002"]);

  const drives = await api(officer).get("/search?q=northwind");
  assert.equal(drives.body.drives.length, 1);
  assert.equal(drives.body.drives[0].role, "Graduate engineer");

  const dept = await api(faculty).get("/search?q=kavya");
  assert.deepEqual(dept.body.students.map((s) => s.usn), ["4MT26IS0002"], "faculty see their department only");
  assert.equal(dept.body.drives.length, 0);

  assert.deepEqual((await api(student).get("/search?q=kavya")).body, { students: [], drives: [] });
  assert.equal((await api(officer).get("/search?q=k")).body.students.length, 0, "one character is too short");
  assert.equal((await api(officer).get("/search?q=(.*")).status, 200, "regex characters are escaped");
  assert.equal((await api(null).get("/search?q=kavya")).status, 401);
});
