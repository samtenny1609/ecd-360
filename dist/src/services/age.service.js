"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAgeInMonths = void 0;
const calculateAgeInMonths = (dateOfBirth, cycleDate) => {
    const start = new Date(dateOfBirth);
    const end = new Date(cycleDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid date provided for calculation.");
    }
    if (end < start) {
        throw new Error("Cycle date cannot be before Date of Birth.");
    }
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();
    let totalMonths = yearDiff * 12 + monthDiff;
    // Strict check: If the day of the cycle is before the birth day, subtract one month.
    // This ensures we only count completed months.
    if (end.getDate() < start.getDate()) {
        // Note: this naturally handles leap years and differing month lengths via the internal Date logic,
        // but the day comparison might need refinement for end-of-month cases (e.g., Jan 31 -> Feb 28).
        // Let's refine for month boundaries:
        // If end is the last day of the month, and start day is > end day, we shouldn't penalize it if it's the strict end of month.
        // However, the rule states: "no grace window. Adjustment: If cycle_day < birth_day → subtract 1".
        const isEndOfEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate() === end.getDate();
        const isStartDayHigher = start.getDate() > end.getDate();
        if (isStartDayHigher && (!isEndOfEndMonth || start.getMonth() === end.getMonth())) {
            totalMonths -= 1;
        }
    }
    return totalMonths;
};
exports.calculateAgeInMonths = calculateAgeInMonths;
