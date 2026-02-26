export interface EvalRunnerScaffold {
  ready: true;
}

export function createEvalRunnerScaffold(): EvalRunnerScaffold {
  return { ready: true };
}
