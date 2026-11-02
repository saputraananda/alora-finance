import React, { useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

/* ── Ilustrasi (SVG murni, tanpa teks agar tidak bergantung font) ─────────── */

// 1. Dashboard: grafik batang + garis tren + kartu ringkasan
function SceneDashboard() {
  const heights = [70, 100, 88, 134, 164, 196];
  const base = 346;
  const xs = heights.map((_, i) => 118 + i * 74);
  const tops = heights.map((h) => base - h);
  const line = xs.map((x, i) => `${x + 22},${tops[i] - 18}`).join(' ');
  return (
    <svg viewBox="0 0 640 420" className="h-full w-full" role="img" aria-label="Ilustrasi grafik pendapatan">
      <defs>
        <linearGradient id="hf-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d1fae5" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <rect x="56" y="36" width="528" height="348" rx="28" fill="#fff" fillOpacity=".1" stroke="#fff" strokeOpacity=".28" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={86 + i * 168} y="62" width="152" height="56" rx="14" fill="#fff" fillOpacity=".14" />
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={108 + i * 168} cy="90" r="11" fill={i === 0 ? '#6ee7b7' : '#fff'} fillOpacity={i === 0 ? 1 : 0.5} />
          <rect x={130 + i * 168} y="80" width="64" height="8" rx="4" fill="#fff" fillOpacity=".55" />
          <rect x={130 + i * 168} y="95" width="40" height="8" rx="4" fill="#fff" fillOpacity=".3" />
        </g>
      ))}
      {[190, 235, 280, 325].map((y) => (
        <line key={y} x1="92" x2="548" y1={y} y2={y} stroke="#fff" strokeOpacity=".14" strokeDasharray="4 6" />
      ))}
      {heights.map((h, i) => (
        <rect
          key={i}
          x={xs[i]}
          y={tops[i]}
          width="44"
          height={h}
          rx="10"
          fill={i === heights.length - 1 ? 'url(#hf-bar)' : '#fff'}
          fillOpacity={i === heights.length - 1 ? 1 : 0.32}
        />
      ))}
      <polyline points={line} fill="none" stroke="#fde68a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[5] + 22} cy={tops[5] - 18} r="9" fill="#fde68a" />
      <circle cx={xs[5] + 22} cy={tops[5] - 18} r="16" fill="#fde68a" fillOpacity=".25" />
    </svg>
  );
}

// 2. Jurnal: debit = kredit, seimbang
function SceneLedger() {
  const rows = [
    [96, 70],
    [64, 64],
    [110, 110],
    [82, 82],
  ];
  return (
    <svg viewBox="0 0 640 420" className="h-full w-full" role="img" aria-label="Ilustrasi jurnal debit dan kredit seimbang">
      <rect x="56" y="36" width="528" height="348" rx="28" fill="#fff" fillOpacity=".1" stroke="#fff" strokeOpacity=".28" />
      <rect x="86" y="64" width="212" height="40" rx="12" fill="#fff" fillOpacity=".22" />
      <rect x="342" y="64" width="212" height="40" rx="12" fill="#fff" fillOpacity=".22" />
      <rect x="108" y="80" width="56" height="9" rx="4.5" fill="#fff" fillOpacity=".8" />
      <rect x="364" y="80" width="56" height="9" rx="4.5" fill="#fff" fillOpacity=".8" />
      {rows.map(([a, b], i) => {
        const y = 124 + i * 52;
        return (
          <g key={i}>
            <rect x="86" y={y} width="212" height="40" rx="10" fill="#fff" fillOpacity={i === 2 ? 0.2 : 0.1} />
            <rect x="342" y={y} width="212" height="40" rx="10" fill="#fff" fillOpacity={i === 2 ? 0.2 : 0.1} />
            <rect x="104" y={y + 15} width={a + 30} height="9" rx="4.5" fill="#fff" fillOpacity=".5" />
            <rect x={540 - (b + 30)} y={y + 15} width={b + 30} height="9" rx="4.5" fill="#fff" fillOpacity=".5" />
          </g>
        );
      })}
      <line x1="320" x2="320" y1="64" y2="332" stroke="#fff" strokeOpacity=".2" />
      <rect x="86" y="338" width="212" height="34" rx="10" fill="#6ee7b7" fillOpacity=".9" />
      <rect x="342" y="338" width="212" height="34" rx="10" fill="#6ee7b7" fillOpacity=".9" />
      <rect x="170" y="351" width="128" height="9" rx="4.5" fill="#064e3b" fillOpacity=".6" />
      <rect x="342" y="351" width="128" height="9" rx="4.5" fill="#064e3b" fillOpacity=".6" />
      <circle cx="320" cy="355" r="24" fill="#fff" />
      <path d="M309 355l8 8 15-17" fill="none" stroke="#059669" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 3. Anggaran vs realisasi: donut + batang pemakaian
function SceneBudget() {
  const r = 84;
  const c = 2 * Math.PI * r;
  const pct = 0.72;
  const bars = [
    [0.8, '#6ee7b7'],
    [0.55, '#6ee7b7'],
    [0.96, '#fcd34d'],
    [0.38, '#6ee7b7'],
  ];
  return (
    <svg viewBox="0 0 640 420" className="h-full w-full" role="img" aria-label="Ilustrasi anggaran dan realisasi">
      <rect x="56" y="36" width="528" height="348" rx="28" fill="#fff" fillOpacity=".1" stroke="#fff" strokeOpacity=".28" />
      <g transform="translate(188 210)">
        <circle r={r} fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="30" />
        <circle
          r={r}
          fill="none"
          stroke="#6ee7b7"
          strokeWidth="30"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90)"
        />
        <rect x="-34" y="-12" width="68" height="14" rx="7" fill="#fff" />
        <rect x="-22" y="10" width="44" height="9" rx="4.5" fill="#fff" fillOpacity=".55" />
      </g>
      {bars.map(([v, color], i) => {
        const y = 118 + i * 60;
        return (
          <g key={i}>
            <circle cx="350" cy={y + 8} r="7" fill={color} />
            <rect x="370" y={y} width="120" height="9" rx="4.5" fill="#fff" fillOpacity=".55" />
            <rect x="370" y={y + 22} width="176" height="12" rx="6" fill="#fff" fillOpacity=".16" />
            <rect x="370" y={y + 22} width={176 * v} height="12" rx="6" fill={color} />
          </g>
        );
      })}
      <circle cx="540" cy="98" r="9" fill="#fcd34d" />
      <circle cx="540" cy="98" r="17" fill="#fcd34d" fillOpacity=".25" />
    </svg>
  );
}

const SLIDES = [
  {
    Scene: SceneDashboard,
    accent: 'Dashboard',
    caption: 'Pantau pendapatan dan pengeluaran dalam satu tampilan',
  },
  {
    Scene: SceneLedger,
    accent: 'Jurnal & Buku Besar',
    caption: 'Jurnal selalu seimbang, koreksi lewat jurnal pembalik',
  },
  {
    Scene: SceneBudget,
    accent: 'Anggaran Beban',
    caption: 'Bandingkan anggaran dengan realisasi setiap bulan',
  },
];

export default function LoginHero() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCurrent((c) => (c + 1) % SLIDES.length), 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative hidden w-[55%] flex-shrink-0 select-none overflow-hidden bg-gradient-to-br from-[#022c22] via-[#065f46] to-[#059669] lg:flex">
      {/* Grid overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      {/* Dekorasi lingkaran */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/[0.05]" />
      <div className="pointer-events-none absolute -right-16 top-1/3 h-56 w-56 rounded-full bg-emerald-300/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-emerald-200/10 blur-3xl" />

      {/* Ilustrasi (crossfade) */}
      <div className="absolute inset-x-12 bottom-48 top-28">
        {SLIDES.map(({ Scene }, i) => (
          <div
            key={i}
            aria-hidden={i !== current}
            className={cn(
              'absolute inset-0 transition-opacity duration-[1200ms] motion-reduce:transition-none',
              i === current ? 'opacity-100' : 'opacity-0'
            )}
          >
            <Scene />
          </div>
        ))}
      </div>

      <div className="relative z-10 flex h-full w-full flex-col justify-between p-10">
        {/* Atas: brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 shadow-lg ring-1 ring-white/25">
            <Banknote className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold leading-none tracking-tight text-white">HO Finance</p>
            <p className="mt-0.5 text-xs font-medium tracking-wide text-white/80">Alora SuperApp</p>
          </div>
        </div>

        {/* Bawah: caption + indikator */}
        <div className="space-y-5">
          <div>
            <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200/70">
              {SLIDES[current].accent}
            </span>
            <h2 className="max-w-[340px] text-2xl font-bold leading-snug text-white drop-shadow-sm xl:text-3xl">
              {SLIDES[current].caption}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Slide ${i + 1}`}
                className={cn(
                  'h-[3px] cursor-pointer rounded-full transition-all duration-500',
                  i === current ? 'w-8 bg-white' : 'w-2 bg-white/25 hover:bg-white/50'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
