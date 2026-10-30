import type { Food } from '../lib/foods';
import { FOOD_COLORS } from '../lib/palette';

export type TickSpeed = 'fast' | 'mid' | 'slow' | 'crawl' | null;

const TICK_DURATION: Record<Exclude<TickSpeed, null>, string> = {
  fast: '0.09s',
  mid: '0.15s',
  slow: '0.26s',
  crawl: '0.42s',
};

export const SPIN_MS = 4200;

const SIZE = 320;
const C = SIZE / 2;
const R = 150;
const LABEL_R = 132;

const BURST_COLORS = ['#CC3F17', '#FFD966', '#2F6FD6', '#A8D8A0', '#DDBBE8', '#93D7CC', '#FFB4A2', '#FFD966', '#CC3F17', '#A9CDF4', '#F6C59A', '#2F6FD6'];

/** Point on the rim at `deg` degrees clockwise from 12 o'clock. */
function rim(deg: number, r = R): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

function slicePath(a0: number, a1: number): string {
  const [x0, y0] = rim(a0);
  const [x1, y1] = rim(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${C} ${C}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
}

function truncate(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/** Rotation (deg) that puts the middle of slice `index` under the 12 o'clock pointer. */
export function landingAngle(index: number, count: number): number {
  const seg = 360 / count;
  return (360 - (seg * index + seg / 2)) % 360;
}

interface Props {
  foods: Food[];
  rotation: number;
  /** Animate the rotation change; false jumps straight to it. */
  animate: boolean;
  sway: boolean;
  tick: TickSpeed;
  /** Changes on every landing to replay the ring and confetti; null hides them. */
  burstKey: number | null;
  /** The rotating disc, so the screen can follow its live angle (tick sounds). */
  rotorRef?: React.Ref<HTMLDivElement>;
}

export function Wheel({ foods, rotation, animate, sway, tick, burstKey, rotorRef }: Props) {
  const n = foods.length;
  const seg = 360 / Math.max(n, 1);
  const fontSize = n > 10 ? 11 : 13;
  const maxChars = n > 10 ? 12 : 14;

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE + 16, alignSelf: 'center', flexShrink: 0 }}>
      <svg
        width="30"
        height="34"
        viewBox="0 0 30 34"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: C - 15,
          top: 0,
          zIndex: 4,
          filter: 'drop-shadow(0 2px 3px rgba(24, 24, 27, 0.3))',
          transformOrigin: '15px 8px',
          animation: tick ? `tick ${TICK_DURATION[tick]} linear infinite` : 'none',
        }}
      >
        <path d="M15 34L2.6 7C1 3.6 3 0 6.6 0h16.8c3.6 0 5.6 3.6 4 7Z" fill="#CC3F17" stroke="#FFFFFF" strokeWidth="2" />
      </svg>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 16,
          width: SIZE,
          height: SIZE,
          animation: sway ? 'sway 3.2s ease-in-out infinite' : 'none',
        }}
      >
        <div
          ref={rotorRef}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: 999,
            boxShadow: '0 14px 32px rgba(24, 24, 27, 0.18)',
            transform: `rotate(${rotation}deg)`,
            transition: animate ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.16, 1)` : 'none',
          }}
        >
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`Food wheel with ${n} options: ${foods.map((f) => f.name).join(', ')}`}
          >
            <g stroke="#FFFFFF" strokeWidth="2">
              {n === 1 ? (
                <circle cx={C} cy={C} r={R} fill={FOOD_COLORS[foods[0].color].slice} />
              ) : (
                foods.map((f, i) => (
                  <path key={f.id} d={slicePath(i * seg, (i + 1) * seg)} fill={FOOD_COLORS[f.color].slice} />
                ))
              )}
              {n === 0 && <circle cx={C} cy={C} r={R} fill="#EDEDE9" />}
            </g>
            <g
              fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
              fontSize={fontSize}
              fontWeight="800"
              fill="#18181B"
              textAnchor="end"
            >
              {foods.map((f, i) => (
                <text key={f.id} x={C + LABEL_R} y={C + fontSize * 0.35} transform={`rotate(${i * seg + seg / 2 - 90} ${C} ${C})`}>
                  {truncate(f.name, maxChars)}
                </text>
              ))}
            </g>
            <circle cx={C} cy={C} r="152" fill="none" stroke="#18181B" strokeWidth="5" />
            {n > 1 && (
              <g fill="#FFFFFF">
                {foods.map((f, i) => {
                  const [x, y] = rim(i * seg);
                  return <circle key={f.id} cx={x} cy={y} r="3" />;
                })}
              </g>
            )}
            <circle cx={C} cy={C} r="28" fill="#FFFFFF" stroke="#18181B" strokeWidth="4" />
            <circle cx={C} cy={C} r="11" fill="#CC3F17" />
          </svg>
        </div>
      </div>

      {burstKey !== null && (
        <div
          key={burstKey}
          aria-hidden="true"
          style={{ position: 'absolute', left: 0, top: 16, width: SIZE, height: SIZE, pointerEvents: 'none', zIndex: 3 }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 999,
              border: '5px solid #CC3F17',
              animation: 'ringOut 0.8s ease-out both',
            }}
          />
          {BURST_COLORS.map((color, i) => {
            const long = i % 2 === 0;
            return (
              <span key={i} style={{ position: 'absolute', left: C, top: C, transform: `rotate(${i * 30}deg)` }}>
                <span
                  style={{
                    display: 'block',
                    width: long ? 8 : 10,
                    height: long ? 14 : 10,
                    margin: long ? '-7px 0 0 -4px' : '-5px 0 0 -5px',
                    borderRadius: long ? 2 : 999,
                    background: color,
                    animation: long
                      ? 'burst 0.95s cubic-bezier(0.2, 0.7, 0.3, 1) both'
                      : 'burstShort 0.8s 0.05s cubic-bezier(0.2, 0.7, 0.3, 1) both',
                  }}
                />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
