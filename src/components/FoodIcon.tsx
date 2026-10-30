import type { FoodIconName } from '../lib/palette';

const PATHS: Record<FoodIconName, React.ReactNode> = {
  rice: (
    <>
      <path d="M5 14a7 7 0 0 1 14 0" />
      <path d="M2.5 14h19" />
      <path d="M5 17.5h14" />
      <path d="M10 8.5v.01M13 10v.01M9 11.5v.01" />
    </>
  ),
  bowl: (
    <>
      <path d="M3 11h18a9 9 0 0 1-18 0z" />
      <path d="M9 20h6" />
      <path d="M13 3l-3 8M18 4l-5 7" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 21L3.5 6.5a15 15 0 0 1 17 0z" />
      <path d="M5 9a13 13 0 0 1 14 0" />
      <path d="M10 12v.01M14 11v.01M12 16v.01" />
    </>
  ),
  sushi: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  burger: (
    <>
      <path d="M4 10a8 6 0 0 1 16 0z" />
      <path d="M3 13.5h18" />
      <path d="M4 17h16v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </>
  ),
  cup: (
    <>
      <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5v2.5M12 3.5v2.5" />
    </>
  ),
};

export function FoodIcon({ icon, size = 22, strokeWidth = 1.8 }: { icon: FoodIconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[icon]}
    </svg>
  );
}
