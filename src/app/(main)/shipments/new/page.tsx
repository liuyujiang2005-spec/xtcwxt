import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { customers, suppliers } from '@/db/schema';
import NewShipmentForm from './form';

export default async function NewShipmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (user.role === 'viewer') redirect('/shipments');

  const allCustomers = await db.select().from(customers).all();
  const allSuppliers = await db.select().from(suppliers).all();

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">新建票货</h1>
      <NewShipmentForm customers={allCustomers} suppliers={allSuppliers} />
    </div>
  );
}
