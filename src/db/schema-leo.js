import { pgTable, uuid, varchar, boolean, timestamp, numeric, text, integer, jsonb } from "drizzle-orm/pg-core";

// Users Table
export const users = pgTable("users", {
  id: text('id').primaryKey(),       // store MongoDB ObjectId hex string
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("teller"),
  email: varchar("email", { length: 255 }).notNull(),
  password: text("password").notNull(),
  isDeleted: boolean("is_deleted").default(false),
  isAdmin: boolean("is_admin").default(false),
  address: text("address"),
  receiptTemplate: varchar("receipt_template", { length: 50 }),
  commission: numeric("commission"),
  mobile: varchar("mobile", { length: 20 }),
  referral: varchar("referral", { length: 255 }),
  userLevel: integer("user_level").default(0),
  comRate: numeric("com_rate").default("0"),
  comPortion: numeric("com_portion").default("0"),
  deviceId: varchar("device_id", { length: 255 }),
  userId: varchar("user_id", { length: 255 }),
  coordinates: varchar("coordinates", { length: 255 }),
  grossToday: numeric("gross_today"),
  appVersion: varchar("app_version", { length: 50 }),
  lastSummary: timestamp("last_summary"),
  configuration: jsonb("configuration").default([]), // stored as JSONB array
  uplines: jsonb("uplines").default([]), // flexible list
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});



// Bettings Table (some lists stored as JSONB)
export const bettings = pgTable("bettings", {
  id: text('id').primaryKey(),       // store MongoDB ObjectId hex string
  isComplete: boolean("is_complete").default(false),
  isDeleted: boolean("is_deleted").default(false),
  isValidated: timestamp("is_validated"),
  timestamp: timestamp("timestamp"),
  inputType: varchar("input_type", { length: 20 }).default("normal").notNull(),
  straight: numeric("straight").notNull(),
  ramble: numeric("ramble").notNull(),
  gross: numeric("gross").notNull(),
  net: numeric("net").notNull(),
  isPrint: boolean("is_print").default(false),
  isWinTo: boolean("is_win_to").default(false),
  collector: varchar("collector", { length: 255 }).notNull(),
  ownerId: varchar("owner_id", { length: 255 }).notNull(),
  printCopy: integer("print_copy"),
  drawId: varchar("draw_id"),
  user: varchar("user_id"),
  fileUrl: text("file_url"),
  note: text("note"),
  contact: varchar("contact", { length: 50 }),
  ticketNo: varchar("ticket_no", { length: 50 }),
  winning: numeric("winning"),
  gameTime: varchar("game_time", { length: 10 }).default("2pm"),
  hits: jsonb("hits"),            // keep as JSONB
  commissions: jsonb("commissions"), // keep as JSONB
  combinations: jsonb("combinations"), // keep as JSONB
  uplines: jsonb("uplines"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


// Draws Table
export const draws = pgTable("draws", {
  id: text('id').primaryKey(),       // store MongoDB ObjectId hex string
  gameType: varchar("game_type", { length: 50 }).default("swertres").notNull(),
  gameTime: varchar("game_time", { length: 10 }).default("2pm").notNull(),
  combination: varchar("combination", { length: 50 }),
  grossTotal: numeric("gross_total").notNull(),
  winTotal: numeric("win_total"),
  netTotal: numeric("net_total"),
  soldOutTotal: numeric("sold_out_total"),
  drawDate: timestamp("draw_date"),
  isWinTo: boolean("is_win_to").default(false),
  tipUrl: text("tip_url"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Master Combinations Table (for tracking limits)
export const masterCombinations = pgTable("master_combinations", {
  id: text('id').primaryKey(),       // store MongoDB ObjectId hex string
  digit: varchar("digit", { length: 10 }).notNull(),
  straightLimit: numeric("straight_limit").default("0"),
  rambleLimit: numeric("ramble_limit").default("0"),
  rambleTotal: numeric("ramble_total").default("0"),
  straightTotal: numeric("straight_total").default("0"),
  isWinTo: boolean("is_win_to").default(false),
  riskLevel: varchar("risk_level", { length: 20 }).default("neutral"),
  winFrequency: integer("win_frequency").default(0),
  straightMaxLimit: numeric("straight_max_limit").default("0"),
  rambleMaxLimit: numeric("ramble_max_limit").default("0"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Messages Table (conversations as JSONB)
export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdBy: varchar("created_by", { length: 255 }),
  recepient: varchar("recepient", { length: 255 }),
  recepientName: varchar("recepient_name", { length: 255 }),
  conversations: jsonb("conversations"), // store whole array as JSONB
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cashflow Table
export const cashflow = pgTable("cashflow", {
  id: uuid("id").defaultRandom().primaryKey(),
  amount: numeric("amount").default("0"),
  description: text("description").notNull(),
  inputType: varchar("input_type", { length: 50 }).notNull(),
  isDeleted: boolean("is_deleted").default(false),
  owner: varchar("owner", { length: 255 }).notNull(),
  ownerName: varchar("owner_name", { length: 255 }),
  user: varchar("user", { length: 255 }).notNull(),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
