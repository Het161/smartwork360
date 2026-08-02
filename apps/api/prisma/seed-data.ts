/**
 * Curated content pools for the seed.
 *
 * Hand-written rather than faker-generated: faker's Indian locale produces
 * name/designation/task combinations that read as fake to anyone who has seen a
 * district office. This data is what sells the demo, so it is authored.
 */

export interface DeptSpec {
  code: string;
  name: string;
  nameHi: string;
}

export const DEPARTMENTS: DeptSpec[] = [
  { code: 'REV', name: 'Revenue', nameHi: 'राजस्व' },
  { code: 'PWD', name: 'Public Works', nameHi: 'लोक निर्माण' },
  { code: 'HLT', name: 'Health', nameHi: 'स्वास्थ्य' },
  { code: 'EDU', name: 'Education', nameHi: 'शिक्षा' },
];

export interface PersonSpec {
  name: string;
  designation: string;
  dept: string;
  /** Marks the planted demo characters so the seed can shape their history. */
  persona?: 'burnout' | 'fraud' | 'star';
}

export const ADMIN: PersonSpec = {
  name: 'Rajesh Iyer',
  designation: 'Deputy Collector',
  dept: 'REV',
};

export const MANAGERS: PersonSpec[] = [
  { name: 'Sunita Deshmukh', designation: 'Tehsildar', dept: 'REV' },
  { name: 'Anil Kulkarni', designation: 'Executive Engineer', dept: 'PWD' },
  { name: 'Meera Nair', designation: 'District Health Officer', dept: 'HLT' },
  { name: 'Pradeep Sharma', designation: 'Block Education Officer', dept: 'EDU' },
];

export const EMPLOYEES: PersonSpec[] = [
  // --- Revenue ---
  { name: 'Vikas Meena', designation: 'Revenue Inspector', dept: 'REV', persona: 'fraud' },
  { name: 'Kavita Joshi', designation: 'Section Officer', dept: 'REV', persona: 'star' },
  { name: 'Arun Prasad', designation: 'Junior Clerk', dept: 'REV' },
  { name: 'Shabana Qureshi', designation: 'Senior Assistant', dept: 'REV' },
  { name: 'Deepak Rathore', designation: 'Field Inspector', dept: 'REV' },
  // --- Public Works ---
  { name: 'Ramesh Patel', designation: 'Junior Engineer', dept: 'PWD', persona: 'burnout' },
  { name: 'Neha Bhosale', designation: 'Section Officer', dept: 'PWD' },
  { name: 'Imran Sheikh', designation: 'Site Supervisor', dept: 'PWD' },
  { name: 'Sanjay Yadav', designation: 'Junior Clerk', dept: 'PWD' },
  { name: 'Priya Menon', designation: 'Assistant Engineer', dept: 'PWD' },
  // --- Health ---
  { name: 'Aarti Kulkarni', designation: 'ANM Supervisor', dept: 'HLT' },
  { name: 'Mohammed Farhan', designation: 'Health Inspector', dept: 'HLT' },
  { name: 'Lata Krishnan', designation: 'Senior Assistant', dept: 'HLT', persona: 'star' },
  { name: 'Rohit Bansal', designation: 'Data Entry Operator', dept: 'HLT' },
  { name: 'Sneha Pillai', designation: 'Programme Assistant', dept: 'HLT' },
  // --- Education ---
  { name: 'Ganesh Iyer', designation: 'Cluster Resource Coordinator', dept: 'EDU' },
  { name: 'Rekha Tiwari', designation: 'Section Officer', dept: 'EDU' },
  { name: 'Farhan Ansari', designation: 'Junior Clerk', dept: 'EDU' },
  { name: 'Ritu Chauhan', designation: 'Field Inspector', dept: 'EDU' },
  { name: 'Suresh Gowda', designation: 'Senior Assistant', dept: 'EDU' },
];

/** Task title pools per department — the vocabulary of an actual district office. */
export const TASK_TITLES: Record<string, string[]> = {
  REV: [
    'Verify land mutation records — Ward 12',
    'Process caste certificate applications — Naroda circle',
    'Field survey for encroachment complaint — Survey No. 214/2',
    'Reconcile land revenue collection register — Q3',
    'Digitise 7/12 extracts — Vastral village',
    'Issue income certificates — pending backlog batch 4',
    'Boundary demarcation dispute — Plot 88, Odhav',
    'Verify domicile applications received via e-District',
    'Prepare drought relief beneficiary list — Taluka 3',
    'Audit stamp duty collection — sub-registrar office',
    'Update tenancy records after inheritance claim — Case 1142',
    'Scrutiny of agricultural land conversion request — NA 27',
    'Compile crop damage assessment report — unseasonal rain',
    'Verify pension applications — old age scheme batch 9',
    'Resolve dual-entry in property register — Ward 7',
  ],
  PWD: [
    'Pothole repair tender scrutiny — NH bypass',
    'Quality inspection of road resurfacing — Sector 21 approach road',
    'Prepare estimate for culvert reconstruction — Km 14',
    'Monsoon drainage desilting — Zone B',
    'Verify contractor bill — school building phase 2',
    'Structural safety audit — old district court annexe',
    'Street light restoration — Gandhi Nagar ward',
    'Site inspection for community hall construction',
    'Measurement book verification — bridge railing work',
    'Process third-party quality audit report — RCC drain',
    'Tender evaluation for footpath paving — Ring Road',
    'Repair of PHC boundary wall — Naroda',
    'Update asset register for departmental vehicles',
    'Inspect water pipeline leakage complaint — Ward 19',
    'Prepare BOQ for anganwadi renovation — 6 sites',
  ],
  HLT: [
    'Vaccination camp logistics — PHC Naroda',
    'Cold chain equipment audit — 4 sub-centres',
    'Compile monthly maternal health indicators — HMIS',
    'Dengue hotspot fogging schedule — Ward 14',
    'Stock verification of essential drugs — district store',
    'ASHA worker incentive disbursement verification',
    'Investigate food poisoning complaint — mid-day meal',
    'Update TB patient follow-up register — NIKSHAY',
    'Prepare NCD screening camp roster — 8 villages',
    'Ambulance readiness inspection — 108 fleet',
    'Verify Ayushman Bharat claim documents — batch 12',
    'Water sample collection for potability testing',
    'Monthly immunisation coverage review — Block 2',
    'Sanitation audit of sub-district hospital',
    'Process biomedical waste disposal compliance report',
  ],
  EDU: [
    'Verify mid-day meal attendance registers — 12 schools',
    'Textbook distribution status — Block 4',
    'Scrutinise scholarship applications — pre-matric SC/ST',
    'School infrastructure grant utilisation certificate',
    'Teacher attendance biometric compliance review',
    'Prepare UDISE+ data validation report',
    'Inspect drinking water facility — 9 primary schools',
    'Conduct learning outcome assessment — Class 5',
    'Process transfer requests — assistant teachers',
    'Verify RTE 25% admission records — private schools',
    'Smart classroom equipment installation follow-up',
    'Compile dropout tracking report — adolescent girls',
    'School safety and fire audit — secondary schools',
    'Distribute uniform grant DBT — pending beneficiaries',
    'Review Vidya Pravesh readiness — Block 1',
  ],
};

export const TASK_DESCRIPTIONS: Record<string, string[]> = {
  REV: [
    'Cross-check the applicant submissions against the village land register and record findings in the case file. Attach the field verification note before forwarding.',
    'Physical verification is required at the site. Coordinate with the village accountant and submit a signed report with photographs.',
    'Reconcile the entries with the treasury statement for the same period and flag any variance above ₹5,000 for the Tehsildar.',
  ],
  PWD: [
    'Carry out a joint measurement with the contractor and record the readings in the measurement book. Deviations beyond 5% need the Executive Engineer approval.',
    'Inspect the work site, photograph the current condition, and prepare a revised estimate if the scope has changed since sanction.',
    'Verify the bill against the sanctioned estimate and the third-party quality report before recommending release of payment.',
  ],
  HLT: [
    'Coordinate with the block medical officer for staff deployment and confirm cold-chain availability a day in advance.',
    'Compile the indicator-wise figures from the sub-centre registers, validate against HMIS entries, and report discrepancies.',
    'Conduct the inspection with the checklist prescribed in the state guidelines and upload the signed report to the portal.',
  ],
  EDU: [
    'Visit the listed schools, verify records against the portal entries, and obtain the head teacher countersignature on the inspection note.',
    'Scrutinise the applications for eligibility and document completeness. Return incomplete files with a written deficiency memo.',
    'Compile school-wise figures, reconcile with the block totals, and submit the consolidated statement to the BEO office.',
  ],
};

/** Task-update note pools, keyed by sentiment tone. Natural English + Hinglish. */
export const UPDATE_NOTES = {
  positive: [
    'Verification completed, records matched. Forwarding the file today.',
    'Site visit done sir, no issues found. Report ready hai.',
    'Contractor was cooperative, joint measurement finished ahead of schedule.',
    'All documents received and cleared. Kaam ho gaya, closing this.',
    'Data reconciled with the portal — no variance. Good to close.',
    'Camp went smoothly, turnout was better than expected.',
    'Head teacher provided all registers immediately, inspection done on time.',
    'Sub-centre staff supported well, cold chain audit completed without any issue.',
    'Backlog cleared, batch submitted to the Tehsildar for signature.',
    'Thanks for the quick approval — dispatched the sanction letter today.',
    'Field team did a good job, all 9 sites covered in one day.',
    'Discrepancy resolved after cross-checking the old register. Theek hai now.',
  ],
  neutral: [
    'Started the verification, will update after the field visit.',
    'File received from the branch, taking up for scrutiny.',
    'Sent a reminder to the sub-registrar office for the pending statement.',
    'Awaiting the third-party quality report before proceeding.',
    'Coordinating with the block office for the schedule.',
    'Photographs uploaded to the case file for record.',
    'Have requested the applicant to submit the missing annexure.',
    'Site visit scheduled for tomorrow morning.',
    'Draft note prepared, sending for internal review.',
    'Measurement book entries partially completed, will finish this week.',
    'Discussed with the contractor, awaiting revised BOQ.',
    'Data entry in progress for the remaining sub-centres.',
  ],
  negative: [
    'Applicant documents are incomplete again, this is the third time. Very frustrating.',
    'Delay ho raha hai because the village accountant is on leave, no alternate arrangement.',
    'Contractor has not responded to two notices. Work is completely stuck.',
    'Bahut load is there this week, I am not able to finish this on time.',
    'Records are missing from the old register. Samajh nahi aa raha how to proceed.',
    'Cold chain unit failed again, no support from the maintenance vendor.',
    'Staff shortage is a serious problem, we are understaffed at the sub-centre.',
    'This file has been pending hai for 3 weeks, no response from the higher office.',
    'Site inspection could not happen, vehicle was not available. Very disappointing.',
    'I am exhausted, too many tasks assigned this week and everything is urgent.',
    'Portal is not working since morning, unable to upload the report.',
    'Escalated to the Executive Engineer, the quality of work is unacceptable.',
    'Dikkat is that the sanction amount is short, revised estimate will take time.',
    'Data mismatch found again, will have to redo the whole reconciliation. Pareshan ho gaya.',
  ],
} as const;

export const REVIEW_NOTES = {
  approve: [
    'Records verified and found in order. Approved.',
    'Field report is satisfactory. Approved for closure.',
    'Documentation complete, no deviation noted. Approved.',
    'Measurements tally with the sanctioned estimate. Approved.',
    'Good work, cleared for payment processing.',
  ],
  reject: [
    'Photographs of the site are missing. Please attach and resubmit.',
    'The reconciliation statement does not tally. Sending back for correction.',
    'Deficiency memo not attached to the returned applications. Resubmit.',
    'Joint measurement signature of the contractor is missing.',
  ],
} as const;

export const ANNOUNCEMENTS = [
  {
    title: 'Quarterly performance review — 15th',
    body: 'All section officers to submit pending file statements by the 12th.',
  },
  {
    title: 'e-Office training (Hindi/English)',
    body: 'Two batches scheduled at the district training centre. Nominate one person per section.',
  },
  {
    title: 'Monsoon preparedness circular',
    body: 'Departments to confirm drainage desilting status to the Collectorate.',
  },
];
