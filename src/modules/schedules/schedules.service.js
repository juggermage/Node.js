// src/modules/schedules/schedules.service.js

let schedules = [];
let nextId = 1;

class ScheduleService {
  // 1. Покращена валідація дати (блокує 2026-02-30)
  _isValidDate(dateString) {
    if (typeof dateString !== "string") return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;

    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    // Перевіряємо, чи не "переповнився" час (наприклад, 30 лютого стане 2 березня)
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  _isValidTime(timeString) {
    if (typeof timeString !== "string") return false;
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(timeString);
  }

  _timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(":").map(Number);
    return hours * 60 + minutes;
  }

  _hasTimeConflict(date, startTime, endTime, excludeId = null) {
    const newStart = this._timeToMinutes(startTime);
    const newEnd = this._timeToMinutes(endTime);

    return schedules.find((lesson) => {
      if (excludeId && lesson.id === excludeId) return false;
      if (lesson.date !== date) return false;

      const existingStart = this._timeToMinutes(lesson.startTime);
      const existingEnd = this._timeToMinutes(lesson.endTime);

      return newStart < existingEnd && newEnd > existingStart;
    });
  }

  // Перевірка тіла запиту для POST
  _validateCreateBody(body) {
    if (!body || Object.keys(body).length === 0) {
      throw { code: "EMPTY_BODY", message: "Тіло запиту не може бути порожнім" };
    }
    if (body.id !== undefined) {
      throw {
        code: "ID_NOT_ALLOWED",
        message: "Поле id генерується автоматично і не може бути передане"
      };
    }
    if (body.title !== undefined && typeof body.title !== "string") {
      throw { code: "INVALID_TITLE_TYPE", message: "Поле title має бути рядком" };
    }
  }

  // Перевірка тіла запиту для PATCH
  _validateUpdateBody(body) {
    if (!body || Object.keys(body).length === 0) {
      throw { code: "EMPTY_BODY", message: "Тіло запиту не може бути порожнім" };
    }
    if (body.id !== undefined) {
      throw { code: "ID_NOT_ALLOWED", message: "Зміна поля id заборонена" };
    }
    if (body.title !== undefined && typeof body.title !== "string") {
      throw { code: "INVALID_TITLE_TYPE", message: "Поле title має бути рядком" };
    }
  }

  getAll(filterDate = null) {
    if (filterDate) {
      // Валідація query-параметра date
      if (!this._isValidDate(filterDate)) {
        throw {
          code: "INVALID_DATE_FORMAT",
          message: "Параметр date має бути у форматі YYYY-MM-DD та бути реальною датою"
        };
      }
      return schedules.filter((lesson) => lesson.date === filterDate);
    }
    return schedules;
  }

  getById(id) {
    return schedules.find((lesson) => lesson.id === id);
  }

  create(data) {
    this._validateCreateBody(data);

    const { date, startTime, endTime, title } = data;

    if (!this._isValidDate(date)) {
      throw {
        code: "INVALID_DATE_FORMAT",
        message: "Дата має бути у форматі YYYY-MM-DD та існувати в календарі"
      };
    }
    if (!this._isValidTime(startTime) || !this._isValidTime(endTime)) {
      throw { code: "INVALID_TIME_FORMAT", message: "Час має бути у форматі HH:MM" };
    }

    if (this._timeToMinutes(endTime) <= this._timeToMinutes(startTime)) {
      throw {
        code: "INVALID_TIME_RANGE",
        message: "Час завершення не може бути раніше або дорівнювати часу початку"
      };
    }

    const conflict = this._hasTimeConflict(date, startTime, endTime);
    if (conflict) {
      throw {
        code: "SCHEDULE_CONFLICT",
        message: "Час заняття перетинається з іншим заняттям на цю дату"
      };
    }

    const newLesson = {
      id: String(nextId++),
      date,
      startTime,
      endTime,
      title: title || "Без назви"
    };

    schedules.push(newLesson);
    return newLesson;
  }

  update(id, data) {
    this._validateUpdateBody(data);

    const index = schedules.findIndex((lesson) => lesson.id === id);
    if (index === -1) return null;

    const existingLesson = schedules[index];

    const date = data.date !== undefined ? data.date : existingLesson.date;
    const startTime = data.startTime !== undefined ? data.startTime : existingLesson.startTime;
    const endTime = data.endTime !== undefined ? data.endTime : existingLesson.endTime;
    const title = data.title !== undefined ? data.title : existingLesson.title;

    if (!this._isValidDate(date)) {
      throw {
        code: "INVALID_DATE_FORMAT",
        message: "Дата має бути у форматі YYYY-MM-DD та існувати в календарі"
      };
    }
    if (!this._isValidTime(startTime) || !this._isValidTime(endTime)) {
      throw { code: "INVALID_TIME_FORMAT", message: "Час має бути у форматі HH:MM" };
    }
    if (this._timeToMinutes(endTime) <= this._timeToMinutes(startTime)) {
      throw {
        code: "INVALID_TIME_RANGE",
        message: "Час завершення не може бути раніше або дорівнювати часу початку"
      };
    }

    const conflict = this._hasTimeConflict(date, startTime, endTime, id);
    if (conflict) {
      throw {
        code: "SCHEDULE_CONFLICT",
        message: "Час заняття перетинається з іншим заняттям на цю дату"
      };
    }

    const updatedLesson = { id, date, startTime, endTime, title };
    schedules[index] = updatedLesson;
    return updatedLesson;
  }

  delete(id) {
    const index = schedules.findIndex((lesson) => lesson.id === id);
    if (index === -1) return false;

    schedules.splice(index, 1);
    return true;
  }
}

module.exports = new ScheduleService();
