import { useEffect, useState } from 'react';
import { getJson } from './api.js';

interface KpiData {
  videos: number;
  tagged: number;
  enrollmentsCompleted: number;
  suggestionsSurfaced: number;
  suggestionsRejected: number;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 170 }}>
      <div className="dim" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, margin: '4px 0' }}>{value}</div>
      {sub !== undefined ? <div className="dim" style={{ fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}

export function Kpis() {
  const [data, setData] = useState<KpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<KpiData>('/api/kpis').then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error !== null) return <div className="card dim">API error: {error}</div>;
  if (data === null) return <div className="card dim">Loading…</div>;

  return (
    <>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Stat label="Enrollments (lifetime, Stripe Checkout)" value={String(data.enrollmentsCompleted)} sub="KPI 1 target: 80/month by day 90" />
        <Stat label="Videos with performance data" value={String(data.videos)} sub="TikTok + YouTube (Instagram blocked)" />
        <Stat label="Hypothesis-tagged videos" value={String(data.tagged)} sub="KPI 3 target: 4/week tagged — taxonomy v2 pending" />
        <Stat label="Suggestions surfaced" value={String(data.suggestionsSurfaced)} sub={`${data.suggestionsRejected} rejected by checks`} />
      </div>
      <div className="card dim" style={{ marginTop: 14 }}>
        KPI 2 (demo requests/week) has no data source yet — manual demo-send log lands with M5/M6. Numbers here are lifetime counts, not monthly rates; monthly breakdowns come with the M5 report.
      </div>
    </>
  );
}