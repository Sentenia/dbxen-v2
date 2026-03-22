// Animated skeleton pulse bar for loading states
export default function Skeleton({ width = '60px', height = '20px', style = {} }) {
  return (
    <span
      className="skeleton-pulse"
      style={{ display: 'inline-block', width, height, borderRadius: 6, verticalAlign: 'middle', ...style }}
    />
  );
}
