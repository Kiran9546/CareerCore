import { useEffect, useState } from "react";
import api from "../../api/axios";
import { confirmAction } from "../../components/ui/confirm";

const SECTIONS = ["quantitative", "logical", "verbal", "technical"];
const LABELS = ["A", "B", "C", "D"];

export default function Questions() {
  const [questions, setQuestions] = useState([]);
  const [bySection, setBySection] = useState([]);
  const [section, setSection] = useState("");
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);

  const blank = {
    section: "quantitative",
    questionText: "",
    options: LABELS.map((l) => ({ label: l, text: "" })),
    correctOption: "A",
    explanation: "",
    difficulty: "medium",
  };
  const [form, setForm] = useState(blank);

  const load = () => {
    api.get(`/admin/questions${section ? `?section=${section}` : ""}`)
      .then((r) => { setQuestions(r.data.questions); setBySection(r.data.bySection); });
  };

  useEffect(load, [section]);

  const create = async () => {
    setMsg("");
    try {
      await api.post("/admin/questions", form);
      setForm(blank);
      setShowForm(false);
      setMsg("Question added");
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || "Failed to add question");
    }
  };

  const toggle = async (id) => {
    setMsg("");
    try {
      await api.patch(`/admin/questions/${id}/toggle`);
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || "Could not change the question");
    }
  };
  const remove = async (id) => {
    if (!(await confirmAction("Delete this question from the bank? Past test attempts keep their scores."))) return;
    setMsg("");
    try {
      await api.delete(`/admin/questions/${id}`);
      setMsg("Question deleted");
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || "Could not delete the question");
    }
  };

  const input = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 w-full";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SECTIONS.map((s) => {
          const count = bySection.find((b) => b.section === s)?.count || 0;
          return (
            <div key={s} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-2xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500 mt-0.5 capitalize">{s}</p>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <select value={section} onChange={(e) => setSection(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white">
          <option value="">All sections</option>
          {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
          {showForm ? "Cancel" : "Add question"}
        </button>
      </div>

      {msg && <p role="status" className="feedback-in text-sm text-slate-600">{msg}</p>}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}
              className={`${input} bg-white`}>
              {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
              className={`${input} bg-white`}>
              {["easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <textarea rows={2} value={form.questionText}
            onChange={(e) => setForm({ ...form, questionText: e.target.value })}
            placeholder="Question text" className={input} />

          {form.options.map((o, i) => (
            <div key={o.label} className="flex items-center gap-3">
              <button onClick={() => setForm({ ...form, correctOption: o.label })}
                className={`w-8 h-8 rounded text-sm font-medium ${
                  form.correctOption === o.label ? "bg-green-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                {o.label}
              </button>
              <input value={o.text}
                onChange={(e) => {
                  const opts = [...form.options];
                  opts[i] = { ...o, text: e.target.value };
                  setForm({ ...form, options: opts });
                }}
                placeholder={`Option ${o.label}`} className={input} />
            </div>
          ))}

          <p className="text-xs text-slate-400">Click a letter to mark the correct answer.</p>

          <input value={form.explanation}
            onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            placeholder="Explanation (optional)" className={input} />

          <button onClick={create}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
            Save question
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-500 mb-4">{questions.length} questions</p>
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q._id} className="px-4 py-3 rounded-lg border border-slate-100">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500 capitalize">
                      {q.section}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">
                      {q.difficulty}
                    </span>
                    {!q.isActive && (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600">inactive</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800">{q.questionText}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Answer: {q.correctOption} · {q.options.find((o) => o.label === q.correctOption)?.text}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 ml-2 sm:ml-4">
                  <button onClick={() => toggle(q._id)}
                    className="px-1 py-1.5 text-xs text-slate-400 hover:text-slate-900 underline">
                    {q.isActive ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => remove(q._id)}
                    className="px-1 py-1.5 text-xs text-slate-400 hover:text-red-600 underline">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}