export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">CareerCore</h1>
        <p className="mt-2 text-slate-600">Placement Intelligence Platform</p>
        <div className="mt-6 flex gap-2 justify-center">
          <span className="px-3 py-1 rounded text-white text-sm bg-prs-notready">
            Not Ready
          </span>
          <span className="px-3 py-1 rounded text-white text-sm bg-prs-developing">
            Developing
          </span>
          <span className="px-3 py-1 rounded text-white text-sm bg-prs-ready">
            Placement Ready
          </span>
          <span className="px-3 py-1 rounded text-white text-sm bg-prs-high">
            Highly Ready
          </span>
        </div>
      </div>
    </div>
  );
}
