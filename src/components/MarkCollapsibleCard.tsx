'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function MarkCollapsibleCard({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <div className="p-3 border-b flex items-center justify-between bg-muted/30 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-6 w-6" type="button">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          {header}
        </div>
      </div>
      {expanded && (
        <CardContent className="p-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
