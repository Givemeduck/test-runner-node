const AxeBuilder = require("@axe-core/playwright").default;

async function checkAccessibility(page) {
  const report = await new AxeBuilder({
    page,
  })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  if (report.violations.length === 0) {
    return {
      success: true,
      details: "No automated WCAG A or AA violations detected.",
      violations: [],
      affectedElements: 0,
    };
  }

  const affectedElements = report.violations.reduce(
    (total, violation) => total + violation.nodes.length,
    0,
  );

  const summary = report.violations
    .map((violation) => {
      const impact = violation.impact || "impact unknown";

      return (
        `${violation.id} (${impact}): ` +
        `${violation.nodes.length} affected element(s)`
      );
    })
    .join(" | ");

  return {
    success: false,

    details:
      `${report.violations.length} accessibility ` +
      `violation type(s) found across ` +
      `${affectedElements} affected element(s). ` +
      summary,

    // This contains the complete axe-core results,
    // not only the violations displayed in the summary.
    violations: report.violations,

    affectedElements,
  };
}

module.exports = checkAccessibility;
