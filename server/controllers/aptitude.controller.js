import AptitudeQuestion from "../models/AptitudeQuestion.js";
import AptitudeAttempt from "../models/AptitudeAttempt.js";
import Student from "../models/Student.js";
import { APTITUDE_SECTIONS } from "../config/constants.js";

const QUESTIONS_PER_SECTION = 5;

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const startTest = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res
        .status(404)
        .json({ message: "Create your profile before taking the test" });
    }

    const existing = await AptitudeAttempt.findOne({
      studentId: student._id,
      status: "in_progress",
    });

    if (existing) {
      const elapsed = (Date.now() - existing.startedAt.getTime()) / 1000;
      if (elapsed < existing.timeLimitSeconds) {
        const questions = await AptitudeQuestion.find({
          _id: { $in: existing.questionsServed },
        }).select("-correctOption -explanation");

        return res.json({
          attemptId: existing._id,
          questions,
          timeRemainingSeconds: Math.round(existing.timeLimitSeconds - elapsed),
          resumed: true,
        });
      }
      existing.status = "expired";
      await existing.save();
    }

    const selected = [];
    for (const section of APTITUDE_SECTIONS) {
      const pool = await AptitudeQuestion.find({
        section,
        isActive: true,
      }).select("-correctOption -explanation");

      if (pool.length < QUESTIONS_PER_SECTION) {
        return res.status(503).json({
          message: `Question bank incomplete: ${section} has ${pool.length} of ${QUESTIONS_PER_SECTION} required`,
        });
      }
      selected.push(...shuffle(pool).slice(0, QUESTIONS_PER_SECTION));
    }

    const attempt = await AptitudeAttempt.create({
      studentId: student._id,
      questionsServed: selected.map((q) => q._id),
      status: "in_progress",
      startedAt: new Date(),
    });

    res.status(201).json({
      attemptId: attempt._id,
      questions: selected,
      timeRemainingSeconds: attempt.timeLimitSeconds,
      totalQuestions: selected.length,
      resumed: false,
    });
  } catch (err) {
    next(err);
  }
};

export const submitTest = async (req, res, next) => {
  try {
    const { attemptId, answers } = req.body;

    if (!attemptId || !Array.isArray(answers)) {
      return res
        .status(400)
        .json({ message: "attemptId and answers[] are required" });
    }

    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const attempt = await AptitudeAttempt.findOne({
      _id: attemptId,
      studentId: student._id,
    });
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (attempt.status !== "in_progress") {
      return res
        .status(409)
        .json({ message: `This attempt is already ${attempt.status}` });
    }

    const elapsedSeconds = (Date.now() - attempt.startedAt.getTime()) / 1000;
    const GRACE_SECONDS = 60;

    if (elapsedSeconds > attempt.timeLimitSeconds + GRACE_SECONDS) {
      attempt.status = "expired";
      await attempt.save();
      return res.status(410).json({
        message:
          "Time limit exceeded — this attempt has expired. Please start a new test.",
        elapsedSeconds: Math.round(elapsedSeconds),
        timeLimitSeconds: attempt.timeLimitSeconds,
      });
    }

    const questions = await AptitudeQuestion.find({
      _id: { $in: attempt.questionsServed },
    }).select("+correctOption");
    const keyMap = new Map(questions.map((q) => [String(q._id), q]));
    const answerMap = new Map(
      answers.map((a) => [String(a.questionId), a.selected]),
    );

    const responses = [];
    const tally = {};
    for (const s of APTITUDE_SECTIONS) tally[s] = { correct: 0, total: 0 };

    for (const qid of attempt.questionsServed) {
      const q = keyMap.get(String(qid));
      if (!q) continue;

      const selected = answerMap.get(String(qid)) ?? null;
      const isCorrect = selected === q.correctOption;

      tally[q.section].total += 1;
      if (isCorrect) tally[q.section].correct += 1;

      responses.push({
        questionId: q._id,
        section: q.section,
        selected,
        isCorrect,
      });
    }

    const answeredCount = responses.filter((r) => r.selected !== null).length;
    if (answeredCount === 0) {
      attempt.status = "expired";
      await attempt.save();
      return res.status(400).json({
        message: "No questions answered — attempt discarded",
      });
    }

    const sectionScores = {};
    for (const s of APTITUDE_SECTIONS) {
      sectionScores[s] = tally[s].total
        ? Math.round((tally[s].correct / tally[s].total) * 100)
        : 0;
    }

    const totalScore = Math.round(
      APTITUDE_SECTIONS.reduce((sum, s) => sum + sectionScores[s], 0) /
        APTITUDE_SECTIONS.length,
    );

    attempt.responses = responses;
    attempt.sectionScores = sectionScores;
    attempt.totalScore = totalScore;
    attempt.status = "submitted";
    attempt.submittedAt = new Date();
    attempt.durationSeconds = Math.round(elapsedSeconds);
    await attempt.save();

    const best = await AptitudeAttempt.findOne({
      studentId: student._id,
      status: "submitted",
    })
      .sort("-totalScore")
      .select("totalScore");

    student.prsBreakdown.aptitude = best?.totalScore ?? totalScore;
    await student.save();

    res.json({
      attemptId: attempt._id,
      sectionScores,
      totalScore,
      bestScore: best?.totalScore ?? totalScore,
      correctCount: responses.filter((r) => r.isCorrect).length,
      answeredCount,
      totalQuestions: responses.length,
      durationSeconds: attempt.durationSeconds,
      message: "Test submitted. Your best score contributes to your PRS.",
    });
  } catch (err) {
    next(err);
  }
};

export const getHistory = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const attempts = await AptitudeAttempt.find({
      studentId: student._id,
      status: "submitted",
    })
      .select("sectionScores totalScore submittedAt durationSeconds")
      .sort("-submittedAt")
      .limit(10);

    const best = attempts.reduce(
      (max, a) => (a.totalScore > max ? a.totalScore : max),
      0,
    );

    res.json({
      attempts,
      bestScore: attempts.length ? best : null,
      latestScore: attempts[0]?.totalScore ?? null,
      attemptCount: attempts.length,
    });
  } catch (err) {
    next(err);
  }
};

export const reviewAttempt = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const attempt = await AptitudeAttempt.findOne({
      _id: req.params.attemptId,
      studentId: student._id,
      status: "submitted",
    });
    if (!attempt)
      return res.status(404).json({ message: "Submitted attempt not found" });

    const questions = await AptitudeQuestion.find({
      _id: { $in: attempt.questionsServed },
    }).select("+correctOption +explanation");
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    const review = attempt.responses.map((r) => {
      const q = qMap.get(String(r.questionId));
      return {
        questionText: q?.questionText,
        options: q?.options,
        section: r.section,
        yourAnswer: r.selected,
        correctAnswer: q?.correctOption,
        isCorrect: r.isCorrect,
        explanation: q?.explanation,
      };
    });

    res.json({
      sectionScores: attempt.sectionScores,
      totalScore: attempt.totalScore,
      review,
    });
  } catch (err) {
    next(err);
  }
};
