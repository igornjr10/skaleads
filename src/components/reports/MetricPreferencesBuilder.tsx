import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";

interface MetricOption {
  key: string;
  label: string;
  helper: string;
}

interface MetricPreferencesBuilderProps {
  options: readonly MetricOption[];
  value: string[];
  onChange: (next: string[]) => void;
}

function DraggableCard({ option, removable, onRemove }: { option: MetricOption; removable: boolean; onRemove?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl border border-border/70 bg-background p-2.5"
    >
      <span {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{option.label}</p>
        <p className="truncate text-xs text-muted-foreground">{option.helper}</p>
      </div>
      {removable && (
        <button type="button" onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remover ${option.label}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Column({ id, title, hint, options, children }: { id: string; title: string; hint: string; options: MetricOption[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] space-y-2 rounded-xl border border-dashed p-2 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-border/60"
        }`}
      >
        <SortableContext items={options.map((o) => o.key)} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
        {options.length === 0 && (
          <p className="p-3 text-center text-xs text-muted-foreground">Arraste métricas até aqui</p>
        )}
      </div>
    </div>
  );
}

// Construtor tipo Reportei: arrasta a metrica da coluna "Disponiveis" pra
// "No relatorio" — a ordem em que ficam ali e a mesma ordem que aparece no
// PDF/dashboard (metricPreferences e um array ordenado, nao um set).
export function MetricPreferencesBuilder({ options, value, onChange }: MetricPreferencesBuilderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selected = value
    .map((key) => options.find((option) => option.key === key))
    .filter((option): option is MetricOption => !!option);
  const available = options.filter((option) => !value.includes(option.key));
  const activeOption = options.find((option) => option.key === activeId) ?? null;

  function containerOf(id: string): "available" | "selected" {
    if (id === "available-zone") return "available";
    if (id === "selected-zone") return "selected";
    return value.includes(id) ? "selected" : "available";
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    const from = containerOf(activeKey);
    const to = containerOf(overKey);
    if (from === to) return;

    if (from === "selected" && to === "available") {
      onChange(value.filter((key) => key !== activeKey));
    } else if (from === "available" && to === "selected") {
      const overIndex = value.indexOf(overKey);
      const next = [...value];
      next.splice(overIndex === -1 ? next.length : overIndex, 0, activeKey);
      onChange(next);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    if (value.includes(activeKey) && value.includes(overKey)) {
      const oldIndex = value.indexOf(activeKey);
      const newIndex = value.indexOf(overKey);
      onChange(arrayMove(value, oldIndex, newIndex));
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <Column id="available-zone" title="Disponíveis" hint="Arraste pra incluir no relatório" options={available}>
          {available.map((option) => (
            <DraggableCard key={option.key} option={option} removable={false} />
          ))}
        </Column>

        <Column id="selected-zone" title="No relatório" hint="A ordem aqui é a ordem no PDF" options={selected}>
          {selected.map((option) => (
            <DraggableCard
              key={option.key}
              option={option}
              removable
              onRemove={() => onChange(value.filter((key) => key !== option.key))}
            />
          ))}
        </Column>
      </div>

      <DragOverlay>
        {activeOption && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-background p-2.5 shadow-lg">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{activeOption.label}</p>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
