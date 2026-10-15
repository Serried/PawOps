export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading dashboard…</span>
      <div className="h-[38px] w-[280px] animate-pulse rounded-xl bg-[#f2eae9]" />
      <div className="h-5 w-[220px] animate-pulse rounded-xl bg-[#f2eae9]" />
      <div className="my-5 mb-2 grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
        {[1, 2].map((item) => <div className="h-[138px] animate-pulse rounded-xl bg-[#f2eae9]" key={item} />)}
      </div>
      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)] items-start gap-[22px] max-[1100px]:grid-cols-1">
        <div className="h-[360px] animate-pulse rounded-xl bg-[#f2eae9]" />
        <div className="h-[360px] animate-pulse rounded-xl bg-[#f2eae9]" />
      </div>
    </div>
  )
}

