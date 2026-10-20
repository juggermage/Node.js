// src/modules/schedules/schedules.controller.js
const scheduleService = require('./schedules.service');

class ScheduleController {
  getAll(req, res) {
    try {
      const { date } = req.query;
      const data = scheduleService.getAll(date);
      
      res.status(200).json({ success: true, data });
    } catch (error) {
      if (error.code === 'INVALID_DATE_FORMAT') {
        return res.status(422).json({ success: false, error });
      }
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Внутрішня помилка сервера' }
      });
    }
  }

  getById(req, res) {
    const { id } = req.params;
    const data = scheduleService.getById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Заняття не знайдено' }
      });
    }

    res.status(200).json({ success: true, data });
  }

  create(req, res) {
    try {
      const newLesson = scheduleService.create(req.body);
      res.status(201).json({ success: true, data: newLesson });
    } catch (error) {
      // ВИПРАВЛЕНО: додано оператори ||
      if (error.code === 'SCHEDULE_CONFLICT') {
        return res.status(409).json({ success: false, error });
      }
      
      if (
        error.code === 'INVALID_DATE_FORMAT' || 
        error.code === 'INVALID_TIME_FORMAT' || 
        error.code === 'INVALID_TIME_RANGE' ||
        error.code === 'EMPTY_BODY' ||
        error.code === 'ID_NOT_ALLOWED' ||
        error.code === 'INVALID_TITLE_TYPE'
      ) {
        return res.status(422).json({ success: false, error });
      }
      
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Внутрішня помилка сервера' }
      });
    }
  }

  update(req, res) {
    const { id } = req.params;
    
    try {
      const updatedLesson = scheduleService.update(id, req.body);
      
      if (!updatedLesson) {
        return res.status(404).json({
          success: false,
          error: { code: 'SCHEDULE_NOT_FOUND', message: 'Заняття не знайдено' }
        });
      }

      res.status(200).json({ success: true, data: updatedLesson });
    } catch (error) {
      // ВИПРАВЛЕНО: додано оператори ||
      if (error.code === 'SCHEDULE_CONFLICT') {
        return res.status(409).json({ success: false, error });
      }
      
      if (
        error.code === 'INVALID_DATE_FORMAT' || 
        error.code === 'INVALID_TIME_FORMAT' || 
        error.code === 'INVALID_TIME_RANGE' ||
        error.code === 'EMPTY_BODY' ||
        error.code === 'ID_NOT_ALLOWED' ||
        error.code === 'INVALID_TITLE_TYPE'
      ) {
        return res.status(422).json({ success: false, error });
      }
      
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Внутрішня помилка сервера' }
      });
    }
  }

  delete(req, res) {
    const { id } = req.params;
    const isDeleted = scheduleService.delete(id);

    if (!isDeleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Заняття не знайдено' }
      });
    }

    res.status(204).send();
  }
}

module.exports = new ScheduleController();