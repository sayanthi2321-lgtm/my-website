
   1 import app from "./app";
   2 import bcrypt from "bcryptjs";
   3 import { db, usersTable } from "@workspace/db";
   4 import { eq } from "drizzle-orm";
   5
   6 const rawPort = process.env["PORT"];
   7
   8 if (!rawPort) {
   9  throw new Error(
  10    "PORT environment variable is required but was not provided.",
  11  );
  12 }
  13
  14 const port = Number(rawPort);
  15
  16 if (Number.isNaN(port) || port <= 0) {
  17  throw new Error(`Invalid PORT value: "${rawPort}"`);
  18 }
  19
  20 async function seedAdminIfNeeded() {
  21  try {
  22    const existing = await db.select().from(usersTable).where(eq(usersTable.username, "admin"));
  23    if (existing.length === 0) {
  24      const passwordHash = await bcrypt.hash("admin123", 10);
  25      await db.insert(usersTable).values({
  26        username: "admin",
  27        passwordHash,
  28        isAdmin: true,
  29        callsEnabled: true,
  30      });
  31      console.log("Admin user created (username: admin, password: admin123)");
  32    }
  33  } catch (err) {
  34    console.error("Failed to seed admin user:", err);
  35  }
  36 }
  37
  38 app.listen(port, async () => {
  39  console.log(`Server listening on port ${port}`);
  40  await seedAdminIfNeeded();
  41 });
  42

   1 import express, { type Express } from "express";
   2 import cors from "cors";
   3 import session from "express-session";
   4 import router from "./routes";
   5
   6 const app: Express = express();
   7
   8 app.use(cors({ credentials: true, origin: true }));
   9 app.use(express.json());
  10 app.use(express.urlencoded({ extended: true }));
  11
  12 const sessionSecret = process.env.SESSION_SECRET || "workflow-tracker-secret-2024";
  13
  14 app.use(
  15  session({
  16    secret: sessionSecret,
  17    resave: false,
  18    saveUninitialized: false,
  19    cookie: {
  20      httpOnly: true,
  21      secure: false,
  22      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  23    },
  24  })
  25 );
  26
  27 app.use("/api", router);
  28
  29 export default app;
  30

   1 import "express-session";
   2
   3 declare module "express-session" {
   4  interface SessionData {
   5    userId?: number;
   6  }
   7 }
   8

   1 import { Router, type IRouter } from "express";
   2 import healthRouter from "./health";
   3 import authRouter from "./auth";
   4 import usersRouter from "./users";
   5 import worklogRouter from "./worklog";
   6 import callsRouter from "./calls";
   7
   8 const router: IRouter = Router();
   9
  10 router.use(healthRouter);
  11 router.use("/auth", authRouter);
  12 router.use("/users", usersRouter);
  13 router.use("/worklog", worklogRouter);
  14 router.use("/calls", callsRouter);
  15
  16 export default router;
  17

   1 import "../lib/session";
   2 import { Router, type IRouter, Request, Response } from "express";
   3 import bcrypt from "bcryptjs";
   4 import { db, usersTable } from "@workspace/db";
   5 import { eq } from "drizzle-orm";
   6 import {
   7  LoginBody,
   8  ChangePasswordBody,
   9 } from "@workspace/api-zod";
  10
  11 const router: IRouter = Router();
  12
  13 router.post("/login", async (req: Request, res: Response) => {
  14  const parsed = LoginBody.safeParse(req.body);
  15  if (!parsed.success) {
  16    return res.status(400).json({ error: "Invalid request" });
  17  }
  18  const { username, password } = parsed.data;
  19  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  20  if (!user) {
  21    return res.status(401).json({ error: "Invalid credentials" });
  22  }
  23  const valid = await bcrypt.compare(password, user.passwordHash);
  24  if (!valid) {
  25    return res.status(401).json({ error: "Invalid credentials" });
  26  }
  27  req.session.userId = user.id;
  28  return res.json({
  29    user: {
  30      id: user.id,
  31      username: user.username,
  32      isAdmin: user.isAdmin,
  33      callsEnabled: user.callsEnabled,
  34      createdAt: user.createdAt,
  35    },
  36    message: "Login successful",
  37  });
  38 });
  39
  40 router.post("/logout", (req: Request, res: Response) => {
  41  req.session.destroy(() => {});
  42  return res.json({ message: "Logged out" });
  43 });
  44
  45 router.get("/me", async (req: Request, res: Response) => {
  46  const userId = req.session.userId;
  47  if (!userId) {
  48    return res.status(401).json({ error: "Not authenticated" });
  49  }
  50  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  51  if (!user) {
  52    return res.status(401).json({ error: "User not found" });
  53  }
  54  return res.json({
  55    id: user.id,
  56    username: user.username,
  57    isAdmin: user.isAdmin,
  58    callsEnabled: user.callsEnabled,
  59    createdAt: user.createdAt,
  60  });
  61 });
  62
  63 router.post("/change-password", async (req: Request, res: Response) => {
  64  const userId = req.session.userId;
  65  if (!userId) {
  66    return res.status(401).json({ error: "Not authenticated" });
  67  }
  68  const parsed = ChangePasswordBody.safeParse(req.body);
  69  if (!parsed.success) {
  70    return res.status(400).json({ error: "Invalid request" });
  71  }
  72  const { currentPassword, newPassword } = parsed.data;
  73  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  74  if (!user) {
  75    return res.status(401).json({ error: "User not found" });
  76  }
  77  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  78  if (!valid) {
  79    return res.status(400).json({ error: "Current password is incorrect" });
  80  }
  81  if (newPassword.length < 6) {
  82    return res.status(400).json({ error: "New password must be at least 6 characters" });
  83  }
  84  const hash = await bcrypt.hash(newPassword, 10);
  85  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, userId));
  86  return res.json({ message: "Password changed successfully" });
  87 });
  88
  89 export default router;
  90

   1 import "../lib/session";
   2 import { Router, type IRouter, Request, Response } from "express";
   3 import bcrypt from "bcryptjs";
   4 import { db, usersTable } from "@workspace/db";
   5 import { eq } from "drizzle-orm";
   6 import {
   7  CreateUserBody,
   8  DeleteUserParams,
   9  ToggleCallsEnabledParams,
  10  ToggleCallsEnabledBody,
  11 } from "@workspace/api-zod";
  12
  13 const router: IRouter = Router();
  14
  15 function requireAdmin(req: Request, res: Response): boolean {
  16  if (!(req as any)._user?.isAdmin) {
  17    res.status(403).json({ error: "Admin access required" });
  18    return false;
  19  }
  20  return true;
  21 }
  22
  23 router.use(async (req: Request, res: Response, next) => {
  24  const userId = req.session.userId;
  25  if (!userId) {
  26    return res.status(401).json({ error: "Not authenticated" });
  27  }
  28  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  29  if (!user) {
  30    return res.status(401).json({ error: "User not found" });
  31  }
  32  (req as any)._user = user;
  33  return next();
  34 });
  35
  36 router.get("/", async (req: Request, res: Response) => {
  37  if (!requireAdmin(req, res)) return;
  38  const users = await db.select().from(usersTable);
  39  return res.json(
  40    users.map((u) => ({
  41      id: u.id,
  42      username: u.username,
  43      isAdmin: u.isAdmin,
  44      callsEnabled: u.callsEnabled,
  45      createdAt: u.createdAt,
  46    }))
  47  );
  48 });
  49
  50 router.post("/", async (req: Request, res: Response) => {
  51  if (!requireAdmin(req, res)) return;
  52  const parsed = CreateUserBody.safeParse(req.body);
  53  if (!parsed.success) {
  54    return res.status(400).json({ error: "Invalid request" });
  55  }
  56  const { username, password, isAdmin } = parsed.data;
  57  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  58  if (existing.length > 0) {
  59    return res.status(400).json({ error: "Username already exists" });
  60  }
  61  if (password.length < 6) {
  62    return res.status(400).json({ error: "Password must be at least 6 characters" });
  63  }
  64  const passwordHash = await bcrypt.hash(password, 10);
  65  const [newUser] = await db
  66    .insert(usersTable)
  67    .values({ username, passwordHash, isAdmin: isAdmin ?? false, callsEnabled: false })
  68    .returning();
  69  return res.status(201).json({
  70    id: newUser.id,
  71    username: newUser.username,
  72    isAdmin: newUser.isAdmin,
  73    callsEnabled: newUser.callsEnabled,
  74    createdAt: newUser.createdAt,
  75  });
  76 });
  77
  78 router.delete("/:userId", async (req: Request, res: Response) => {
  79  if (!requireAdmin(req, res)) return;
  80  const parsed = DeleteUserParams.safeParse(req.params);
  81  if (!parsed.success) {
  82    return res.status(400).json({ error: "Invalid user ID" });
  83  }
  84  const { userId } = parsed.data;
  85  const currentUser = (req as any)._user;
  86  if (userId === currentUser.id) {
  87    return res.status(400).json({ error: "Cannot delete your own account" });
  88  }
  89  await db.delete(usersTable).where(eq(usersTable.id, userId));
  90  return res.json({ message: "User deleted" });
  91 });
  92
  93 router.patch("/:userId/calls-enabled", async (req: Request, res: Response) => {
  94  if (!requireAdmin(req, res)) return;
  95  const paramsParsed = ToggleCallsEnabledParams.safeParse(req.params);
  96  const bodyParsed = ToggleCallsEnabledBody.safeParse(req.body);
  97  if (!paramsParsed.success || !bodyParsed.success) {
  98    return res.status(400).json({ error: "Invalid request" });
  99  }
 100  const { userId } = paramsParsed.data;
 101  const { enabled } = bodyParsed.data;
 102  const [updated] = await db
 103    .update(usersTable)
 104    .set({ callsEnabled: enabled })
 105    .where(eq(usersTable.id, userId))
 106    .returning();
 107  if (!updated) {
 108    return res.status(404).json({ error: "User not found" });
 109  }
 110  return res.json({
 111    id: updated.id,
 112    username: updated.username,
 113    isAdmin: updated.isAdmin,
 114    callsEnabled: updated.callsEnabled,
 115    createdAt: updated.createdAt,
 116  });
 117 });
 118
 119 export default router;
 120

   1 import "../lib/session";
   2 import { Router, type IRouter, Request, Response } from "express";
   3 import { db, usersTable, workLogsTable } from "@workspace/db";
   4 import { eq, and, gte, lte, desc } from "drizzle-orm";
   5 import {
   6  UpdateWorkLogParams,
   7  UpdateWorkLogBody,
   8  ListWorkLogsQueryParams,
   9 } from "@workspace/api-zod";
  10
  11 const router: IRouter = Router();
  12
  13 function getTodayDate(): string {
  14  return new Date().toISOString().split("T")[0];
  15 }
  16
  17 router.use(async (req: Request, res: Response, next) => {
  18  const userId = req.session.userId;
  19  if (!userId) {
  20    return res.status(401).json({ error: "Not authenticated" });
  21  }
  22  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  23  if (!user) {
  24    return res.status(401).json({ error: "User not found" });
  25  }
  26  (req as any)._user = user;
  27  return next();
  28 });
  29
  30 // GET today's entries (all rows for today)
  31 router.get("/today", async (req: Request, res: Response) => {
  32  const userId = (req as any)._user.id;
  33  const today = getTodayDate();
  34  const logs = await db
  35    .select()
  36    .from(workLogsTable)
  37    .where(and(eq(workLogsTable.userId, userId), eq(workLogsTable.date, today)))
  38    .orderBy(workLogsTable.createdAt);
  39
  40  return res.json(logs.map(formatLog));
  41 });
  42
  43 // POST /new — create a new entry for today with auto clock-in time
  44 router.post("/new", async (req: Request, res: Response) => {
  45  const userId = (req as any)._user.id;
  46  const today = getTodayDate();
  47  const now = new Date();
  48  const clockInTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}…
  49  const [created] = await db
  50    .insert(workLogsTable)
  51    .values({
  52      userId,
  53      date: today,
  54      clockInTime,
  55      workSentViaEmail: false,
  56      workGivenViaPhone: false,
  57    })
  58    .returning();
  59  return res.status(201).json(formatLog(created));
  60 });
  61
  62 // GET all entries (for history / PDF export)
  63 router.get("/", async (req: Request, res: Response) => {
  64  const userId = (req as any)._user.id;
  65  const parsed = ListWorkLogsQueryParams.safeParse(req.query);
  66  const startDate = parsed.success ? parsed.data.startDate : undefined;
  67  const endDate = parsed.success ? parsed.data.endDate : undefined;
  68
  69  const logs = await db
  70    .select()
  71    .from(workLogsTable)
  72    .where(
  73      startDate && endDate
  74        ? and(
  75            eq(workLogsTable.userId, userId),
  76            gte(workLogsTable.date, startDate.toISOString().split("T")[0]),
  77            lte(workLogsTable.date, endDate.toISOString().split("T")[0])
  78          )
  79        : startDate
  80        ? and(eq(workLogsTable.userId, userId), gte(workLogsTable.date, startDate.toISOString().split("T")[0])…
  81        : endDate
  82        ? and(eq(workLogsTable.userId, userId), lte(workLogsTable.date, endDate.toISOString().split("T")[0]))
  83        : eq(workLogsTable.userId, userId)
  84    )
  85    .orderBy(workLogsTable.date, workLogsTable.createdAt);
  86
  87  return res.json(logs.map(formatLog));
  88 });
  89
  90 // PATCH /:id — update a specific entry
  91 router.patch("/:id", async (req: Request, res: Response) => {
  92  const userId = (req as any)._user.id;
  93  const parsed = UpdateWorkLogParams.safeParse(req.params);
  94  if (!parsed.success) {
  95    return res.status(400).json({ error: "Invalid ID" });
  96  }
  97  const bodyParsed = UpdateWorkLogBody.safeParse(req.body);
  98  if (!bodyParsed.success) {
  99    return res.status(400).json({ error: "Invalid request body" });
 100  }
 101
 102  const { id } = parsed.data;
 103  const [existing] = await db
 104    .select()
 105    .from(workLogsTable)
 106    .where(and(eq(workLogsTable.id, id), eq(workLogsTable.userId, userId)));
 107
 108  if (!existing) {
 109    return res.status(404).json({ error: "Work log not found" });
 110  }
 111
 112  const updates: Record<string, unknown> = { updatedAt: new Date() };
 113  const body = bodyParsed.data;
 114  if (body.clockInTime !== undefined) updates.clockInTime = body.clockInTime;
 115  if (body.clockOutTime !== undefined) updates.clockOutTime = body.clockOutTime;
 116  if (body.workSentViaEmail !== undefined) updates.workSentViaEmail = body.workSentViaEmail;
 117  if (body.workGivenViaPhone !== undefined) updates.workGivenViaPhone = body.workGivenViaPhone;
 118  if (body.workDescription !== undefined) updates.workDescription = body.workDescription;
 119  if (body.emailSent !== undefined) updates.emailSent = body.emailSent;
 120
 121  const [updated] = await db
 122    .update(workLogsTable)
 123    .set(updates as any)
 124    .where(eq(workLogsTable.id, id))
 125    .returning();
 126
 127  return res.json(formatLog(updated));
 128 });
 129
 130 function formatLog(log: typeof workLogsTable.$inferSelect) {
 131  return {
 132    id: log.id,
 133    userId: log.userId,
 134    date: log.date,
 135    clockInTime: log.clockInTime ?? null,
 136    clockOutTime: log.clockOutTime ?? null,
 137    workSentViaEmail: log.workSentViaEmail,
 138    workGivenViaPhone: log.workGivenViaPhone,
 139    workDescription: log.workDescription ?? null,
 140    emailSent: log.emailSent ?? null,
 141    numberOfCalls: log.numberOfCalls ?? null,
 142    createdAt: log.createdAt,
 143    updatedAt: log.updatedAt,
 144  };
 145 }
 146
 147 export default router;
 148

   1 import "../lib/session";
   2 import { Router, type IRouter, Request, Response } from "express";
   3 import { db, usersTable, callStatesTable, workLogsTable } from "@workspace/db";
   4 import { eq, and } from "drizzle-orm";
   5 import { UpdateTodayCallsBody } from "@workspace/api-zod";
   6
   7 const router: IRouter = Router();
   8
   9 function getTodayDate(): string {
  10  return new Date().toISOString().split("T")[0];
  11 }
  12
  13 router.use(async (req: Request, res: Response, next) => {
  14  const userId = req.session.userId;
  15  if (!userId) {
  16    return res.status(401).json({ error: "Not authenticated" });
  17  }
  18  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  19  if (!user) {
  20    return res.status(401).json({ error: "User not found" });
  21  }
  22  (req as any)._user = user;
  23  return next();
  24 });
  25
  26 async function getOrCreateTodayCallState(userId: number) {
  27  const today = getTodayDate();
  28  let [state] = await db
  29    .select()
  30    .from(callStatesTable)
  31    .where(and(eq(callStatesTable.userId, userId), eq(callStatesTable.date, today)));
  32
  33  if (!state) {
  34    const [created] = await db
  35      .insert(callStatesTable)
  36      .values({ userId, date: today, checkedBoxes: "[]", savedToTable: false })
  37      .returning();
  38    state = created;
  39  }
  40  return state;
  41 }
  42
  43 function formatCallState(state: typeof callStatesTable.$inferSelect) {
  44  const checkedBoxes = JSON.parse(state.checkedBoxes || "[]") as number[];
  45  return {
  46    id: state.id,
  47    userId: state.userId,
  48    date: state.date,
  49    checkedBoxes,
  50    totalChecked: checkedBoxes.length,
  51    savedToTable: state.savedToTable,
  52  };
  53 }
  54
  55 router.get("/today", async (req: Request, res: Response) => {
  56  const userId = (req as any)._user.id;
  57  const state = await getOrCreateTodayCallState(userId);
  58  return res.json(formatCallState(state));
  59 });
  60
  61 router.patch("/today", async (req: Request, res: Response) => {
  62  const userId = (req as any)._user.id;
  63  const parsed = UpdateTodayCallsBody.safeParse(req.body);
  64  if (!parsed.success) {
  65    return res.status(400).json({ error: "Invalid request" });
  66  }
  67  const { checkedBoxes } = parsed.data;
  68  const state = await getOrCreateTodayCallState(userId);
  69  const [updated] = await db
  70    .update(callStatesTable)
  71    .set({ checkedBoxes: JSON.stringify(checkedBoxes), updatedAt: new Date() })
  72    .where(eq(callStatesTable.id, state.id))
  73    .returning();
  74  return res.json(formatCallState(updated));
  75 });
  76
  77 router.post("/save-to-table", async (req: Request, res: Response) => {
  78  const userId = (req as any)._user.id;
  79  const today = getTodayDate();
  80  const state = await getOrCreateTodayCallState(userId);
  81  const checkedBoxes = JSON.parse(state.checkedBoxes || "[]") as number[];
  82  const count = checkedBoxes.length;
  83
  84  await db
  85    .update(callStatesTable)
  86    .set({ savedToTable: true, updatedAt: new Date() })
  87    .where(eq(callStatesTable.id, state.id));
  88
  89  let [log] = await db
  90    .select()
  91    .from(workLogsTable)
  92    .where(and(eq(workLogsTable.userId, userId), eq(workLogsTable.date, today)));
  93
  94  if (!log) {
  95    const [created] = await db
  96      .insert(workLogsTable)
  97      .values({ userId, date: today, workSentViaEmail: false, workGivenViaPhone: false, numberOfCalls: count }…
  98      .returning();
  99    log = created;
 100  } else {
 101    const [updated] = await db
 102      .update(workLogsTable)
 103      .set({ numberOfCalls: count, updatedAt: new Date() })
 104      .where(eq(workLogsTable.id, log.id))
 105      .returning();
 106    log = updated;
 107  }
 108
 109  return res.json({
 110    id: log.id,
 111    userId: log.userId,
 112    date: log.date,
 113    clockInTime: log.clockInTime ?? null,
 114    workSentViaEmail: log.workSentViaEmail,
 115    workGivenViaPhone: log.workGivenViaPhone,
 116    workDescription: log.workDescription ?? null,
 117    emailSent: log.emailSent ?? null,
 118    numberOfCalls: log.numberOfCalls ?? null,
 119    createdAt: log.createdAt,
 120    updatedAt: log.updatedAt,
 121  });
 122 });
 123
 124 export default router;
 125

   1 import { Router, type IRouter } from "express";
   2 import { HealthCheckResponse } from "@workspace/api-zod";
   3
   4 const router: IRouter = Router();
   5
   6 router.get("/healthz", (_req, res) => {
   7  const data = HealthCheckResponse.parse({ status: "ok" });
   8  res.json(data);
   9 });
  10
  11 export default router;
  12