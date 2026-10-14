/**
 * CUR payroll procedure, client side.
 *
 * Mirrors backend/app/Services/PayrollCalculator.php so screens can show a live
 * breakdown while HR types. The rates, PAYE bands and responsibility amounts come
 * from GET /api/hr/payroll/rules, so nothing is hard-coded here. The server
 * recalculates everything on save and is the source of truth.
 */
import type { PayrollRules, PayeBand } from "@/services/hrService";

export interface PayrollInput {
  basicSalary: number;
  /** Responsibility allowance amount for the employee's role (0 when none). */
  responsibilityAmount: number;
  arrears: number;
  otherDeductions: number;
  /** RAMA (default) or OTHER for insurers such as RADIANT, where no RAMA is charged. */
  insurance?: "RAMA" | "OTHER";
  /** RADIANT premium per month (step 18), used only when insurance is OTHER. */
  insurancePremium?: number;
}

export interface PayrollBreakdown {
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  base_gross: number;
  responsibility_allowance: number;
  arrears: number;
  gross: number;
  paye: number;
  maternity_base: number;
  pension_employee: number;
  pension_employer: number;
  occupational_employer: number;
  maternity_employee: number;
  maternity_employer: number;
  rssb_employee_total: number;
  rama_employee: number;
  rama_employer: number;
  net_salary: number;
  cbhi: number;
  cbhi_employer: number;
  net_after_cbhi: number;
  other_deductions: number;
  net_pay: number;
  employer_cost: number;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Role codes in a stored list ("dean,internal_auditor"); empty for none. */
export function parseRoleCodes(value: string | null | undefined): string[] {
  const codes = (value ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  return [...new Set(codes)];
}

/** Responsibility allowance for a role list: the sum of each role's amount (0 for none). */
export function responsibilityAmount(
  rules: PayrollRules,
  roles: string | null | undefined,
): number {
  return parseRoleCodes(roles).reduce(
    (sum, code) =>
      sum + (rules.responsibility_roles.find((r) => r.code === code)?.amount ?? 0),
    0,
  );
}

/** Progressive monthly PAYE on total gross (procedure step 8). */
export function payePreview(taxable: number, bands: PayeBand[]): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const band of bands) {
    if (taxable <= lower) break;
    const upper = band.upper ?? Number.POSITIVE_INFINITY;
    tax += (Math.min(taxable, upper) - lower) * band.rate;
    lower = upper;
  }
  return round2(tax);
}

/** Runs steps 1–22 of the procedure. Same rounding order as the backend. */
export function computePayroll(
  input: PayrollInput,
  rules: PayrollRules,
): PayrollBreakdown {
  const r = rules.rates;
  const basic = round2(Math.max(0, input.basicSalary));

  const housing = round2(basic / 7);
  const transport = round2(basic / 7);
  const baseGross = round2(basic + housing + transport);

  const responsibility = round2(Math.max(0, input.responsibilityAmount));
  const arrears = round2(Math.max(0, input.arrears));
  const gross = round2(baseGross + responsibility + arrears);

  const paye = payePreview(gross, rules.paye_bands);
  const maternityBase = round2(gross - transport);

  const pensionEmployee = round2(gross * r.pension_employee);
  const pensionEmployer = round2(gross * r.pension_employer);
  const occupationalEmployer = round2(maternityBase * r.occupational_employer);
  const maternityEmployee = round2(maternityBase * r.maternity_employee);
  const maternityEmployer = round2(maternityBase * r.maternity_employer);
  // Employees on another insurer pay no RAMA, and CUR pays no RAMA share.
  const otherInsurance = input.insurance === "OTHER";
  const ramaEmployee = otherInsurance ? 0 : round2(maternityBase * r.rama_employee);
  const ramaEmployer = otherInsurance ? 0 : round2(maternityBase * r.rama_employer);

  const rssbEmployeeTotal = round2(pensionEmployee + maternityEmployee);
  // Steps 18–19: RADIANT premium for an employee on another insurer, taken before CBHI.
  const radiant = input.insurance === "OTHER" ? round2(Math.max(0, input.insurancePremium ?? 0)) : 0;
  const netSalary = round2(Math.max(0, gross - paye - rssbEmployeeTotal - ramaEmployee - radiant));

  const cbhi = round2(netSalary * r.cbhi_employee);
  const cbhiEmployer = round2(gross * r.cbhi_employer);
  const netAfterCbhi = round2(Math.max(0, netSalary - cbhi));

  const other = round2(Math.max(0, input.otherDeductions));
  const netPay = round2(Math.max(0, netAfterCbhi - other));

  return {
    basic_salary: basic,
    housing_allowance: housing,
    transport_allowance: transport,
    base_gross: baseGross,
    responsibility_allowance: responsibility,
    arrears,
    gross,
    paye,
    maternity_base: maternityBase,
    pension_employee: pensionEmployee,
    pension_employer: pensionEmployer,
    occupational_employer: occupationalEmployer,
    maternity_employee: maternityEmployee,
    maternity_employer: maternityEmployer,
    rssb_employee_total: rssbEmployeeTotal,
    rama_employee: ramaEmployee,
    rama_employer: ramaEmployer,
    net_salary: netSalary,
    cbhi,
    cbhi_employer: cbhiEmployer,
    net_after_cbhi: netAfterCbhi,
    other_deductions: other,
    net_pay: netPay,
    employer_cost: round2(
      gross + pensionEmployer + occupationalEmployer + maternityEmployer + ramaEmployer + cbhiEmployer,
    ),
  };
}
