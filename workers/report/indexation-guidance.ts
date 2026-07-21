/**
 * Re-export of the shared indexation guidance (spec C5) for report-side consumers.
 * The data lives in lib/shared so the web report can import it without pulling
 * worker code into the client bundle.
 */
export { INDEXATION_GUIDANCE, type IndexationStep } from '../../lib/shared/indexation-guidance';
