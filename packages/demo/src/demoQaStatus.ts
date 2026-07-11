/** Add ids only after James explicitly approves an experience during manual demo QA. */
export const DEMO_QA_PASSED_IDS: readonly string[] = [];

export function hasPassedDemoQa(experienceId: string): boolean {
  return DEMO_QA_PASSED_IDS.includes(experienceId);
}
