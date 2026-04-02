'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type LongWaitConfig = {
  readonly title: string;
  readonly description?: string;
  readonly note?: string;
  readonly steps: readonly string[];
  readonly delayMs?: number;
  readonly stepIntervalMs?: number;
};

type Session = {
  readonly id: number;
  readonly config: LongWaitConfig;
};

type LongWaitContextValue = {
  begin(config: LongWaitConfig): () => void;
};

const DEFAULT_DELAY_MS = 1400;
const DEFAULT_STEP_INTERVAL_MS = 1700;

const LongWaitContext = createContext<LongWaitContextValue | null>(null);

function LongWaitPanel({
  config,
  activeStep,
}: {
  config: LongWaitConfig;
  activeStep: number;
}) {
  return (
    <div className="pointer-events-auto w-full max-w-lg rounded-[28px] border border-white/55 bg-white/92 p-6 text-slate-900 shadow-[0_32px_80px_rgba(15,23,42,0.26)] backdrop-blur-xl md:p-7">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#103d38] text-white shadow-lg shadow-[#103d38]/25">
          <div className="loading-orbit relative h-6 w-6">
            <span className="absolute inset-0 rounded-full border border-white/25" />
            <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#f7c95f]" />
          </div>
        </div>
        <div>
          <p className="font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Longer Than Usual
          </p>
          <h2 className="font-headline text-2xl font-bold text-slate-900">{config.title}</h2>
        </div>
      </div>

      <p className="mt-4 font-body text-sm leading-6 text-slate-600">
        {config.description ?? 'Estimated processing steps are shown below while your request finishes.'}
      </p>

      <div className="loading-stripe mt-5 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-2/5 rounded-full bg-[#103d38]" />
      </div>

      <ol className="mt-5 space-y-3">
        {config.steps.map((step, index) => {
          const isComplete = index < activeStep;
          const isCurrent = index === activeStep;
          return (
            <li
              key={`${config.title}-${step}`}
              className={`flex items-start gap-3 rounded-2xl px-3 py-2 transition ${
                isCurrent ? 'bg-[#103d38]/8' : ''
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  isComplete
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : isCurrent
                      ? 'border-[#103d38] bg-[#103d38] text-white'
                      : 'border-slate-300 bg-white text-slate-400'
                }`}
              >
                {isComplete ? '✓' : index + 1}
              </span>
              <div>
                <p
                  className={`font-body text-sm ${
                    isCurrent ? 'font-semibold text-slate-900' : isComplete ? 'text-slate-700' : 'text-slate-500'
                  }`}
                >
                  {step}
                </p>
                {isCurrent ? (
                  <p className="mt-1 font-body text-xs text-slate-500">Estimated current step</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 font-body text-xs tracking-[0.02em] text-slate-500">
        {config.note ?? 'We only show this overlay when a request takes longer than the normal fast path.'}
      </p>
    </div>
  );
}

export function LongWaitProvider({ children }: { children: ReactNode }) {
  const nextIdRef = useRef(1);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [visibleSessionId, setVisibleSessionId] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const showTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const visibleSinceRef = useRef<number | null>(null);

  const currentSession = sessions.at(-1) ?? null;
  const visibleSession = visibleSessionId === null ? null : sessions.find((session) => session.id === visibleSessionId) ?? null;

  useEffect(() => {
    if (showTimeoutRef.current !== null) {
      window.clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }

    if (!currentSession) {
      const elapsed = visibleSinceRef.current ? Date.now() - visibleSinceRef.current : 0;
      const remaining = Math.max(0, 300 - elapsed);
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = window.setTimeout(() => {
        setVisibleSessionId(null);
        setActiveStep(0);
        visibleSinceRef.current = null;
      }, remaining);
      return;
    }

    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    showTimeoutRef.current = window.setTimeout(() => {
      setVisibleSessionId(currentSession.id);
      setActiveStep(0);
      visibleSinceRef.current = Date.now();
    }, currentSession.config.delayMs ?? DEFAULT_DELAY_MS);

    return () => {
      if (showTimeoutRef.current !== null) {
        window.clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }
    };
  }, [currentSession]);

  useEffect(() => {
    if (!visibleSession) return;
    const stepCount = visibleSession.config.steps.length;
    if (stepCount <= 1) return;

    const interval = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, stepCount - 1));
    }, visibleSession.config.stepIntervalMs ?? DEFAULT_STEP_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [visibleSession]);

  useEffect(() => {
    return () => {
      if (showTimeoutRef.current !== null) window.clearTimeout(showTimeoutRef.current);
      if (hideTimeoutRef.current !== null) window.clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const value = useMemo<LongWaitContextValue>(
    () => ({
      begin(config) {
        const id = nextIdRef.current++;
        setSessions((current) => [...current, { id, config }]);
        return () => {
          setSessions((current) => current.filter((session) => session.id !== id));
        };
      },
    }),
    []
  );

  return (
    <LongWaitContext.Provider value={value}>
      {children}
      {visibleSession ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/28 px-4 py-6 backdrop-blur-md">
          <LongWaitPanel config={visibleSession.config} activeStep={activeStep} />
        </div>
      ) : null}
    </LongWaitContext.Provider>
  );
}

export function useLongWaitEffect(active: boolean, config: LongWaitConfig): void {
  const context = useContext(LongWaitContext);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!context) return;

    if (active && !stopRef.current) {
      stopRef.current = context.begin(config);
      return;
    }

    if (!active && stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
  }, [active, config, context]);

  useEffect(() => {
    return () => {
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }
    };
  }, []);
}
