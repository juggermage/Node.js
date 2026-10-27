const express = require("express");
const cors = require("cors");

// Children, Rooms
const childrenRoutes = require("./modules/children/children.routes");
const roomsRoutes = require("./modules/rooms/rooms.routes");

//  Groups, GroupEnrollment
const groupsRoutes = require("./modules/groups/groups.routes");

// Parents, ChildParent, Discounts
const parentsRoutes = require("./modules/parents/parents.routes");
const childParentRoutes = require("./modules/child-parent/child-parent.routes");
const discountsRoutes = require("./modules/billing/discounts/discounts.routes");

//Schedules, Expenses
const schedulesRoutes = require("./modules/schedules/schedules.routes");
const expensesRoutes = require("./modules/billing/expenses/expenses.routes");

// Subjects, Employees,
// TeacherSubject, StaffAssignment
const subjectsRoutes = require("./modules/subjects/subjects.routes");
const employeesRoutes = require("./modules/employees/employees.routes");
const teacherSubjectRoutes = require("./modules/teacher-subject/teacher-subject.routes");
const staffAssignmentRoutes = require("./modules/staff-assignment/staff-assignment.routes");

// Спільні компоненти
const HTTP_STATUS = require("./utils/http-status");
const errorHandler = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

// Перевірка працездатності API
app.get("/api/v1/health", (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "API is running",
  });
});

// Children
app.use("/api/v1/children", childrenRoutes);

// Rooms
app.use("/api/v1/rooms", roomsRoutes);

// Groups та GroupEnrollment
app.use("/api/v1/groups", groupsRoutes);

// Parents
app.use("/api/v1/parents", parentsRoutes);

// Зв'язки батьків із дітьми
app.use("/api/v1/child-parent", childParentRoutes);

// Billing
app.use("/api/v1/billing/discounts", discountsRoutes);
app.use("/api/v1/billing/expenses", expensesRoutes);

// Subjects
app.use("/api/v1/subjects", subjectsRoutes);

// Employees
app.use("/api/v1/employees", employeesRoutes);

// Зв'язки працівників
app.use("/api/v1/teacher-subject", teacherSubjectRoutes);
app.use("/api/v1/staff-assignments", staffAssignmentRoutes);

// Schedules
app.use("/api/v1/schedules", schedulesRoutes);

// Обробка неіснуючих маршрутів
app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
    },
  });
});


app.use(errorHandler);

module.exports = app;