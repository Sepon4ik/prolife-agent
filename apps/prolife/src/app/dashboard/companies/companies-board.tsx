"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ScoreBadge, timeAgo } from "@agency/ui";
import Link from "next/link";
import {
  BOARD_COLUMNS,
  COLUMN_LABELS,
  COLUMN_COLORS,
  type PipelineCompany,
  type BoardColumnId,
} from "./types";
import { updateCompanyStatus } from "./actions";

interface CompaniesBoardProps {
  companies: PipelineCompany[];
}

export function CompaniesBoard({ companies }: CompaniesBoardProps) {
  const [items, setItems] = useState(companies);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeItem = activeId
    ? items.find((c) => c.id === activeId) ?? null
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const companyId = String(active.id);
      const newStatus = String(over.id) as BoardColumnId;

      const company = items.find((c) => c.id === companyId);
      if (!company || company.status === newStatus) return;

      // Optimistic update
      setItems((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, status: newStatus } : c))
      );

      try {
        await updateCompanyStatus({ companyId, status: newStatus });
      } catch {
        // Revert on error
        setItems((prev) =>
          prev.map((c) =>
            c.id === companyId ? { ...c, status: company.status } : c
          )
        );
      }
    },
    [items]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px]">
        {BOARD_COLUMNS.map((columnId) => {
          const columnItems = items.filter((c) => c.status === columnId);
          return (
            <BoardColumn
              key={columnId}
              id={columnId}
              items={columnItems}
              activeId={activeId}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? <CompanyCard company={activeItem} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  id,
  items,
  activeId,
}: {
  id: BoardColumnId;
  items: PipelineCompany[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-56 shrink-0 rounded-xl border transition-colors ${
        isOver
          ? "border-primary-600/40 bg-primary-600/5"
          : "border-white/5 bg-white/[0.02]"
      }`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
        <div className={`w-2 h-2 rounded-full ${COLUMN_COLORS[id]}`} />
        <span className="text-xs font-medium text-gray-300">
          {COLUMN_LABELS[id]}
        </span>
        <span className="text-[10px] text-gray-600 ml-auto tabular-nums">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
        {items.map((company) => (
          <DraggableCard
            key={company.id}
            company={company}
            isHidden={company.id === activeId}
          />
        ))}
        {items.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[10px] text-gray-700">Drop here</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  company,
  isHidden,
}: {
  company: PipelineCompany;
  isHidden: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: company.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isHidden ? "opacity-30" : ""}
    >
      <CompanyCard company={company} isDragging={isDragging} />
    </div>
  );
}

function CompanyCard({
  company,
  isDragging,
}: {
  company: PipelineCompany;
  isDragging?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-white/5 bg-dark-secondary p-3 cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging ? "shadow-xl shadow-black/50 ring-1 ring-primary-600/30" : ""
      }`}
    >
      <Link
        href={`/dashboard/companies/${company.id}`}
        className="text-xs font-medium text-white hover:text-primary-400 transition-colors line-clamp-2 leading-snug"
        onClick={(e) => {
          // Don't navigate while dragging
          if (isDragging) e.preventDefault();
        }}
      >
        {company.name}
      </Link>

      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[10px] text-gray-500 truncate">
          {company.country}
        </span>
        <span className="text-gray-700">&middot;</span>
        <span className="text-[10px] text-gray-600">
          {company.type.replace(/_/g, " ")}
        </span>
      </div>

      <div className="flex items-center justify-between mt-2">
        <ScoreBadge score={company.score} size="sm" />
        <span className="text-[10px] text-gray-600 tabular-nums">
          {timeAgo(new Date(company.updatedAt))}
        </span>
      </div>
    </div>
  );
}
