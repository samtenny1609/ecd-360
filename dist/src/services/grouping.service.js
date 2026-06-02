"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupingService = exports.GroupingService = void 0;
const types_1 = require("../types");
const audit_service_1 = require("./audit.service");
class GroupingService {
    /**
     * Deterministic grouping logic. Purely based on gathered responses.
     */
    async classifyCycleResponses(cycleId, ageInMonths, responses) {
        // Group responses by Domain
        const domainMap = new Map();
        for (const r of responses) {
            if (!domainMap.has(r.domain)) {
                domainMap.set(r.domain, []);
            }
            domainMap.get(r.domain).push(r);
        }
        const results = [];
        // Evaluate each domain
        for (const [domain, domResponses] of domainMap.entries()) {
            let positive = 0;
            let negative = 0;
            let neutral = 0;
            let excluded = 0;
            const rawDist = {};
            for (const res of domResponses) {
                rawDist[res.response_value] = (rawDist[res.response_value] || 0) + 1;
                if (res.response_value === types_1.ResponseCode.OFTEN || res.response_value === types_1.ResponseCode.SOMETIMES) {
                    positive++;
                }
                else if (res.response_value === types_1.ResponseCode.NOT_YET) {
                    negative++;
                }
                else if (res.response_value === types_1.ResponseCode.NEUTRAL) {
                    neutral++;
                }
                else if (res.response_value === types_1.ResponseCode.REMIND_LATER) {
                    excluded++;
                }
            }
            const nTotal = positive + negative + neutral;
            const nEff = positive + negative + neutral; // Note: currently same as N_total per spec
            let groupOutput = "";
            let gateFired = null;
            let ruleMatched = null;
            // Ensure we guard against division by zero 
            const getPercent = (count, denom) => {
                if (denom === 0)
                    return 0;
                return Number(((count / denom) * 100).toFixed(1));
            };
            const neutralPct = getPercent(neutral, nEff);
            const positivePct = getPercent(positive, nEff);
            const negativePct = getPercent(negative, nEff);
            // --- EVALUATE EDGE GATES (strictly in order) ---
            if (nTotal < 3) {
                gateFired = "Gate 1: N_total < 3";
                groupOutput = "INCOMPLETE";
            }
            else if (neutralPct >= 60.0) {
                gateFired = "Gate 2: NEUTRAL% >= 60%";
                groupOutput = "SEEK_SUPP";
            }
            else if (nEff < 3) {
                gateFired = "Gate 2B: N_eff < 3";
                groupOutput = "INCOMPLETE";
            }
            else {
                // --- EVALUATE MAIN RULES ---
                if (positivePct === 0.0 && negativePct >= 80.0) {
                    ruleMatched = 1;
                    groupOutput = "SEEK_SUPP"; // immediate
                }
                else if (positivePct < 20.0 && negativePct >= 60.0) {
                    ruleMatched = 2;
                    groupOutput = "SEEK_SUPP"; // advised
                }
                else if (positivePct >= 60.0 && negativePct <= 40.0) {
                    ruleMatched = 3;
                    groupOutput = "ACT_DEV";
                }
                else if (positivePct >= 20.0 && negativePct < 60.0) {
                    ruleMatched = 4;
                    groupOutput = "STS";
                }
                else if (positivePct < 20.0 && negativePct < 60.0) {
                    ruleMatched = 5;
                    groupOutput = "NEEDS_ATTN";
                }
                else {
                    // Rule 6: Default Fallthrough
                    // For instance, boundary case P%=20.0 and Neg%=60.0 falls here
                    ruleMatched = 6;
                    groupOutput = "SEEK_SUPP"; // immediate
                }
            }
            // Add to results
            results.push({
                domain: String(domain),
                group: groupOutput
            });
            // Fire and forget Audit Log
            audit_service_1.auditService.logClassification({
                cycle_id: cycleId,
                domain,
                positive_count: positive,
                negative_count: negative,
                neutral_count: neutral,
                excluded_count: excluded,
                gate_fired: gateFired,
                rule_matched: ruleMatched,
                group_output: groupOutput,
                shadow_ml_input: {
                    domain,
                    responses: Object.entries(rawDist).map(([value, count]) => ({ value, count })),
                    age_in_months: ageInMonths
                }
            }).catch(err => {
                console.error("Non-blocking error during audit log:", err);
            });
        }
        return results;
    }
}
exports.GroupingService = GroupingService;
exports.groupingService = new GroupingService();
