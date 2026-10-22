const express = require("express");
const cors = require("cors");

const childrenRoutes = require("./modules/children/children.routes");
const groupsRoutes = require("./modules/groups/groups.routes");
const parentsRoutes = require("./modules/parents/parents.routes");
const subjectsRoutes = require("./modules/subjects/subjects.routes");
const schedulesRoutes = require("./modules/schedules/schedules.routes");

const errorHandler = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running"
  });
});

app.use("/api/v1/children", childrenRoutes);
app.use("/api/v1/groups", groupsRoutes);
app.use("/api/v1/parents", parentsRoutes);
app.use("/api/v1/subjects", subjectsRoutes);
app.use("/api/v1/schedules", schedulesRoutes);

// Обробка неіснуючих маршрутів
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found"
    }
  });
});

// Централізована обробка помилок
app.use(errorHandler);

module.exports = app;
