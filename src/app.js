
const express = require("express");
const cors = require("cors");

// Імпорт маршрутів модулів
const childrenRoutes = require("./modules/children/children.routes");
const groupsRoutes = require("./modules/groups/groups.routes");
const parentsRoutes = require("./modules/parents/parents.routes");
const subjectsRoutes = require("./modules/subjects/subjects.routes");
const schedulesRoutes = require("./modules/schedules/schedules.routes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Перевірка роботи API
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running"
  });
});

// Підключення маршрутів
app.use("/api/v1/children", childrenRoutes);
app.use("/api/v1/groups", groupsRoutes);
app.use("/api/v1/parents", parentsRoutes);
app.use("/api/v1/subjects", subjectsRoutes);
app.use("/api/v1/schedules", schedulesRoutes);

module.exports = app;
