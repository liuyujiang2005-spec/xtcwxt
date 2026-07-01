'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  TrendingDown,
  Users,
  Truck,
  FileText,
  BarChart3,
  Receipt,
  LogOut,
  ChevronLeft,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

interface SidebarProps {
  user: {
    id: number;
    username: string;
    displayName: string;
    role: string;
  };
}

const navigation = [
  {
    title: '概览',
    items: [
      { name: '仪表盘', href: '/', icon: LayoutDashboard },
      { name: '收入总表', href: '/revenue', icon: TrendingUp },
      { name: '支出总表', href: '/expenses', icon: TrendingDown },
    ],
  },
  {
    title: '业务管理',
    items: [
      { name: '票货管理', href: '/shipments', icon: Package },
      { name: '发票管理', href: '/invoices', icon: Receipt },
    ],
  },
  {
    title: '账务管理',
    items: [
      { name: '客户账期', href: '/accounts/customers', icon: Users },
      { name: '供应商应付', href: '/accounts/suppliers', icon: Truck },
    ],
  },
  {
    title: '报表',
    items: [
      { name: '月度报表', href: '/reports/monthly', icon: BarChart3 },
    ],
  },
  {
    title: '基础数据',
    items: [
      { name: '客户管理', href: '/customers', icon: Users },
      { name: '供应商管理', href: '/suppliers', icon: Truck },
    ],
  },
  {
    title: '系统管理',
    items: [
      { name: '用户管理', href: '/users', icon: Shield },
    ],
  },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const filteredNavigation = navigation.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (section.title === '系统管理' && user.role !== 'admin') return false;
      if (user.role === 'viewer') {
        const allowedItems = ['仪表盘', '收入总表', '支出总表', '票货管理', '客户账期', '供应商应付', '月度报表'];
        return allowedItems.includes(item.name);
      }
      if (user.role === 'operator') {
        const hiddenItems = ['客户管理', '供应商管理'];
        return !hiddenItems.includes(item.name);
      }
      return true;
    })
  })).filter(section => section.items.length > 0);

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-sidebar text-sidebar-foreground h-screen sticky top-0 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className={cn('flex items-center h-14 px-4 border-b border-sidebar-border', collapsed && 'justify-center')}>
        {!collapsed && (
          <Link href="/" className="font-bold text-lg whitespace-nowrap">
            货运财务
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn('ml-auto h-8 w-8', collapsed && 'ml-0')}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </Button>
      </div>

      <ScrollArea className="flex-1 py-2">
        {filteredNavigation.map((section) => (
          <div key={section.title} className="px-2 mb-2">
            {!collapsed && (
              <h3 className="text-xs font-semibold text-sidebar-foreground/60 px-3 py-2 uppercase tracking-wider">
                {section.title}
              </h3>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start mb-1',
                      collapsed && 'justify-center px-0'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 flex-shrink-0', !collapsed && 'mr-2')} />
                    {!collapsed && <span>{item.name}</span>}
                  </Button>
                </Link>
              );
            })}
          </div>
        ))}
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      <div className="p-2">
        <div className={cn('flex items-center gap-2 px-3 py-2', collapsed && 'justify-center')}>
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium flex-shrink-0">
            {user.displayName.charAt(0)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user.role}</p>
            </div>
          )}
        </div>
        <form action="/api/auth/logout" method="POST">
          <Button
            variant="ghost"
            className={cn('w-full justify-start text-muted-foreground', collapsed && 'justify-center px-0')}
            type="submit"
          >
            <LogOut className={cn('h-4 w-4 flex-shrink-0', !collapsed && 'mr-2')} />
            {!collapsed && <span>退出登录</span>}
          </Button>
        </form>
      </div>
    </aside>
  );
}
