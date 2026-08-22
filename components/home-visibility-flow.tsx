import { AI_ENGINES, EngineLogo } from '@/components/ai-engines';
import {
  HOME_ENGINE_LABELS,
  HOME_EXAMPLE_ACTION,
  HOME_EXAMPLE_FINDING,
  HOME_EXAMPLE_LABEL,
  HOME_EXAMPLE_SCORES,
} from '@/components/home-visibility-flow-data';

export function HomeVisibilityFlow() {
  return (
    <div className="home-visibility-flow" aria-label="GEO-Pulse connects visibility signals from five answer engines to evidence and a practical next action">
      <p className="home-live-label">
        <span aria-hidden />
        Live product view
      </p>

      <div className="home-engine-stack" aria-label="Answer engines measured by GEO-Pulse">
        {AI_ENGINES.map((engine) => (
          <div className="home-engine-node" key={engine.key} data-engine={engine.key}>
            <span className="home-engine-logo-wrap" aria-hidden>
              <EngineLogo engine={engine} className="home-engine-logo" />
            </span>
            <span className="home-engine-name">{HOME_ENGINE_LABELS[engine.key]}</span>
            <span className="home-engine-connector" aria-hidden>
              <span />
            </span>
          </div>
        ))}
      </div>

      <div className="home-flow-hub" aria-hidden>
        <span className="home-hub-ring home-hub-ring-one" />
        <span className="home-hub-ring home-hub-ring-two" />
        <span className="material-symbols-outlined home-hub-pulse">graphic_eq</span>
        <span className="home-hub-output"><span /></span>
      </div>

      <article className="home-result-card" aria-label="Example GEO-Pulse visibility result">
        <div className="home-result-card-header">
          <p>Visibility across buyer questions</p>
          <span>{HOME_EXAMPLE_LABEL}</span>
        </div>

        <div className="home-score-overview">
          <div>
            <p className="home-score-value">72<span>/100</span></p>
            <p className="home-score-label">Overall visibility score</p>
          </div>
          <div className="home-score-bars" aria-label="Example visibility scores by engine">
            {AI_ENGINES.map((engine) => (
              <div className="home-score-bar" key={engine.key} aria-label={`${HOME_ENGINE_LABELS[engine.key]} ${HOME_EXAMPLE_SCORES[engine.key]} percent`}>
                <span className="home-score-number">{HOME_EXAMPLE_SCORES[engine.key]}</span>
                <span className="home-score-track" aria-hidden>
                  <span className={`home-score-fill home-score-fill-${engine.key}`} />
                </span>
                <span className="home-score-engine">{HOME_ENGINE_LABELS[engine.key]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="home-result-finding">
          <span className="material-symbols-outlined" aria-hidden>chat_bubble</span>
          <div>
            <p>Why competitors win</p>
            <span>{HOME_EXAMPLE_FINDING}</span>
          </div>
        </div>

        <div className="home-result-action">
          <span className="material-symbols-outlined" aria-hidden>task_alt</span>
          <p>{HOME_EXAMPLE_ACTION}</p>
          <span className="material-symbols-outlined" aria-hidden>arrow_forward</span>
        </div>
      </article>
    </div>
  );
}
