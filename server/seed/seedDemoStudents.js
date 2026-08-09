import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

import User from "../models/User.js";
import Student from "../models/Student.js";
import Skill from "../models/Skill.js";
import CareerPath from "../models/CareerPath.js";
import AptitudeAttempt from "../models/AptitudeAttempt.js";
import { computeAndSavePRS } from "../services/prsService.js";

dotenv.config();

const BRANCHES = ["ISE", "CSE", "ECE", "AIML", "EEE"];
const BRANCH_W = [0.30, 0.32, 0.18, 0.12, 0.08];
const BATCHES = ["2026", "2027"];

const FIRST = ["Aarav","Ananya","Rohan","Sneha","Vikram","Divya","Karthik","Meera","Arjun","Priya",
  "Nikhil","Shreya","Rahul","Pooja","Aditya","Kavya","Suhas","Anjali","Varun","Nisha",
  "Manoj","Deepa","Sagar","Lakshmi","Prajwal","Bhavya","Tejas","Sanjana","Harsha","Ishita"];
const LAST = ["Shetty","Bhat","Rao","Nayak","Hegde","Kamath","Pai","Kulkarni","Acharya","Prabhu",
  "Kini","Shenoy","Bangera","Poojary","Salian"];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickW = (arr, w) => {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < arr.length; i++) { acc += w[i]; if (r < acc) return arr[i]; }
  return arr[arr.length - 1];
};
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const PROJECT_TITLES = [
  "E-Commerce Web Application", "Student Attendance System", "Chat Application",
  "Weather Forecast Dashboard", "Library Management System", "Expense Tracker",
  "Portfolio Website", "Blood Bank Management", "Food Delivery Clone",
  "Sentiment Analysis Tool", "Face Recognition Attendance", "IoT Home Automation",
];

const CERT_NAMES = [
  ["AWS Cloud Practitioner", "Amazon Web Services"],
  ["Google Data Analytics", "Google"],
  ["Meta Front-End Developer", "Coursera"],
  ["Python for Everybody", "Coursera"],
  ["Machine Learning Specialization", "DeepLearning.AI"],
  ["NPTEL DBMS", "NPTEL"],
  ["Azure Fundamentals", "Microsoft"],
  ["Cisco CCNA", "Cisco"],
];

const N = 100;

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`\nConnected to ${mongoose.connection.name}\n`);

    const skills = await Skill.find({}).select("name");
    const paths = await CareerPath.find({}).select("name code requiredSkills");
    if (!skills.length || !paths.length) {
      throw new Error("Run `npm run seed` first — skills and career paths are missing");
    }

    const existing = await User.countDocuments({ email: /^demo\d+@mite\.ac\.in$/ });
    if (existing) {
      console.log(`Removing ${existing} existing demo students...`);
      const users = await User.find({ email: /^demo\d+@mite\.ac\.in$/ }).select("_id");
      const ids = users.map((u) => u._id);
      const studentDocs = await Student.find({ userId: { $in: ids } }).select("_id");
      await AptitudeAttempt.deleteMany({ studentId: { $in: studentDocs.map((s) => s._id) } });
      await Student.deleteMany({ userId: { $in: ids } });
      await User.deleteMany({ _id: { $in: ids } });
    }

    const passwordHash = await bcrypt.hash("Demo2026", 10);
    console.log(`Generating ${N} demo students...`);

    let created = 0;

    for (let i = 1; i <= N; i++) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const branch = pickW(BRANCHES, BRANCH_W);
      const batch = pick(BATCHES);
      const cgpa = Math.round(clamp(rand(5.5, 9.8), 5.5, 10) * 100) / 100;
      const backlogs = cgpa < 6.5 ? randInt(0, 3) : cgpa < 7.5 ? randInt(0, 1) : 0;

      const user = await User.create({
        name,
        email: `demo${i}@mite.ac.in`,
        passwordHash,
        role: "student",
        isVerified: true,
      });

      const path = pick(paths);

      // Skills drawn mostly from the chosen career path, plus a little noise
      const pathSkillNames = path.requiredSkills.map((s) => s.name);
      const nSkills = randInt(3, 14);
      const chosen = new Set();

      for (let k = 0; k < nSkills; k++) {
        const fromPath = Math.random() < 0.75;
        const nm = fromPath ? pick(pathSkillNames) : pick(skills).name;
        chosen.add(nm);
      }

      const skillDocs = [...chosen].map((nm) => {
        const doc = skills.find((s) => s.name === nm);
        return doc ? { skillId: doc._id, name: doc.name, proficiency: randInt(2, 5) } : null;
      }).filter(Boolean);

      const nProjects = randInt(0, 4);
      const projects = Array.from({ length: nProjects }, () => ({
        title: pick(PROJECT_TITLES),
        description: "Academic project",
        techStack: skillDocs.slice(0, randInt(2, 4)).map((s) => s.name),
      }));

      const nCerts = randInt(0, 5);
      const certifications = Array.from({ length: nCerts }, () => {
        const [cn, iss] = pick(CERT_NAMES);
        return { name: cn, issuer: iss, issueDate: new Date(2025, randInt(0, 11), randInt(1, 28)) };
      });

      const student = await Student.create({
        userId: user._id,
        usn: `4MT2${randInt(1, 3)}${branch.substring(0, 2)}${String(i).padStart(3, "0")}`,
        batch, branch, cgpa, backlogs,
        skills: skillDocs,
        projects,
        certifications,
        careerInterest: path._id,
      });

      // ~80% have attempted the aptitude test
      if (Math.random() < 0.8) {
        const base = clamp(rand(35, 92), 0, 100);
        const sec = {
          quantitative: Math.round(clamp(base + rand(-15, 15), 0, 100)),
          logical: Math.round(clamp(base + rand(-15, 15), 0, 100)),
          verbal: Math.round(clamp(base + rand(-20, 15), 0, 100)),
          technical: Math.round(clamp(base + rand(-15, 15), 0, 100)),
        };
        const total = Math.round((sec.quantitative + sec.logical + sec.verbal + sec.technical) / 4);

        await AptitudeAttempt.create({
          studentId: student._id,
          sectionScores: sec,
          totalScore: total,
          status: "submitted",
          startedAt: new Date(Date.now() - 1800000),
          submittedAt: new Date(),
          durationSeconds: randInt(600, 1750),
        });
      }

      student.profileCompleteness = student.computeCompleteness();
      await student.save();

      await computeAndSavePRS(student);
      created++;

      if (created % 20 === 0) console.log(`  ${created}/${N}`);
    }

    const stats = await Student.aggregate([
      { $group: { _id: null, avg: { $avg: "$currentPRS" }, min: { $min: "$currentPRS" }, max: { $max: "$currentPRS" }, n: { $sum: 1 } } },
    ]);

    console.log(`\nCreated ${created} demo students`);
    console.log(`Total students in DB: ${stats[0].n}`);
    console.log(`PRS  avg ${stats[0].avg.toFixed(2)}  min ${stats[0].min}  max ${stats[0].max}`);
    console.log(`\nAll demo accounts use password: Demo2026\n`);

    process.exit(0);
  } catch (err) {
    console.error(`\nFailed: ${err.message}\n`);
    process.exit(1);
  }
};

run();