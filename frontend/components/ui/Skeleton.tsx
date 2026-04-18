const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-[rgba(232,228,216,0.06)] ${className ?? ''}`} />
)

export default Skeleton
