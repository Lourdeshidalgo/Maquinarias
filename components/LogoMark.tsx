export default function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="#4338CA" />
      <circle cx="26" cy="32" r="13" fill="#7C3AED" />
      <circle cx="40" cy="32" r="13" fill="#EEEDFE" />
    </svg>
  );
}
