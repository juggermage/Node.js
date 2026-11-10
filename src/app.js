const authRoutes = require("./modules/auth/auth.routes");
const attendanceRoutes = require("./modules/attendance/attendance.routes");
const optimizationRoutes = require("./modules/optimization/optimization.routes");

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

//Schedules, Expenses
const schedulesRoutes = require("./modules/schedules/schedules.routes");
// Billing
const discountsRoutes = require("./modules/billing/discounts/discounts.routes");
const expensesRoutes = require("./modules/billing/expenses/expenses.routes");
const invoicesRoutes = require("./modules/billing/invoices/invoices.routes");
const paymentsRoutes = require("./modules/billing/payments/payments.routes");
const salariesRoutes = require("./modules/billing/salaries/salaries.routes");
const tuitionRoutes = require("./modules/billing/tuition/tuition.routes");
const mealsRoutes = require("./modules/billing/meals/meals.routes");

// Subjects, Employees,
// TeacherSubject, StaffAssignment
const subjectsRoutes = require("./modules/subjects/subjects.routes");
const employeesRoutes = require("./modules/employees/employees.routes");
const teacherSubjectRoutes = require("./modules/teacher-subjects/teacher-subjects.routes");
const staffAssignmentRoutes = require("./modules/staff-assignments/staff-assignments.routes");

// Audit
const auditRoutes = require("./modules/audit/audit.routes");

// Analytics
const analyticsRoutes = require("./modules/analytics/analytics.routes");

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
    message: "API is running"
  });
});

// Auth
app.use("/api/v1/auth", authRoutes);

// Attendance
app.use("/api/v1/attendance", attendanceRoutes);

// Optimization
app.use("/api/v1/optimization", optimizationRoutes);

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
// Analytics
app.use("/api/v1/analytics", analyticsRoutes);

// Billing
app.use("/api/v1/billing/discounts", discountsRoutes);
app.use("/api/v1/billing/expenses", expensesRoutes);
app.use("/api/v1/billing/invoices", invoicesRoutes);
app.use("/api/v1/billing/payments", paymentsRoutes);
app.use("/api/v1/billing/salaries", salariesRoutes);
app.use("/api/v1/billing/tuition", tuitionRoutes);
app.use("/api/v1/meals", mealsRoutes);

// Subjects
app.use("/api/v1/subjects", subjectsRoutes);

// Employees
app.use("/api/v1/employees", employeesRoutes);

// Audit
app.use("/api/v1/audit", auditRoutes);

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
      message: "Route not found"
    }
  });
});

app.use(errorHandler);

module.exports = app;
