   1 import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
   2 import { createInsertSchema } from "drizzle-zod";
   3 import { z } from "zod/v4";
   4
   5 export const usersTable = pgTable("users", {
   6  id: serial("id").primaryKey(),
   7  username: text("username").notNull().unique(),
   8  passwordHash: text("password_hash").notNull(),
   9  isAdmin: boolean("is_admin").notNull().default(false),
  10  callsEnabled: boolean("calls_enabled").notNull().default(false),
  11  createdAt: timestamp("created_at").notNull().defaultNow(),
  12 });
  13
  14 export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
  15 export type InsertUser = z.infer<typeof insertUserSchema>;
  16 export type User = typeof usersTable.$inferSelect;
  17

   1 import { pgTable, serial, integer, text, boolean, timestamp, date } from "drizzle-orm/pg-core";
   2 import { createInsertSchema } from "drizzle-zod";
   3 import { z } from "zod/v4";
   4 import { usersTable } from "./users";
   5
   6 export const workLogsTable = pgTable("work_logs", {
   7  id: serial("id").primaryKey(),
   8  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
   9  date: date("date").notNull(),
  10  clockInTime: text("clock_in_time"),
  11  clockOutTime: text("clock_out_time"),
  12  workSentViaEmail: boolean("work_sent_via_email").notNull().default(false),
  13  workGivenViaPhone: boolean("work_given_via_phone").notNull().default(false),
  14  workDescription: text("work_description"),
  15  emailSent: text("email_sent"),
  16  numberOfCalls: integer("number_of_calls"),
  17  createdAt: timestamp("created_at").notNull().defaultNow(),
  18  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  19 });
  20
  21 export const insertWorkLogSchema = createInsertSchema(workLogsTable).omit({ id: true, createdAt: true, updated…
  22 export type InsertWorkLog = z.infer<typeof insertWorkLogSchema>;
  23 export type WorkLog = typeof workLogsTable.$inferSelect;
  24

   1 import { pgTable, serial, integer, text, boolean, timestamp, date } from "drizzle-orm/pg-core";
   2 import { createInsertSchema } from "drizzle-zod";
   3 import { z } from "zod/v4";
   4 import { usersTable } from "./users";
   5
   6 export const callStatesTable = pgTable("call_states", {
   7  id: serial("id").primaryKey(),
   8  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
   9  date: date("date").notNull(),
  10  checkedBoxes: text("checked_boxes").notNull().default("[]"),
  11  savedToTable: boolean("saved_to_table").notNull().default(false),
  12  createdAt: timestamp("created_at").notNull().defaultNow(),
  13  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  14 });
  15
  16 export const insertCallStateSchema = createInsertSchema(callStatesTable).omit({ id: true, createdAt: true, upd…
  17 export type InsertCallState = z.infer<typeof insertCallStateSchema>;
  18 export type CallState = typeof callStatesTable.$inferSelect;
  19

   1 export * from "./users";
   2 export * from "./worklogs";
   3 export * from "./calls";
   4

   1 import { drizzle } from "drizzle-orm/node-postgres";
   2 import pg from "pg";
   3 import * as schema from "./schema";
   4
   5 const { Pool } = pg;
   6
   7 if (!process.env.DATABASE_URL) {
   8  throw new Error(
   9    "DATABASE_URL must be set. Did you forget to provision a database?",
  10  );
  11 }
  12
  13 export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  14 export const db = drizzle(pool, { schema });
  15
  16 export * from "./schema";
  17

   1 import { defineConfig } from "drizzle-kit";
   2 import path from "path";
   3
   4 if (!process.env.DATABASE_URL) {
   5  throw new Error("DATABASE_URL, ensure the database is provisioned");
   6 }
   7
   8 export default defineConfig({
   9  schema: path.join(__dirname, "./src/schema/index.ts"),
  10  dialect: "postgresql",
  11  dbCredentials: {
  12    url: process.env.DATABASE_URL,
  13  },
  14
});
  15