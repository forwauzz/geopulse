type Issue = {
  check?: string;
  finding?: string;
  fix?: string;
  weight?: number;
};

export function ScoreDisplay({
  score,
  letterGrade,
  issues,
}: {
  score: number;
  letterGrade: string;
  issues: Issue[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-200 bg-geo-surface p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-geo-mist">
          AI Search Readiness Score
        </p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-5xl font-bold text-geo-ink">{score}</span>
          <span className="text-2xl font-semibold text-geo-accent">/ 100</span>
          <span className="text-3xl font-bold text-slate-400">{letterGrade}</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-geo-ink">Top issues to fix</h2>
        <ul className="mt-3 space-y-4">
          {issues.length === 0 ? (
            <li className="text-geo-mist">No failing checks in the top bucket — great baseline.</li>
          ) : (
            issues.map((i, idx) => (
              <li
                key={`${String(i.check)}-${String(idx)}`}
                className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm"
              >
                <p className="font-medium text-geo-ink">{i.check ?? 'Check'}</p>
                <p className="mt-1 text-sm text-geo-mist">{i.finding}</p>
                {i.fix ? <p className="mt-2 text-sm text-slate-600">{i.fix}</p> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
