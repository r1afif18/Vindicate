"use client"

import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react"

import { useRecovery } from "@/components/recovery/recovery-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { networkList } from "@/lib/chains"
import { cn } from "@/lib/utils"

/** Network pill. Switching networks clears the scan because balances belong to one chain. */
export function NetworkSelect() {
  const { state, dispatch, network } = useRecovery()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 cursor-pointer items-center gap-2 border border-border bg-muted px-3.5 text-sm transition-colors duration-quick hover:bg-accent"
        >
          <span
            className={cn("size-2 rounded-full", network.delegate ? "bg-success" : "bg-warning")}
          />
          {network.name}
          <CaretDownIcon className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {networkList.map((n) => (
          <DropdownMenuItem
            key={n.id}
            disabled={!n.delegate}
            onSelect={() =>
              n.id !== state.networkId && dispatch({ type: "network", networkId: n.id })
            }
          >
            <span
              className={cn(
                "size-2 rounded-full",
                n.delegate ? "bg-success" : "bg-muted-foreground",
              )}
            />
            <span className="grid flex-1">
              <span>{n.name}</span>
              <span className="text-xs text-muted-foreground">
                {n.delegate ? `Chain ${n.chain.id}` : "Not deployed yet"}
              </span>
            </span>
            {n.id === state.networkId ? <CheckIcon className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
