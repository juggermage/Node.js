const { WORK_DAY, RESTRICTED_WINDOWS } = require("./schedules.config");

// Чиста логіка без доступу до бази: час, перетини, режим дня.

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart);
}

// null у validTo означає, що розклад діє без кінцевої дати.
function periodsOverlap(a, b) {
  const aEndsBeforeBStarts = a.validTo !== null && a.validTo < b.validFrom;
  const bEndsBeforeAStarts = b.validTo !== null && b.validTo < a.validFrom;

  return !aEndsBeforeBStarts && !bEndsBeforeAStarts;
}

function isInsideWorkDay(startTime, endTime) {
  return (
    toMinutes(startTime) >= toMinutes(WORK_DAY.start) &&
    toMinutes(endTime) <= toMinutes(WORK_DAY.end)
  );
}

function findRestrictedWindow(startTime, endTime) {
  return (
    RESTRICTED_WINDOWS.find((window) =>
      timeRangesOverlap(startTime, endTime, window.start, window.end)
    ) || null
  );
}

// Перше заняття зі списку, яке в той самий день перетинається з кандидатом за часом.
// Заняття з excludeItemId (те, що редагується) ігнорується.
function findTimeOverlap(candidate, items, excludeItemId = null) {
  return (
    items.find(
      (item) =>
        item.id !== excludeItemId &&
        item.dayOfWeek === candidate.dayOfWeek &&
        timeRangesOverlap(candidate.startTime, candidate.endTime, item.startTime, item.endTime)
    ) || null
  );
}

// Те саме, але лише серед занять з тим самим викладачем або кімнатою (key).
function findResourceConflict(candidate, items, key, excludeItemId = null) {
  if (!candidate[key]) {
    return null;
  }

  const sameResource = items.filter((item) => String(item[key]) === String(candidate[key]));

  return findTimeOverlap(candidate, sameResource, excludeItemId);
}

module.exports = {
  toMinutes,
  timeRangesOverlap,
  periodsOverlap,
  isInsideWorkDay,
  findRestrictedWindow,
  findTimeOverlap,
  findResourceConflict
};
