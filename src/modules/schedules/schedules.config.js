const WORK_DAY = { start: "08:00", end: "16:00" };

// 1 = понеділок ... 5 = п'ятниця
const WORKING_DAYS = [1, 2, 3, 4, 5];

// Під час цих інтервалів заняття (LESSON) проводити заборонено.
const RESTRICTED_WINDOWS = [
  { name: "BREAKFAST", start: "08:30", end: "09:00" },
  { name: "LUNCH", start: "12:00", end: "12:30" },
  { name: "SLEEP", start: "13:00", end: "14:00" },
  { name: "SNACK", start: "15:00", end: "15:30" }
];

module.exports = {
  WORK_DAY,
  WORKING_DAYS,
  RESTRICTED_WINDOWS
};
