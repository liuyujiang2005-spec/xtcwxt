import { sqliteTable, text, integer, real, index, unique } from 'drizzle-orm/sqlite-core';
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
  priceMatrixThb: text('price_matrix_thb'),
  enableMinVolume: integer('enable_min_volume').default(1),
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
  markNo: text('mark_no').notNull(),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  mode: text('mode').notNull(),
  monthTag: text('month_tag').notNull(),
  remark: text('remark'),
  receiptUrl: text('receipt_url'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  monthTagIdx: index('marks_month_tag_idx').on(table.monthTag),
  customerIdIdx: index('marks_customer_id_idx').on(table.customerId),
  markNoMonthUnique: unique('marks_mark_no_month_unique').on(table.markNo, table.monthTag),
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
  单项体积: real('单项体积'),
  总体积: real('总体积').notNull(),
  国内单号: text('国内单号'),
  单箱数量: integer('单箱数量'),
  总重量: real('总重量'),
   箱数: integer('箱数'),
   pcs数量: integer('pcs数量'),
   仓库: text('仓库'),
   单项重量: real('单项重量'),
   备注: text('备注'),
   成本单价: real('成本单价'),
  需支付总价: real('需支付总价'),
  货型: text('货型'),
  运输方式: text('运输方式'),
  客户应收: integer('客户应收'),
  单项应收: real('单项应收'),
  订单总价: real('订单总价'),
  运单号: text('运单号'),
  cost_status: text('cost_status').default('待支出'),
  paidDate: text('paid_date'),
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
  单项体积: real('单项体积'),
  总体积: real('总体积').notNull(),
  国内单号: text('国内单号'),
  单箱数量: integer('单箱数量'),
  总重量: real('总重量'),
  箱数: integer('箱数'),
  pcs数量: integer('pcs数量'),
  单价: real('单价'),
  需支付总价: real('需支付总价'),
  客户应收: real('客户应收'),
  单项应收: real('单项应收'),
  仓库: text('仓库'),
  运单号: text('运单号'),
  货型: text('货型'),
  运输方式: text('运输方式'),
  payment_status: text('payment_status').default('待支付'),
  paidDate: text('paid_date'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  batchIdIdx: index('li_batch_id_idx').on(table.batchId),
  markIdIdx: index('li_mark_id_idx').on(table.markId),
}));

export const directIncome = sqliteTable('direct_income', {
  id: integer('id').primaryKey(),
  markId: integer('mark_id').references(() => marks.id),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').default('CNY'),
  volume: real('volume'),
  incomeDate: text('income_date').notNull(),
  仓库: text('仓库'),
  remark: text('remark'),
  receiptUrl: text('receipt_url'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  customerIdIdx: index('di_customer_id_idx').on(table.customerId),
  incomeDateIdx: index('di_income_date_idx').on(table.incomeDate),
}));

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey(),
  loadingBatchId: integer('loading_batch_id').references(() => loadingBatches.id),
  sharedContainerBatchId: integer('shared_container_batch_id').references(() => sharedContainerBatches.id),
  expenseType: text('expense_type').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').default('CNY'),
  supplierId: integer('supplier_id'),
  status: text('status').default('待支付'),
  paidDate: text('paid_date'),
  仓库: text('仓库'),
  remark: text('remark'),
  receiptUrl: text('receipt_url'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  expenseTypeIdx: index('exp_type_idx').on(table.expenseType),
  statusIdx: index('exp_status_idx').on(table.status),
  batchTypeUnique: unique('expenses_batch_type_unique').on(table.loadingBatchId, table.expenseType),
  batchTypeScUnique: unique('expenses_sc_batch_type_unique').on(table.sharedContainerBatchId, table.expenseType),
}));

export const paymentsReceived = sqliteTable('payments_received', {
  id: integer('id').primaryKey(),
  markId: integer('mark_id').references(() => marks.id),
  customerId: integer('customer_id').references(() => customers.id),
  amount: integer('amount').notNull(),
  currency: text('currency').default('CNY'),
  receivedDate: text('received_date').notNull(),
  remark: text('remark'),
}, (table) => ({
  customerIdIdx: index('payments_received_customer_id_idx').on(table.customerId),
}));

export const paymentsMade = sqliteTable('payments_made', {
  id: integer('id').primaryKey(),
  supplierId: integer('supplier_id'),
  expenseId: integer('expense_id').references(() => expenses.id),
  amount: integer('amount').notNull(),
  currency: text('currency').default('CNY'),
  paidDate: text('paid_date').notNull(),
  remark: text('remark'),
});

export const bills = sqliteTable('bills', {
  id: integer('id').primaryKey(),
  billNo: text('bill_no').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  monthTag: text('month_tag').notNull(),
  totalAmount: real('total_amount').notNull(),
  paidAmount: real('paid_amount').default(0),
  remainingAmount: real('remaining_amount').default(0),
  paymentStatus: text('payment_status').default('待付款'),
  exportedAt: text('exported_at'),
  paidAt: text('paid_at'),
  currency: text('currency').default('CNY'),
  status: text('status').default('待生成'),
  receiptUrl: text('receipt_url'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  customerMonthIdx: index('bills_customer_month_idx').on(table.customerId, table.monthTag),
}));

export const billItems = sqliteTable('bill_items', {
  id: integer('id').primaryKey(),
  billId: integer('bill_id').references(() => bills.id).notNull(),
  markId: integer('mark_id').references(() => marks.id).notNull(),
  mode: text('mode').notNull(),
  amount: real('amount').notNull(),
  costAmount: real('cost_amount').default(0),
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
