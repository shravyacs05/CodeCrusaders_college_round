/** Plain-English definitions for the KPI cards that carry an (i) button.
 *  Each one mirrors how the backend actually computes the number (verifier.py, reconciler.py,
 *  checklist_auditor.py, robustness_radar.py, xai_explainer.py, versioning.py) and is sent to
 *  the assistant as the authoritative definition, so keep them in sync with that code. */
export type KpiDefinition = { title: string; text: string }

export const KPI: Record<string, KpiDefinition> = {
  // ---- project header ----
  project_status: {
    title: 'Project Status',
    text: 'Where the project is in the pipeline: CREATED (uploaded), ANALYZED (paper and repo reconciled, spec v1 built), then REPRODUCED / NOT_REPRODUCED once runs have been verified against the published claim.',
  },

  // ---- Analysis ----
  compliance_index: {
    title: 'Compliance Index & Grade',
    text: 'Weighted score over 8 NeurIPS/ICLR-style checklist items (repo accessible, runnable entrypoint, seed flag, multiple seeds run, no preprocessing leakage, paper/code hyperparameters consistent, claim verified in the PDF text, run manifest recorded). PASS earns the full weight, WARN half, FAIL nothing. Grade: A+ ≥ 90%, B ≥ 75%, C ≥ 50%, otherwise F.',
  },
  leakage_status: {
    title: 'Data Leakage Check',
    text: 'Static AST scan of the repository for two rules: a preprocessor (scaler, encoder, etc.) fitted before the train/test split, and a preprocessor fitted on the entire dataset. Any hit means test data can influence training, which inflates the reported metric. "0 leaks" only means neither pattern was found, not that leakage is impossible.',
  },
  claim_target: {
    title: 'Published Claim to Verify',
    text: 'The headline metric and value the paper reports, extracted from the PDF together with its exact quote and page. It is only accepted if the quote is found verbatim on that page. Reproduced runs are compared against this number; without it, verification is BLOCKED.',
  },
  reconciliation: {
    title: 'Reconciliation (Paper vs Code)',
    text: 'Each hyperparameter is compared between the paper and the code defaults after normalizing names (lr ↔ learning_rate). MATCH: both agree (severity none). MISMATCH: different values (high). MISSING: set in code but never stated in the paper (high). ONLY_IN_PAPER: stated in the paper but not found in code (medium). ONLY_IN_CODE: low. High-severity rows are the most likely to explain a failed reproduction.',
  },

  // ---- Graph ----
  graph_stage: {
    title: 'Pipeline Stage',
    text: 'One stage of the experiment spec (Dataset → Preprocessing → Model → Training → Evaluation → Compare). Each tracked parameter shows its value and provenance: PAPER (quoted from the PDF), CODE (found in the repo), USER (edited here), INFERRED, UNVERIFIED or MISSING. Editing an injectable parameter creates a new child version of the spec. The border shows run state: pending, running, done or failed.',
  },

  // ---- Run ----
  run_progress: {
    title: 'Execution Progress',
    text: 'How many of the requested seeds have finished. Each seed is a separate run of the same spec with a different random seed, so the spread of the results can be measured.',
  },
  stage_status: {
    title: 'Execution Stage Status',
    text: 'State of each stage of the run (Dataset, Preprocessing, Model, Training, Evaluation, Compare): pending, running, done or failed. A failed stage shows where execution broke.',
  },
  seed_metric: {
    title: 'Per-Seed Metric',
    text: 'The metric value each seed wrote to its metrics.json when the run finished, chosen to match the paper\'s claimed metric. It is never parsed from LLM output. Fractions are scaled to percent when the claim is a percentage. Identical values across seeds usually mean the code ignores the --seed argument.',
  },
  isolation: {
    title: 'Isolation Sandbox',
    text: 'How each run was sandboxed. Docker: non-root container with no network access (strongest). Virtualenv: a fresh Python environment on the host, so isolation is reduced.',
  },

  // ---- Verify ----
  verdict: {
    title: 'Reproducibility Verdict',
    text: 'REPRODUCED: |reproduced mean − published| ≤ tolerance. PARTIALLY_REPRODUCED: outside tolerance, but the published value lies inside the observed seed min–max range or within mean ± 2 std. NOT_REPRODUCED: neither. BLOCKED: no verified claim or no successful runs.',
  },
  tolerance_rule: {
    title: 'Tolerance Rule',
    text: 'The fixed rule used to decide the verdict. The tolerance is in percentage points (pp) and comes from TOLERANCE_PP in the server config (default 1.0).',
  },
  published_claim: {
    title: 'Published Claim',
    text: 'The metric value the paper reports, extracted from the PDF. It is the target the reproduced mean is compared against.',
  },
  reproduced_mean: {
    title: 'Reproduced Mean',
    text: 'Average of the metric over all successful seeds (n). This is the number compared with the published claim.',
  },
  metric_delta: {
    title: 'Metric Delta',
    text: 'Reproduced mean minus published claim, in percentage points (pp). Negative means the reproduction scored lower than the paper. Shown green when |delta| is within the tolerance.',
  },
  std_dispersion: {
    title: 'Dispersion (Std)',
    text: 'Sample standard deviation of the metric across seeds, with the min–max range. It shows how sensitive the result is to randomness; a large std makes a single published number less reliable. With one seed it is 0.',
  },
  criteria_ledger: {
    title: 'Statistical Criteria',
    text: 'The two fallback checks behind PARTIALLY_REPRODUCED: (1) the published value lies inside the min–max range of the seeds, (2) |mean − published| ≤ 2 × std. They only matter when the delta is outside the tolerance.',
  },
  seed_chart: {
    title: 'Seed Dispersion Chart',
    text: 'One bar per seed with its metric value; the dashed red line is the published claim. Bars clustered on the line suggest the claim reproduces; bars straddling it mean the result depends on the seed.',
  },
  integrity_index: {
    title: 'Integrity Index',
    text: 'Heuristic composite (0–100), the average of six axis scores: Claim Fidelity (98 − 4 × |delta pp|), Seed Stability (95 − 10 × std), Data Shield (100 − 35 per leakage finding), Citation Fidelity (share of paper fields with a verbatim quote), Environment Lock (95 minus penalties for auto-repairs and scan warnings), Parameter Parity (share of MATCH findings). Each axis has a floor. When the stress sliders are moved it shows the perturbed score and "Baseline" shows the unperturbed one. It is a scoring heuristic, not a measured result.',
  },
  fragility: {
    title: 'Fragility (Cherry-Picking) Score',
    text: 'Simulated, not measured: 2.2 × (baseline composite − perturbed composite) under the stress sliders, using fixed penalty formulas, not new training runs. < 20 = ROBUST BASIN, < 45 = MODERATE SENSITIVITY, otherwise BRITTLE / CHERRY-PICKED. With the sliders at baseline it is 0. To truly test sensitivity, edit the parameter in the Graph tab and run the new version.',
  },
  stress_simulator: {
    title: 'Hyperparameter Stress Simulator',
    text: 'Sliders for learning-rate shift, batch-size scaling and seed noise. Moving them recomputes the radar with fixed penalty formulas (e.g. 60 points per 100% LR drift on Claim Fidelity); no code is executed. The "Projected Discrepancy" and the LR sensitivity bars are projections from those formulas, not experimental results.',
  },

  // ---- XAI ----
  xai_gap: {
    title: 'Gap from Published',
    text: 'Reproduced mean minus the published claim in percentage points: the discrepancy the contributing factors below try to explain.',
  },
  contributing_factors: {
    title: 'Contributing Factors (% of gap)',
    text: 'Heuristic attribution, not a causal measurement. Each non-matching parameter gets weight = sensitivity prior (e.g. learning_rate 0.45, batch_size 0.35, epochs 0.25, default 0.18) × status multiplier (MISMATCH 1.8 plus a log-ratio term and a bonus if the paper describes a schedule; ONLY_IN_PAPER 1.4; MISSING 0.9). Seed variance gets 0.08 × (1 + std). Shares are weights normalized to 100%, and impact = share × |gap|. To confirm a factor, change only that parameter in the Graph tab, run it and compare versions.',
  },

  // ---- Compare ----
  config_deltas: {
    title: 'Configuration Deltas',
    text: 'Every parameter whose value differs between the two selected versions. If exactly one changed, any metric difference can be attributed to it (single-factor comparison).',
  },
  metric_impact: {
    title: 'Empirical Metric Impact',
    text: 'Reproduced mean of the "to" version minus that of the "from" version, in percentage points. Both versions need successful runs. Only a single-factor change lets you attribute this shift to one parameter.',
  },
}
