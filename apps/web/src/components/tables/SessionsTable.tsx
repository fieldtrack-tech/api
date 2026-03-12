"use client";

import { DataTable, type ColumnDef } from "@/components/tables/DataTable";
import { AttendanceSession } from "@/types";
import { formatDate, formatTime, formatDistance, formatDuration } from "@/lib/utils";
import { Clock } from "lucide-react";

interface SessionsTableProps {
  sessions: AttendanceSession[];
  onRowClick?: (id: string) => void;
  isLoading: boolean;
  page?: number;
  hasMore?: boolean;
  onPageChange?: (page: number) => void;
  showEmployee?: boolean;
}

const baseColumns: ColumnDef<AttendanceSession>[] = [
  {
    key: "checkin_at",
    title: "Date",
    sortable: true,
    render: (s) => formatDate(s.checkin_at),
  },
  {
    key: "checkin_time",
    title: "Check-in",
    render: (s) => formatTime(s.checkin_at),
  },
  {
    key: "checkout_at",
    title: "Check-out",
    render: (s) => (s.checkout_at ? formatTime(s.checkout_at) : "\u2014"),
  },
  {
    key: "total_distance_km",
    title: "Distance",
    sortable: true,
    render: (s) => formatDistance(s.total_distance_km),
  },
  {
    key: "total_duration_seconds",
    title: "Duration",
    sortable: true,
    render: (s) => formatDuration(s.total_duration_seconds),
  },
];

const employeeColumn: ColumnDef<AttendanceSession> = {
  key: "employee_name",
  title: "Employee",
  render: (s) => s.employee_name ?? s.employee_id.slice(0, 8) + "…",
};

export function SessionsTable({
  sessions,
  onRowClick,
  isLoading,
  page,
  hasMore,
  onPageChange,
  showEmployee = false,
}: SessionsTableProps) {
  const columns = showEmployee
    ? [employeeColumn, ...baseColumns]
    : baseColumns;

  return (
    <DataTable
      columns={columns}
      data={sessions}
      rowKey={(s) => s.id}
      isLoading={isLoading}
      onRowClick={onRowClick ? (s) => onRowClick(s.id) : undefined}
      emptyIcon={Clock}
      emptyTitle="No sessions found"
      emptyDescription="Sessions will appear here once they are recorded."
      page={page}
      hasMore={hasMore}
      onPageChange={onPageChange}
    />
  );
}
