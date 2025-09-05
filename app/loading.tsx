export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-8 w-64 bg-white/10 rounded animate-pulse" />
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded border border-white/10 bg-white/5 animate-pulse" />
          ))}
        </div>
        <div className="mt-8 h-8 w-40 bg-white/10 rounded animate-pulse" />
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-60 rounded border border-white/10 bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}


