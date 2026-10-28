import { useEffect, useState } from 'react';

const SEEN_KEY = 'khimea-splash-seen';
const ENTER_MS = 280;
const HOLD_MS = 650;
const EXIT_MS = 200;

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return window.sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

/** Logo del estudio al abrir la app, una vez por sesión. Click o cualquier tecla lo saltea. */
export function BrandSplash() {
  const [phase, setPhase] = useState<'enter' | 'shown' | 'exit' | 'done'>(() => (shouldShow() ? 'enter' : 'done'));

  useEffect(() => {
    if (phase === 'done') return;
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* sin almacenamiento: se muestra en cada carga */
    }
    const raf = requestAnimationFrame(() => setPhase((p) => (p === 'enter' ? 'shown' : p)));
    const toExit = window.setTimeout(() => setPhase('exit'), ENTER_MS + HOLD_MS);
    const toDone = window.setTimeout(() => setPhase('done'), ENTER_MS + HOLD_MS + EXIT_MS);
    const skip = () => setPhase('done');
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(toExit);
      window.clearTimeout(toDone);
      window.removeEventListener('keydown', skip);
    };
    // Sólo al montar: las fases siguientes las manejan los timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done') return null;
  const visible = phase === 'shown' || phase === 'exit';
  return (
    <div
      onClick={() => setPhase('done')}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-4 bg-neutral-950 cursor-pointer"
      style={{ opacity: phase === 'exit' ? 0 : 1, transition: `opacity ${EXIT_MS}ms ease-in` }}
    >
      <img
        src="/brand/khimea-games-logo.png"
        alt="Khimea Games"
        width={320}
        height={166}
        className="w-[min(320px,70vw)] h-auto select-none"
        draggable={false}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          transition: `opacity ${ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      />
      <span className="text-xs font-mono tracking-[0.3em] uppercase text-neutral-400">Music Studio</span>
    </div>
  );
}
