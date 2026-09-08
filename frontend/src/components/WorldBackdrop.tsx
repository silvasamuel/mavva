/** Fixed harvest-field backdrop. Decorative only — never steals clicks. */
export function WorldBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-b from-[#f4efe0] via-sand-50 to-[#dcecc8]" />
      <div className="absolute -right-16 top-[-4rem] h-56 w-56 rounded-full bg-grain-200/50 blur-3xl" />
      <div className="absolute left-[-6rem] top-24 h-40 w-40 rounded-full bg-leaf-200/40 blur-3xl" />
      <svg
        className="absolute inset-x-0 bottom-0 h-[38vh] w-full text-leaf-700"
        viewBox="0 0 1200 360"
        preserveAspectRatio="none"
      >
        <path
          fill="#8dd295"
          d="M0 220C180 160 280 200 420 190C580 178 640 120 780 140C920 160 1020 210 1200 170V360H0Z"
        />
        <path
          fill="#57b663"
          d="M0 260C200 210 340 250 500 230C680 208 760 170 900 190C1040 210 1100 240 1200 220V360H0Z"
        />
        <path
          fill="#237d31"
          d="M0 310C160 280 300 300 460 288C640 274 780 250 940 270C1060 284 1140 300 1200 290V360H0Z"
        />
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(rgba(50,154,64,0.07)_1px,transparent_1px)] bg-[length:22px_22px]" />
    </div>
  )
}
