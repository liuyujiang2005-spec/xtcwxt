import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().$type<'admin' | 'finance' | 'operator' | 'viewer'>(),
  active: integer('active').default(1),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
});

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  contact: text('contact'),
  priceMatrix: text('price_matrix'),
  defaultCurrency: text('default_currency').default('CNY'),
  remark: text('remark'),
});

export const suppliers = sqliteTable('suppliers', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type'),
  contact: text('contact'),
  defaultCurrency: text('default_currency').default('CNY'),
  remark: text('remark'),
});

export const marks = sqliteTable('marks', {
  id: integer('id').primaryKey(),
  markNo: text('mark_no').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  mode: text('mode').notNull(),
  monthTag: text('month_tag').notNull(),
  remark: text('remark'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  monthTagIdx: index('marks_month_tag_idx').on(table.monthTag),
  customerIdIdx: index('marks_customer_id_idx').on(table.customerId),
}));

export const sharedContainerBatches = sqliteTable('shared_container_batches', {
  id: integer('id').primaryKey(),
  batchNo: text('batch_no').notNull().unique(),
  totalVolumeUploaded: real('total_volume_uploaded').notNull(),
  status: text('status').default('待验证'),
  originalFilename: text('original_filename'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const sharedContainerItems = sqliteTable('shared_container_items', {
  id: integer('id').primaryKey(),
  batchId: integer('batch_id').references(() => sharedContainerBatches.id).notNull(),
  markId: integer('mark_id').references(() => marks.id).notNull(),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  品名: text('品名'),
  尺寸_长: real('尺寸_长'),
  尺寸_宽: real('尺寸_宽'),
  尺寸_高: real('尺寸_高'),
  单箱体积: real('单箱体积'),
  总体积: real('总体积').notNull(),
  国内单号: text('国内单号'),
  单箱数量: integer('单箱数量'),
  总重量: real('总重量'),
  箱数: integer('箱数'),
  pcs数量: integer('pcs数量'),
  成本单价_cents: integer('成本单价_cents'),
  需支付总价_cents: integer('需支付总价_cents'),
  货型: text('货型'),
  运输方式: text('运输方式'),
  客户应收_cents: integer('客户应收_cents'),
  cost_status: text('cost_status').default('待支出'),
  ai_verified: integer('ai_verified').default(0),
  ai_verify_msg: text('ai_verify_msg'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  batchIdIdx: index('sci_batch_id_idx').on(table.batchId),
  markIdIdx: index('sci_mark_id_idx').on(table.markId),
  customerIdIdx: index('sci_customer_id_idx').on(table.customerId),
}));

export const loadingBatches = sqliteTable('loading_batches', {
  id: integer('id').primaryKey(),
  batchNo: text('batch_no').notNull().unique(),
  originalFilename: text('original_filename'),
  status: text('status').default('待验证'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const loadingItems = sqliteTable('loading_items', {
  id: integer('id').primaryKey(),
  batchId: integer('batch_id').references(() => loadingBatches.id).notNull(),
  markId: integer('mark_id').references(() => marks.id).notNull(),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  品名: text('品名'),
  尺寸_长: real('尺寸_长'),
  尺寸_宽: real('尺寸_宽'),
  尺寸_高: real('尺寸_高'),
  单箱体积: real('单箱体积'),
  总体积: real('总体积').notNull(),
  国内单号: text('国内单号'),
  单箱数量: integer('单箱数量'),
  总重量: real('总重量'),
  箱数: integer('箱数'),
  pcs数量: integer('pcs数量'),
  单价_cents: integer('单价_cents'),
  需支付总价_cents: integer('需支付总价_cents'),
  货型: text('货型'),
  运输方式: text('运输方式'),
  payment_status: text('payment_status').default('待支付'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  batchIdIdx: index('li_batch_id_idx').on(table.batchId),
  markIdIdx: index('li_mark_id_idx').on(table.markId),
}));

export const directIncome = sqliteTable('direct_income', {
  id: integer('id').primaryKey(),
  markId: integer('mark_id').references(() => marks.id),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  volume: real('volume'),
  incomeDate: text('income_date').notNull(),
  remark: text('remark'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  customerIdIdx: index('di_customer_id_idx').on(table.customerId),
  incomeDateIdx: index('di_income_date_idx').on(table.incomeDate),
}));

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey(),
  loadingBatchId: integer('loading_batch_id').references(() => loadingBatches.id),
  expenseType: text('expense_type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  status: text('status').default('待支付'),
  paidDate: text('paid_date'),
  remark: text('remark'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  expenseTypeIdx: index('exp_type_idx').on(table.expenseType),
  statusIdx: index('exp_status_idx').on(table.status),
}));

export const paymentsReceived = sqliteTable('payments_received', {
  id: integer('id').primaryKey(),
  markId: integer('mark_id').references(() => marks.id),
  customerId: integer('customer_id').references(() => customers.id),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  receivedDate: text('received_date').notNull(),
  remark: text('remark'),
}, (table) => ({
  customerIdIdx: index('payments_received_customer_id_idx').on(table.customerId),
}));

export const paymentsMade = sqliteTable('payments_made', {
  id: integer('id').primaryKey(),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  expenseId: integer('expense_id').references(() => expenses.id),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  paidDate: text('paid_date').notNull(),
  remark: text('remark'),
});

export const bills = sqliteTable('bills', {
  id: integer('id').primaryKey(),
  billNo: text('bill_no').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  monthTag: text('month_tag').notNull(),
  totalAmountCents: integer('total_amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  status: text('status').default('待生成'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  customerMonthIdx: index('bills_customer_month_idx').on(table.customerId, table.monthTag),
}));

export const billItems = sqliteTable('bill_items', {
  id: integer('id').primaryKey(),
  billId: integer('bill_id').references(() => bills.id).notNull(),
  markId: integer('mark_id').references(() => marks.id).notNull(),
  mode: text('mode').notNull(),
  amountCents: integer('amount_cents').notNull(),
}, (table) => ({
  billIdIdx: index('bi_bill_id_idx').on(table.billId),
}));

export const customerMetrics = sqliteTable('customer_metrics', {
  id: integer('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id).unique(),
  avgPaymentDays: integer('avg_payment_days'),
  monthlyVolume: real('monthly_volume'),
  monthlyShipments: integer('monthly_shipments'),
  overdueCount: integer('overdue_count'),
  overallRating: text('overall_rating'),
  lastUpdated: text('last_updated'),
});
