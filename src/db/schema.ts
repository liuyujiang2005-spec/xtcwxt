import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

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

export const shipments = sqliteTable('shipments', {
  id: integer('id').primaryKey(),
  shipmentNo: text('shipment_no').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id),
  shipmentType: text('shipment_type').notNull(),
  goodsType: text('goods_type').notNull(),
  volume: real('volume').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  totalReceivableCents: integer('total_receivable_cents').notNull(),
  currency: text('currency').default('CNY'),
  status: text('status').default('运输中').$type<'运输中' | '已到仓' | '已签收' | '已结算' | '部分已收'>(),
  monthTag: text('month_tag').notNull(),
  blNo: text('bl_no'),
  containerNo: text('container_no'),
  etd: text('etd'),
  etaBkk: text('eta_bkk'),
  remark: text('remark'),
  createdAt: text('created_at'),
}, (table) => ({
  monthTagIdx: index('shipments_month_tag_idx').on(table.monthTag),
  customerIdIdx: index('shipments_customer_id_idx').on(table.customerId),
}));

export const shipmentCosts = sqliteTable('shipment_costs', {
  id: integer('id').primaryKey(),
  shipmentId: integer('shipment_id').references(() => shipments.id),
  costType: text('cost_type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  remark: text('remark'),
}, (table) => ({
  shipmentIdIdx: index('shipment_costs_shipment_id_idx').on(table.shipmentId),
}));

export const paymentsReceived = sqliteTable('payments_received', {
  id: integer('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  receivedDate: text('received_date').notNull(),
  remark: text('remark'),
}, (table) => ({
  customerIdIdx: index('payments_received_customer_id_idx').on(table.customerId),
}));

export const paymentShipmentAllocations = sqliteTable('payment_shipment_allocations', {
  id: integer('id').primaryKey(),
  paymentReceivedId: integer('payment_received_id').references(() => paymentsReceived.id),
  shipmentId: integer('shipment_id').references(() => shipments.id),
  amountCents: integer('amount_cents').notNull(),
}, (table) => ({
  shipmentIdIdx: index('payment_alloc_shipment_id_idx').on(table.shipmentId),
}));

export const paymentsMade = sqliteTable('payments_made', {
  id: integer('id').primaryKey(),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  paidDate: text('paid_date').notNull(),
  shipmentId: integer('shipment_id').references(() => shipments.id),
  costType: text('cost_type'),
  remark: text('remark'),
});

export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey(),
  invoiceNo: text('invoice_no').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id),
  type: text('type'),
  status: text('status').default('待开'),
  totalAmountCents: integer('total_amount_cents').notNull(),
  currency: text('currency').default('CNY'),
  issueDate: text('issue_date'),
  dueDate: text('due_date'),
  remark: text('remark'),
}, (table) => ({
  customerIdIdx: index('invoices_customer_id_idx').on(table.customerId),
}));

export const invoiceItems = sqliteTable('invoice_items', {
  id: integer('id').primaryKey(),
  invoiceId: integer('invoice_id').references(() => invoices.id),
  shipmentId: integer('shipment_id').references(() => shipments.id),
  amountCents: integer('amount_cents').notNull(),
});

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
