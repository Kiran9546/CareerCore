import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
    },

    photoUrl: String,
    photoFilename: String,
    phone: String,
    address: String,
    linkedinUrl: String,
    githubUrl: String,
    portfolioUrl: String,

    summary: { type: String, maxlength: 800 },

    education: {
      degree: {
        course: {
          type: String,
          default:
            "Bachelor of Engineering – Information Science and Engineering",
        },
        institution: {
          type: String,
          default: "Mangalore Institute of Technology & Engineering.",
        },
        yearRange: String,
        cgpa: Number,
      },
      twelfth: {
        title: { type: String, default: "Senior Secondary (12th)" },
        institution: String,
        yearRange: String,
        percentage: Number,
      },
      tenth: {
        title: { type: String, default: "Secondary School (Class X)" },
        institution: String,
        yearRange: String,
        percentage: Number,
      },
    },

    // Auto-filled from profile, editable by the student
    technicalSkills: {
      languages: { type: String, default: "" },
      interface: { type: String, default: "" },
      database: { type: String, default: "" },
      tools: { type: String, default: "" },
    },
    skillsManuallyEdited: { type: Boolean, default: false },

    projects: [
      {
        title: String,
        subtitle: String,
        bullets: [String],
        _id: false,
      },
    ],
    projectsManuallyEdited: { type: Boolean, default: false },

    internships: [
      {
        role: String,
        company: String,
        duration: String,
        bullets: [String],
        _id: false,
      },
    ],
    certifications: [
      { name: String, issuer: String, year: String, _id: false },
    ],
    achievements: [String],
    positions: [String],
    languagesKnown: [String],

    sectionOrder: {
      type: [String],
      default: [
        "summary",
        "education",
        "skills",
        "projects",
        "internships",
        "certifications",
        "achievements",
        "positions",
        "languages",
      ],
    },
    hiddenSections: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("Resume", resumeSchema);
