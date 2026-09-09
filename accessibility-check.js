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
    };
  }

  const summary = report.violations
    .slice(0, 5)
    .map((violation) => {
      return (
        `${violation.id}: ` + `${violation.nodes.length} affected element(s)`
      );
    })
    .join(" | ");

  return {
    success: false,
    details:
      `${report.violations.length} accessibility ` +
      `violation type(s) found. ${summary}`,
    violations: report.violations,
  };
}

module.exports = checkAccessibility;
