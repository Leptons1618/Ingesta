"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { COLUMN_TYPE_OPTIONS } from "@/lib/schema"
import type { DatabaseColumn } from "@/lib/types"
import { cn } from "@/lib/utils"

import {
  setColumnAdd,
  setColumnDrop,
  setColumnOrder,
  setColumnRename,
  setColumnType,
  type PendingChanges,
} from "./pending-changes"

const TYPE_GROUPS = [...new Set(COLUMN_TYPE_OPTIONS.map((option) => option.group))]
const DEFAULT_TYPE = "VARCHAR(255)"

/**
 * Every type picker in the studio goes through this, so an engine-specific type
 * the table already has (NVARCHAR(MAX), for one) is still selectable instead of
 * rendering as an empty trigger.
 */
function ColumnTypeSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string
  onChange: (type: string) => void
  disabled?: boolean
  label: string
}) {
  const known = COLUMN_TYPE_OPTIONS.some((option) => option.value === value)

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {known ? null : <SelectItem value={value}>{value}</SelectItem>}
        {TYPE_GROUPS.map((group) => (
          <div key={group}>
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</p>
            {COLUMN_TYPE_OPTIONS.filter((option) => option.group === group).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Column editing happens on the table's live structure and only records intent:
 * nothing reaches the database until the pending plan is applied.
 */
export function ColumnEditor({
  open,
  onOpenChange,
  structure,
  pending,
  onPendingChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  structure: DatabaseColumn[]
  pending: PendingChanges
  onPendingChange: (next: PendingChanges) => void
}) {
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState(DEFAULT_TYPE)
  const [newNullable, setNewNullable] = useState(true)

  const original = structure.map((column) => column.name)
  const order = pending.order ?? original
  const ordered = order
    .map((name) => structure.find((column) => column.name === name))
    .filter((column): column is DatabaseColumn => Boolean(column))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    // Back to the engine's own order means there is nothing left to remember.
    onPendingChange(setColumnOrder(pending, next.join("\u0000") === original.join("\u0000") ? null : next))
  }

  const addColumn = () => {
    const name = newName.trim()
    if (!name) return
    const column = {
      name,
      type: newType,
      nullable: newNullable,
      isPrimaryKey: false,
    }
    onPendingChange(setColumnAdd(pending, column))
    setNewName("")
    setNewType(DEFAULT_TYPE)
    setNewNullable(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit columns</DialogTitle>
          <DialogDescription>
            Add, rename, retype, drop or reorder columns. Nothing is written until you apply the pending changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {ordered.map((column, index) => {
            const rename = pending.renames.find((entry) => entry.from === column.name)
            const change = pending.types.find((entry) => entry.column === column.name)
            const dropped = pending.drops.some((entry) => entry.column === column.name)
            const name = rename?.to ?? column.name
            const type = change?.type ?? column.type
            const nullable = change?.nullable ?? column.nullable

            return (
              <div
                key={column.name}
                className={cn(
                  "grid items-center gap-2 rounded-xl border bg-muted/20 p-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,11rem)_auto_auto]",
                  dropped && "opacity-60",
                )}
              >
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${column.name} up`}
                    disabled={index === 0 || dropped}
                    onClick={() => move(index, -1)}
                    className="size-7"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${column.name} down`}
                    disabled={index === ordered.length - 1 || dropped}
                    onClick={() => move(index, 1)}
                    className="size-7"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>

                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    value={name}
                    disabled={dropped}
                    aria-label={`Column name for ${column.name}`}
                    className={cn("h-8", dropped && "line-through")}
                    onChange={(event) =>
                      onPendingChange(
                        setColumnRename(pending, column.name, event.target.value === column.name ? "" : event.target.value),
                      )
                    }
                  />
                  {column.isPrimaryKey ? (
                    <span
                      title="Primary key: row edits and deletes are matched on this column"
                      className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                    >
                      <KeyRound className="size-3" />
                      PK
                    </span>
                  ) : null}
                </div>

                <ColumnTypeSelect
                  value={type}
                  disabled={dropped}
                  label={`Type for ${column.name}`}
                  onChange={(next) =>
                    onPendingChange(
                      setColumnType(pending, {
                        column: column.name,
                        from: column.type,
                        fromNullable: column.nullable,
                        type: next,
                        nullable,
                      }),
                    )
                  }
                />

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={nullable}
                    disabled={dropped}
                    aria-label={`${column.name} allows NULL`}
                    onCheckedChange={(checked) =>
                      onPendingChange(
                        setColumnType(pending, {
                          column: column.name,
                          from: column.type,
                          fromNullable: column.nullable,
                          type,
                          nullable: checked,
                        }),
                      )
                    }
                  />
                  Null
                </label>

                {dropped ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPendingChange({ ...pending, drops: pending.drops.filter((entry) => entry.column !== column.name) })}
                  >
                    <RotateCcw className="size-3.5" />
                    Undo
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onPendingChange(setColumnDrop(pending, column.name))}
                  >
                    <Trash2 className="size-3.5" />
                    Drop
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {pending.adds.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed p-2">
            {pending.adds.map((add) => (
              <div key={add.column.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  <span className="font-medium">{add.column.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {add.column.type}
                    {add.column.nullable ? ", nullable" : ", not null"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPendingChange({ ...pending, adds: pending.adds.filter((entry) => entry.column.name !== add.column.name) })}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid items-end gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto_auto]">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="table-studio-new-column">
              New column
            </label>
            <Input
              id="table-studio-new-column"
              value={newName}
              placeholder="shipped_at"
              className="h-8"
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>

          <ColumnTypeSelect value={newType} label="New column type" onChange={setNewType} />

          <label className="flex items-center gap-2 pb-1.5 text-xs text-muted-foreground">
            <Switch checked={newNullable} aria-label="New column allows NULL" onCheckedChange={setNewNullable} />
            Null
          </label>

          <Button size="sm" onClick={addColumn} disabled={!newName.trim()}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>

        <DialogFooter>
          <p className="mr-auto text-xs text-muted-foreground">
            Reordering is kept for the next “save as”; database engines do not move columns in place.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
