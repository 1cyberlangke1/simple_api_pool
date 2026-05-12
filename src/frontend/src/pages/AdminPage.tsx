import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  DatabaseZap,
  Edit3,
  FileText,
  Key,
  KeyRound,
  Loader2,
  LogOut,
  Workflow,
  Plus,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2
} from "lucide-react";

import { normalizeErrorMessage } from "@/api.js";
import { ProviderBadgeIcon } from "@/components/provider/ProviderBadgeIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecretInput } from "@/components/ui/secret-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildGroupPayload,
  createDefaultGroupCollectionDraft,
  createDefaultGroupDraft,
  createDefaultGroupEntryDraft,
  createGroupDraftFromSnapshot,
  moveGroupEntry,
  shouldShowPriorityField,
  shouldShowWeightField
} from "@/forms/group_form.js";
import type { AdminGroupSnapshot, AdminKeySnapshot, AdminLogEntry, AdminProviderSnapshot, AdminProviderStatsSnapshot } from "@/lib/admin";
import {
  buildBulkDisableRequest,
  extractProviderModelNames,
  filterProviderModelNames,
  filterGroupsBySearch,
  isKeyDisabledAt
} from "@/lib/admin";
import { formatDateTime, formatDisabledUntil, formatLogSummary, formatNumber, formatPercent } from "@/lib/format";
import { useAdminOverview, type AdminTab } from "@/hooks/useAdminOverview";
import { deleteGroup, fetchProviderModelDiscovery, saveGroup } from "@/services/admin_service.js";
import { useAppStore } from "@/store/appStore";

const providerTypeOptions = ["openai_chat", "openai_responses", "claude", "gemini"] as const;
const keyStrategyOptions = ["round_robin", "fill"] as const;
const groupStrategyOptions = ["weighted_random", "failover"] as const;

const sectionVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28
    }
  }
};

function getProviderTone(
  providerStats: AdminProviderStatsSnapshot | undefined,
  providerSnapshot: AdminProviderSnapshot | null
): {
  badgeVariant: "destructive" | "success" | "warning";
  statusLabel: "error" | "ok" | "warning";
} {
  const availableKeys = Number(providerStats?.available_keys || 0);
  const totalKeys = Number(providerStats?.total_keys || providerSnapshot?.keys?.length || 0);
  const successCount = Number(providerStats?.success_count || 0);
  const errorCount = Number(providerStats?.error_count || 0);

  if (totalKeys > 0 && availableKeys === 0) {
    return {
      badgeVariant: "destructive" as const,
      statusLabel: "error"
    };
  }
  if (errorCount > successCount && errorCount > 0) {
    return {
      badgeVariant: "warning" as const,
      statusLabel: "warning"
    };
  }
  return {
    badgeVariant: "success" as const,
    statusLabel: "ok"
  };
}

function readLogLevel(entry: Pick<AdminLogEntry, "level"> | Record<string, unknown>) {
  const level = String(entry.level || "").toUpperCase();
  if (level === "ERROR" || level === "WARN" || level === "INFO" || level === "DEBUG") {
    return level;
  }
  return "INFO";
}

function toDateTimeLocalValue(timestampMs: number) {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatDurationLabel(totalSeconds: number) {
  if (totalSeconds % 3600 === 0) {
    return `${totalSeconds / 3600}h`;
  }
  if (totalSeconds % 60 === 0) {
    return `${totalSeconds / 60}m`;
  }
  return `${totalSeconds}s`;
}

function createDisablePresetSeconds(bounds: { max: number; min: number }) {
  const presetCandidates = [bounds.min, 300, 600, 1800, 3600, 21600, bounds.max];
  const presetValues = new Set<number>();
  for (let index = 0; index < presetCandidates.length; index += 1) {
    const value = presetCandidates[index];
    if (value < bounds.min || value > bounds.max) {
      continue;
    }
    presetValues.add(value);
  }
  return Array.from(presetValues).sort(function sortDisablePreset(left, right) {
    return left - right;
  });
}

function ProviderStatusCapsule(props: {
  status: "error" | "ok" | "warning";
}) {
  const className =
    props.status === "error"
      ? "border-[#EF4444] bg-[#EF4444] text-white dark:border-[#EF4444] dark:bg-[#EF4444] dark:text-white"
      : props.status === "warning"
        ? "border-[#d97706] bg-[#f59e0b] text-white dark:border-[#fcd34d] dark:bg-[#b45309] dark:text-white"
        : "border-[#29e154] bg-[#29e154] text-white dark:border-[#29e154] dark:bg-[#29e154] dark:text-white";

  return (
    <div
      className={`inline-flex h-8 w-[92px] items-center justify-center rounded-full border text-center text-[11px] font-semibold uppercase tracking-[0.24em] ${className}`}
    >
      {props.status}
    </div>
  );
}

function buildErrorAlertClassName() {
  return "rounded-lg border border-[#EF4444] bg-[#EF4444] px-4 py-3 text-sm font-medium text-white dark:border-[#EF4444] dark:bg-[#EF4444] dark:text-white";
}

function buildSuccessAlertClassName() {
  return "rounded-lg border border-[#29e154] bg-[#29e154] px-4 py-3 text-sm font-medium text-white dark:border-[#29e154] dark:bg-[#29e154] dark:text-white";
}

function buildNotificationKind(messageKind: "" | "error" | "ok" | "warning") {
  if (messageKind === "ok") {
    return "ok" as const;
  }
  if (messageKind === "warning") {
    return "warning" as const;
  }
  return "error" as const;
}

function buildLogLevelClassName(level: string) {
  if (level === "ERROR") {
    return "font-semibold tracking-[0.18em] text-[#b91c1c] dark:text-[#fecaca]";
  }
  if (level === "WARN") {
    return "font-semibold tracking-[0.18em] text-[#92400e] dark:text-[#fde68a]";
  }
  if (level === "DEBUG") {
    return "font-semibold tracking-[0.18em] text-[#7c3aed] dark:text-[#ddd6fe]";
  }
  return "font-semibold tracking-[0.18em] text-[#1d4ed8] dark:text-[#93c5fd]";
}

function AdminLogPanel(props: {
  entries: AdminLogEntry[];
  emptyText: string;
  heightClassName: string;
  showFullTimestamp?: boolean;
}) {
  return (
    <div className={`${props.heightClassName} overflow-auto rounded-xl border bg-muted/20 shadow-sm`}>
      <div className="min-w-full divide-y divide-border/60 font-mono text-xs">
        {props.entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{props.emptyText}</div>
        ) : (
          props.entries.map(function renderLogEntry(entry, index) {
            const level = readLogLevel(entry);
            const summaryText = formatLogSummary(entry as { attrs?: Record<string, unknown> }) || String(entry.msg || "");
            const timestampText = String(entry.time || "").replace("T", " ");
            return (
              <div
                className="grid gap-2 px-4 py-3 transition-colors hover:bg-background/80 md:grid-cols-[132px_84px_180px_minmax(0,1fr)]"
                key={`${entry.time || "log"}-${index}`}
              >
                <span className="text-[11px] text-muted-foreground">
                  {props.showFullTimestamp ? timestampText.slice(0, 23) : timestampText.slice(11, 19)}
                </span>
                <span className={buildLogLevelClassName(level)}>{level}</span>
                <span className="truncate text-foreground/90">{String(entry.msg || "-")}</span>
                <span className="break-all text-muted-foreground">{summaryText}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function AdminTerminalLogPanel(props: {
  entries: AdminLogEntry[];
  emptyText: string;
  heightClassName: string;
}) {
  return (
    <div className={`${props.heightClassName} overflow-auto rounded-md border bg-[#1e1e1e] p-4 font-mono text-xs text-[#d4d4d4]`}>
      {props.entries.length === 0 ? (
        <div className="py-8 text-center text-slate-400">{props.emptyText}</div>
      ) : (
        props.entries.map(function renderLogEntry(entry, index) {
          const level = readLogLevel(entry);
          return (
            <div className="mb-1.5 flex gap-4 opacity-90 hover:opacity-100" key={`${entry.time || "log"}-${index}`}>
              <span className="w-24 shrink-0 text-[#858585]">
                {String(entry.time || "").replace("T", " ").slice(11, 19)}
              </span>
              <span
                className={`w-14 shrink-0 ${
                  level === "ERROR"
                    ? "text-[#f14c4c]"
                    : level === "WARN"
                      ? "text-[#cca700]"
                      : level === "DEBUG"
                        ? "text-[#c586c0]"
                        : "text-[#3794ff]"
                }`}
              >
                [{level}]
              </span>
              <span className="truncate">{formatLogSummary(entry as { attrs?: Record<string, unknown> }) || String(entry.msg || "")}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

function ProviderField(props: {
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
  value: boolean | number | string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        disabled={props.disabled}
        id={props.id}
        onChange={function handleChange(event) {
          props.onChange(event.target.value);
        }}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        type={props.type || "text"}
        value={String(props.value ?? "")}
      />
    </div>
  );
}

function ProviderDialogBody(props: {
  draft: Record<string, boolean | number | string> | null;
  isEditMode?: boolean;
  onChange: (fieldName: string, fieldValue: boolean | number | string) => void;
  translate: (key: string, params?: Record<string, unknown>) => string;
}) {
  if (!props.draft) {
    return null;
  }

  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ProviderField
          id="provider-name"
          label={props.translate("provider.name")}
          onChange={function handleNameChange(value) {
            props.onChange("name", value);
          }}
          readOnly={props.isEditMode}
          value={props.draft.name}
        />
        <div className="space-y-2">
          <Label htmlFor="provider-type">{props.translate("provider.type")}</Label>
          <Select
            disabled={props.isEditMode}
            onValueChange={function handleTypeChange(value) {
              props.onChange("type", value);
            }}
            value={String(props.draft.type || "openai_chat")}
          >
            <SelectTrigger id="provider-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerTypeOptions.map(function renderProviderType(value) {
                return (
                  <SelectItem key={value} value={value}>
                    {props.translate(`provider.type.${value}`)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ProviderField
        id="provider-base-url"
        label={props.translate("provider.baseUrl")}
        onChange={function handleBaseUrlChange(value) {
          props.onChange("base_url", value);
        }}
        placeholder={props.translate("provider.baseUrlPlaceholder")}
        value={props.draft.base_url}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="provider-key-strategy">{props.translate("provider.keyStrategy")}</Label>
          <Select
            onValueChange={function handleStrategyChange(value) {
              props.onChange("key_strategy", value);
            }}
            value={String(props.draft.key_strategy || "round_robin")}
          >
            <SelectTrigger id="provider-key-strategy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keyStrategyOptions.map(function renderStrategy(value) {
                return (
                  <SelectItem key={value} value={value}>
                    {props.translate(`provider.strategy.${value}`)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <ProviderField
          id="provider-fail-threshold"
          label={props.translate("provider.failThreshold")}
          onChange={function handleFailThresholdChange(value) {
            props.onChange("fail_threshold", Number(value || 0));
          }}
          type="number"
          value={props.draft.fail_threshold}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ProviderField
          id="provider-min-disable"
          label={props.translate("provider.minDisableSecs")}
          onChange={function handleMinDisableChange(value) {
            props.onChange("min_disable_secs", Number(value || 0));
          }}
          type="number"
          value={props.draft.min_disable_secs}
        />
        <ProviderField
          id="provider-max-disable"
          label={props.translate("provider.maxDisableSecs")}
          onChange={function handleMaxDisableChange(value) {
            props.onChange("max_disable_secs", Number(value || 0));
          }}
          type="number"
          value={props.draft.max_disable_secs}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <ProviderField
          id="provider-cache-entries"
          label={props.translate("provider.cacheMaxEntries")}
          onChange={function handleCacheEntriesChange(value) {
            props.onChange("cache_max_entries", Number(value || 0));
          }}
          type="number"
          value={props.draft.cache_max_entries}
        />
        <div className="space-y-2">
          <Label htmlFor="provider-cache-enabled">{props.translate("provider.cacheEnabled")}</Label>
          <div className="flex h-10 items-center justify-end rounded-md border bg-muted/30 px-3">
            <Switch
              checked={Boolean(props.draft.cache_enabled)}
              id="provider-cache-enabled"
              onCheckedChange={function handleCacheEnabledChange(checked) {
                props.onChange("cache_enabled", checked);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupDialogBody(props: {
  availableProviders: AdminProviderSnapshot[];
  activeEntryModelPickerKey: string;
  draft: ReturnType<typeof createDefaultGroupDraft>;
  getEntryModelOptions: (collectionIndex: number, entryIndex: number) => string[];
  isEntryModelLoading: (collectionIndex: number, entryIndex: number) => boolean;
  onAddCollection: () => void;
  onAddEntry: (collectionIndex: number) => void;
  onCollectionChange: (collectionIndex: number, fieldName: string, fieldValue: string) => void;
  onEntryChange: (collectionIndex: number, entryIndex: number, fieldName: string, fieldValue: number | string) => void;
  onFetchEntryModels: (collectionIndex: number, entryIndex: number) => void;
  onGroupChange: (fieldName: string, fieldValue: boolean | number | string) => void;
  onOpenEntryModelPicker: (collectionIndex: number, entryIndex: number) => void;
  onCloseEntryModelPicker: () => void;
  onMoveEntry: (collectionIndex: number, entryIndex: number, direction: "down" | "up") => void;
  onRemoveCollection: (collectionIndex: number) => void;
  onRemoveEntry: (collectionIndex: number, entryIndex: number) => void;
  onSelectEntryModel: (collectionIndex: number, entryIndex: number, modelName: string) => void;
  readOnlyName: boolean;
  translate: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <div className="space-y-6 py-2">
      <div className="grid gap-4 md:grid-cols-2">
        <ProviderField
          id="group-name"
          label={props.translate("group.name")}
          onChange={function handleGroupNameChange(value) {
            props.onGroupChange("name", value);
          }}
          readOnly={props.readOnlyName}
          value={props.draft.name}
        />
        <div className="space-y-2">
          <Label htmlFor="group-type">{props.translate("group.type")}</Label>
          <Select
            disabled={props.readOnlyName}
            onValueChange={function handleGroupTypeChange(value) {
              props.onGroupChange("type", value);
            }}
            value={String(props.draft.type || "openai_chat")}
          >
            <SelectTrigger id="group-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerTypeOptions.map(function renderGroupTypeOption(value) {
                return (
                  <SelectItem key={value} value={value}>
                    {props.translate(`provider.type.${value}`)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <ProviderField
          id="group-cache-entries"
          label={props.translate("group.cacheMaxEntries")}
          onChange={function handleGroupCacheEntriesChange(value) {
            props.onGroupChange("cache_max_entries", Number(value || 0));
          }}
          type="number"
          value={props.draft.cache_max_entries}
        />
        <div className="space-y-2">
          <Label htmlFor="group-cache-enabled">{props.translate("group.cacheEnabled")}</Label>
          <div className="flex h-10 items-center justify-end rounded-md border bg-muted/30 px-3">
            <Switch
              checked={Boolean(props.draft.cache_enabled)}
              id="group-cache-enabled"
              onCheckedChange={function handleGroupCacheEnabledChange(checked) {
                props.onGroupChange("cache_enabled", checked);
              }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold">{props.translate("group.collections")}</h4>
            <p className="text-xs text-muted-foreground">{props.translate("group.collectionsHint")}</p>
          </div>
          <Button onClick={props.onAddCollection} size="sm" type="button" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            {props.translate("group.addCollection")}
          </Button>
        </div>

        {props.draft.collections.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
            {props.translate("group.emptyCollections")}
          </div>
        ) : null}

        <div className="space-y-4">
          {props.draft.collections.map(function renderCollection(collection, collectionIndex) {
            return (
              <div className="space-y-4 rounded-xl border bg-background p-4 shadow-sm" key={`group-collection-${collectionIndex}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="grid flex-1 gap-4 md:grid-cols-2">
                    <ProviderField
                      id={`group-collection-name-${collectionIndex}`}
                      label={props.translate("group.collectionName")}
                      onChange={function handleCollectionNameChange(value) {
                        props.onCollectionChange(collectionIndex, "name", value);
                      }}
                      value={collection.name}
                    />
                    <div className="space-y-2">
                      <Label htmlFor={`group-collection-strategy-${collectionIndex}`}>{props.translate("group.strategy")}</Label>
                      <Select
                        onValueChange={function handleCollectionStrategyChange(value) {
                          props.onCollectionChange(collectionIndex, "strategy", value);
                        }}
                        value={String(collection.strategy || "weighted_random")}
                      >
                        <SelectTrigger id={`group-collection-strategy-${collectionIndex}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {groupStrategyOptions.map(function renderStrategyOption(value) {
                            return (
                              <SelectItem key={value} value={value}>
                                {props.translate(`group.strategy.${value}`)}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={function handleRemoveCollectionClick() {
                      props.onRemoveCollection(collectionIndex);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h5 className="text-sm font-medium">{props.translate("group.entries")}</h5>
                      <p className="text-xs text-muted-foreground">{props.translate("group.entriesHint")}</p>
                    </div>
                    <Button
                      onClick={function handleAddEntryClick() {
                        props.onAddEntry(collectionIndex);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {props.translate("group.addEntry")}
                    </Button>
                  </div>

                  {collection.entries.map(function renderEntry(entry, entryIndex) {
                    const showWeightField = shouldShowWeightField(collection.strategy);
                    const showPriorityField = shouldShowPriorityField(collection.strategy);
                    const modelOptions = props.getEntryModelOptions(collectionIndex, entryIndex);
                    const pickerKey = `group-entry-model-${collectionIndex}:${entryIndex}`;
                    const visibleModelOptions = filterProviderModelNames(modelOptions, String(entry.model || ""));
                    const modelPickerOpen = props.activeEntryModelPickerKey === pickerKey && visibleModelOptions.length > 0;
                    return (
                      <div
                        className="grid gap-3 rounded-lg border bg-muted/20 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(180px,220px)_44px]"
                        key={`group-entry-${collectionIndex}-${entryIndex}`}
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`group-entry-provider-${collectionIndex}-${entryIndex}`}>{props.translate("group.entryProvider")}</Label>
                          <Select
                            onValueChange={function handleEntryProviderChange(value) {
                              props.onEntryChange(collectionIndex, entryIndex, "provider", value);
                            }}
                            value={String(entry.provider || "")}
                          >
                            <SelectTrigger id={`group-entry-provider-${collectionIndex}-${entryIndex}`}>
                              <SelectValue placeholder={props.translate("group.entryProviderPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {props.availableProviders.map(function renderProviderOption(providerSnapshot) {
                                return (
                                  <SelectItem key={providerSnapshot.name} value={providerSnapshot.name}>
                                    {providerSnapshot.name}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`group-entry-model-${collectionIndex}-${entryIndex}`}>{props.translate("group.entryModel")}</Label>
                          <div className="relative">
                            <div className="flex items-stretch gap-2">
                              <Input
                                autoComplete="off"
                                id={`group-entry-model-${collectionIndex}-${entryIndex}`}
                                onBlur={function handleEntryModelBlur() {
                                  window.setTimeout(function closeEntryModelPicker() {
                                    props.onCloseEntryModelPicker();
                                  }, 120);
                                }}
                                onChange={function handleEntryModelChange(event) {
                                  props.onEntryChange(collectionIndex, entryIndex, "model", event.target.value);
                                  if (modelOptions.length > 0) {
                                    props.onOpenEntryModelPicker(collectionIndex, entryIndex);
                                  }
                                }}
                                onFocus={function handleEntryModelFocus() {
                                  if (modelOptions.length > 0) {
                                    props.onOpenEntryModelPicker(collectionIndex, entryIndex);
                                  }
                                }}
                                placeholder={props.translate("group.entryModelPlaceholder")}
                                value={String(entry.model || "")}
                              />
                              <Button
                                disabled={!entry.provider || props.isEntryModelLoading(collectionIndex, entryIndex)}
                                onClick={function handleFetchEntryModelsClick() {
                                  props.onFetchEntryModels(collectionIndex, entryIndex);
                                }}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                {props.isEntryModelLoading(collectionIndex, entryIndex) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Search className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            {modelPickerOpen ? (
                              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-auto rounded-xl border bg-popover p-1 shadow-lg">
                                {visibleModelOptions.map(function renderModelOption(modelName) {
                                  return (
                                    <button
                                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                                      key={modelName}
                                      onClick={function handleSelectModelClick() {
                                        props.onSelectEntryModel(collectionIndex, entryIndex, modelName);
                                      }}
                                      onMouseDown={function handleSelectModelMouseDown(event) {
                                        event.preventDefault();
                                      }}
                                      type="button"
                                    >
                                      <span className="truncate">{modelName}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {showWeightField ? (
                          <ProviderField
                            id={`group-entry-weight-${collectionIndex}-${entryIndex}`}
                            label={props.translate("group.entryWeight")}
                            onChange={function handleEntryWeightChange(value) {
                              props.onEntryChange(collectionIndex, entryIndex, "weight", Number(value || 0));
                            }}
                            type="number"
                            value={entry.weight}
                          />
                        ) : null}
                        {showPriorityField ? (
                          <div className="space-y-2">
                            <Label>{props.translate("group.entryPriority")}</Label>
                            <div className="flex h-10 items-center justify-between gap-2 rounded-md border bg-background px-3">
                              <span className="min-w-10 font-mono text-base font-semibold text-foreground">#{entryIndex + 1}</span>
                              <Button
                                disabled={entryIndex === 0}
                                onClick={function handleMoveUpClick() {
                                  props.onMoveEntry(collectionIndex, entryIndex, "up");
                                }}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                disabled={entryIndex >= collection.entries.length - 1}
                                onClick={function handleMoveDownClick() {
                                  props.onMoveEntry(collectionIndex, entryIndex, "down");
                                }}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex h-10 items-center justify-end xl:self-end">
                          <Button
                            onClick={function handleRemoveEntryClick() {
                              props.onRemoveEntry(collectionIndex, entryIndex);
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AdminPage() {
  const [bulkDisableDialogOpen, setBulkDisableDialogOpen] = useState(false);
  const [bulkDisableMode, setBulkDisableMode] = useState<"duration" | "forever" | "until">("duration");
  const [bulkDisableSeconds, setBulkDisableSeconds] = useState(3600);
  const [bulkDisableUntil, setBulkDisableUntil] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<"create" | "edit">("create");
  const [groupDraft, setGroupDraft] = useState(createDefaultGroupDraft());
  const [groupModelPickerKey, setGroupModelPickerKey] = useState("");
  const [groupModelOptions, setGroupModelOptions] = useState<Record<string, string[]>>({});
  const [groupModelLoadingKey, setGroupModelLoadingKey] = useState("");
  const [groupMessage, setGroupMessage] = useState<{ kind: "" | "error" | "ok"; text: string }>({ kind: "", text: "" });
  const [keyEditLoading, setKeyEditLoading] = useState(false);
  const [keyEditDialogOpen, setKeyEditDialogOpen] = useState(false);
  const [keyEditPending, setKeyEditPending] = useState(false);
  const [keyEditRef, setKeyEditRef] = useState("");
  const [keyEditValue, setKeyEditValue] = useState("");
  const language = useAppStore(function selectLanguage(state) {
    return state.language;
  });
  const translate = useAppStore(function selectTranslate(state) {
    return state.translate;
  });
  const notify = useAppStore(function selectNotify(state) {
    return state.notify;
  });
  const { actions, derived, state } = useAdminOverview(translate, language);

  const selectedProvider = derived.selectedProvider;
  const selectedProviderKeys = selectedProvider?.keys || [];
  const editableKeySnapshot = useMemo(function computeEditableKeySnapshot() {
    return selectedProviderKeys.find(function matchKeySnapshot(keySnapshot) {
      return keySnapshot.ref === keyEditRef;
    }) || null;
  }, [keyEditRef, selectedProviderKeys]);
  const selectedProviderName = state.selectedProviderName;
  const hasSelectedProvider = Boolean(selectedProvider);
  const providerCount = state.overview.providers.length;
  const currentTimeMs = state.clockNow || Date.now();
  const currentTimeUnix = Math.floor(currentTimeMs / 1000);
  const clientKeyCount = state.globalConfigLoaded
    ? state.globalDraft.client_keys.length
    : Number(state.overview.global_config.client_key_count || 0);
  const canSaveAdminKey = state.globalAdminKeyDirty && String(state.globalDraft.admin_key || "").trim() !== "";
  const activeKeyCount = formatNumber(derived.selectedProviderStats.available_keys || 0);
  const totalKeyCount = formatNumber(derived.selectedProviderStats.total_keys || selectedProviderKeys.length);
  const providerDialogDraft = state.providerDialogMode === "create" ? state.createProviderDraft : state.providerDraft;
  const visibleGroups = useMemo(function computeVisibleGroups() {
    return filterGroupsBySearch(state.overview.groups || [], groupSearch);
  }, [groupSearch, state.overview.groups]);
  const availableGroupProviders = useMemo(function computeAvailableGroupProviders() {
    return (state.overview.providers || []).filter(function keepProvider(providerSnapshot) {
      return providerSnapshot.type === String(groupDraft.type || "openai_chat");
    });
  }, [groupDraft.type, state.overview.providers]);
  const disablePresetSeconds = useMemo(function computeDisablePresetSeconds() {
    return createDisablePresetSeconds(derived.disableBounds);
  }, [derived.disableBounds]);
  useEffect(function syncBulkDisableDraft() {
    const nextSeconds = Math.min(Math.max(3600, derived.disableBounds.min), derived.disableBounds.max);
    setBulkDisableSeconds(nextSeconds);
    setBulkDisableUntil(toDateTimeLocalValue(Date.now() + nextSeconds * 1000));
  }, [derived.disableBounds.max, derived.disableBounds.min, selectedProviderName]);

  useEffect(function relayFlashMessageToNotifications() {
    if (!state.flashMessage.text) {
      return;
    }
    notify(buildNotificationKind(state.flashMessage.kind), state.flashMessage.text);
  }, [notify, state.flashMessage]);

  useEffect(function relayLoginMessageToNotifications() {
    if (!state.loginMessage.text) {
      return;
    }
    notify(buildNotificationKind(state.loginMessage.kind), state.loginMessage.text);
  }, [notify, state.loginMessage]);

  useEffect(function relayGroupMessageToNotifications() {
    if (!groupMessage.text) {
      return;
    }
    notify(buildNotificationKind(groupMessage.kind), groupMessage.text);
  }, [groupMessage, notify]);

  function getGroupEntryKey(collectionIndex: number, entryIndex: number) {
    return `${collectionIndex}:${entryIndex}`;
  }

  function openCreateGroupDialog() {
    setGroupMessage({ kind: "", text: "" });
    setGroupDialogMode("create");
    setGroupDraft(createDefaultGroupDraft());
    setGroupModelPickerKey("");
    setGroupModelOptions({});
    setGroupModelLoadingKey("");
    setGroupDialogOpen(true);
  }

  function openEditGroupDialog(groupSnapshot: AdminGroupSnapshot) {
    setGroupMessage({ kind: "", text: "" });
    setGroupDialogMode("edit");
    setGroupDraft(createGroupDraftFromSnapshot(groupSnapshot) || createDefaultGroupDraft());
    setGroupModelPickerKey("");
    setGroupModelOptions({});
    setGroupModelLoadingKey("");
    setGroupDialogOpen(true);
  }

  function closeGroupDialog() {
    setGroupDialogOpen(false);
    setGroupModelPickerKey("");
    setGroupModelLoadingKey("");
  }

  async function openKeyEditDialog(keySnapshot: AdminKeySnapshot) {
    setKeyEditRef(String(keySnapshot.ref || ""));
    setKeyEditValue("");
    setKeyEditLoading(true);
    setKeyEditPending(false);
    setKeyEditDialogOpen(true);
    const rawValue = await actions.fetchProviderKeyValue(String(keySnapshot.ref || ""));
    setKeyEditValue(rawValue);
    setKeyEditLoading(false);
  }

  function closeKeyEditDialog() {
    setKeyEditDialogOpen(false);
    setKeyEditLoading(false);
    setKeyEditPending(false);
    setKeyEditRef("");
    setKeyEditValue("");
  }

  async function saveEditedKey() {
    if (!editableKeySnapshot || keyEditPending) {
      return;
    }
    setKeyEditPending(true);
    const success = await actions.saveProviderKeyValue(editableKeySnapshot.ref, keyEditValue);
    setKeyEditPending(false);
    if (success) {
      closeKeyEditDialog();
    }
  }

  function updateGroupField(fieldName: string, fieldValue: boolean | number | string) {
    setGroupDraft(function applyGroupField(previousDraft) {
      return {
        ...previousDraft,
        [fieldName]: fieldValue
      };
    });
  }

  function updateGroupCollectionField(collectionIndex: number, fieldName: string, fieldValue: string) {
    setGroupDraft(function applyCollectionField(previousDraft) {
      return {
        ...previousDraft,
        collections: previousDraft.collections.map(function mapCollection(collectionDraft, index) {
          if (index !== collectionIndex) {
            return collectionDraft;
          }
          return {
            ...collectionDraft,
            [fieldName]: fieldValue
          };
        })
      };
    });
  }

  function updateGroupEntryField(collectionIndex: number, entryIndex: number, fieldName: string, fieldValue: number | string) {
    if (fieldName === "provider") {
      const entryKey = getGroupEntryKey(collectionIndex, entryIndex);
      setGroupModelPickerKey(function clearPickerKey(previousKey) {
        return previousKey === `group-entry-model-${entryKey}` ? "" : previousKey;
      });
      setGroupModelOptions(function clearEntryModelOptions(previousOptions) {
        if (!(entryKey in previousOptions)) {
          return previousOptions;
        }
        const nextOptions = { ...previousOptions };
        delete nextOptions[entryKey];
        return nextOptions;
      });
    }
    setGroupDraft(function applyEntryField(previousDraft) {
      return {
        ...previousDraft,
        collections: previousDraft.collections.map(function mapCollection(collectionDraft, currentCollectionIndex) {
          if (currentCollectionIndex !== collectionIndex) {
            return collectionDraft;
          }
          return {
            ...collectionDraft,
            entries: collectionDraft.entries.map(function mapEntry(entryDraft, currentEntryIndex) {
              if (currentEntryIndex !== entryIndex) {
                return entryDraft;
              }
              return {
                ...entryDraft,
                [fieldName]: fieldValue
              };
            })
          };
        })
      };
    });
  }

  function addGroupCollection() {
    setGroupDraft(function appendCollection(previousDraft) {
      return {
        ...previousDraft,
        collections: previousDraft.collections.concat([createDefaultGroupCollectionDraft()])
      };
    });
  }

  function removeGroupCollection(collectionIndex: number) {
    setGroupDraft(function deleteCollection(previousDraft) {
      return {
        ...previousDraft,
        collections: previousDraft.collections.filter(function keepCollection(_collectionDraft, index) {
          return index !== collectionIndex;
        })
      };
    });
  }

  function addGroupEntry(collectionIndex: number) {
    setGroupDraft(function appendEntry(previousDraft) {
      return {
        ...previousDraft,
        collections: previousDraft.collections.map(function mapCollection(collectionDraft, index) {
          if (index !== collectionIndex) {
            return collectionDraft;
          }
          return {
            ...collectionDraft,
            entries: collectionDraft.entries.concat([createDefaultGroupEntryDraft()])
          };
        })
      };
    });
  }

  function removeGroupEntry(collectionIndex: number, entryIndex: number) {
    setGroupDraft(function deleteEntry(previousDraft) {
      return {
        ...previousDraft,
        collections: previousDraft.collections.map(function mapCollection(collectionDraft, index) {
          if (index !== collectionIndex) {
            return collectionDraft;
          }
          return {
            ...collectionDraft,
            entries: collectionDraft.entries.filter(function keepEntry(_entryDraft, currentEntryIndex) {
              return currentEntryIndex !== entryIndex;
            })
          };
        })
      };
    });
  }

  function moveGroupCollectionEntry(collectionIndex: number, entryIndex: number, direction: "down" | "up") {
    setGroupDraft(function reorderCollectionEntries(previousDraft) {
      return {
        ...previousDraft,
        collections: previousDraft.collections.map(function mapCollection(collectionDraft, index) {
          if (index !== collectionIndex) {
            return collectionDraft;
          }
          return {
            ...collectionDraft,
            entries: moveGroupEntry(collectionDraft.entries, entryIndex, direction)
          };
        })
      };
    });
  }

  function getGroupEntryModelOptions(collectionIndex: number, entryIndex: number) {
    return groupModelOptions[getGroupEntryKey(collectionIndex, entryIndex)] || [];
  }

  function openGroupEntryModelPicker(collectionIndex: number, entryIndex: number) {
    setGroupModelPickerKey(`group-entry-model-${getGroupEntryKey(collectionIndex, entryIndex)}`);
  }

  function closeGroupEntryModelPicker() {
    setGroupModelPickerKey("");
  }

  function selectGroupEntryModel(collectionIndex: number, entryIndex: number, modelName: string) {
    updateGroupEntryField(collectionIndex, entryIndex, "model", modelName);
    setGroupModelPickerKey("");
  }

  function isGroupEntryModelLoading(collectionIndex: number, entryIndex: number) {
    return groupModelLoadingKey === getGroupEntryKey(collectionIndex, entryIndex);
  }

  async function fetchGroupEntryModels(collectionIndex: number, entryIndex: number) {
    const entrySnapshot = groupDraft.collections[collectionIndex]?.entries?.[entryIndex];
    const providerName = String(entrySnapshot?.provider || "").trim();
    if (!providerName) {
      setGroupMessage({ kind: "error", text: translate("group.modelDiscoveryProviderRequired") });
      return;
    }

    const clientKey = (state.globalDraft.client_keys || []).find(function findClientKey(keyValue) {
      return String(keyValue || "").trim() !== "";
    });
    if (!clientKey) {
      setGroupMessage({ kind: "error", text: translate("group.modelDiscoveryMissingClientKey") });
      return;
    }

    const providerSnapshot = (state.overview.providers || []).find(function findProvider(provider) {
      return provider.name === providerName;
    });
    if (!providerSnapshot) {
      setGroupMessage({ kind: "error", text: translate("group.modelDiscoveryProviderRequired") });
      return;
    }

    const loadingKey = getGroupEntryKey(collectionIndex, entryIndex);
    setGroupModelLoadingKey(loadingKey);
    try {
      const response = await fetchProviderModelDiscovery(providerSnapshot.name, providerSnapshot.type, clientKey);
      const modelNames = extractProviderModelNames(providerSnapshot.type, response.data);
      setGroupModelOptions(function updateGroupModelOptions(previousOptions) {
        return {
          ...previousOptions,
          [loadingKey]: modelNames
        };
      });
      if (modelNames.length === 0) {
        setGroupMessage({ kind: "error", text: translate("group.modelDiscoveryEmpty") });
      } else {
        openGroupEntryModelPicker(collectionIndex, entryIndex);
        setGroupMessage({ kind: "", text: "" });
      }
    } catch (error) {
      setGroupMessage({ kind: "error", text: normalizeErrorMessage(error, translate("group.modelDiscoveryFailed")) });
    } finally {
      setGroupModelLoadingKey(function clearLoadingKey(previousKey) {
        return previousKey === loadingKey ? "" : previousKey;
      });
    }
  }

  async function saveGroupDraftState() {
    try {
      await saveGroup(buildGroupPayload(groupDraft));
      setGroupMessage({ kind: "ok", text: translate(groupDialogMode === "create" ? "group.createSuccess" : "group.saveSuccess") });
      setGroupDialogOpen(false);
      await actions.loadOverview(true);
    } catch (error) {
      setGroupMessage({ kind: "error", text: normalizeErrorMessage(error, translate(groupDialogMode === "create" ? "group.createFailed" : "group.saveFailed")) });
    }
  }

  async function deleteGroupByName(groupName: string) {
    if (!window.confirm(translate("group.deleteConfirm"))) {
      return;
    }
    try {
      await deleteGroup(groupName);
      setGroupMessage({ kind: "ok", text: translate("group.deleteSuccess") });
      await actions.loadOverview(true);
    } catch (error) {
      setGroupMessage({ kind: "error", text: normalizeErrorMessage(error, translate("group.deleteFailed")) });
    }
  }

  if (!state.checkedAuth && state.pending) {
    return (
      <motion.div animate="visible" initial="hidden" variants={sectionVariants}>
        <Card className="min-h-[24rem] animate-pulse">
          <CardHeader className="space-y-3">
            <div className="h-5 w-32 rounded-full bg-muted" />
            <div className="h-10 w-72 rounded-full bg-muted" />
            <div className="h-4 w-96 rounded-full bg-muted" />
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  if (!state.authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.div animate="visible" className="w-full max-w-md" initial="hidden" variants={sectionVariants}>
          <Card className="border-primary/20 shadow-lg">
            <CardHeader className="pb-2 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldAlert className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">{translate("admin.loginTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={function handleLoginSubmit(event) {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  const adminKey = String(formData.get("adminKey") || "");
                  void actions.login(adminKey);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="adminKey">{translate("admin.adminKey")}</Label>
                  <SecretInput
                    autoComplete="current-password"
                    hiddenLabel={translate("secret.show")}
                    id="adminKey"
                    leadingAdornment={<KeyRound className="h-4 w-4" />}
                    name="adminKey"
                    placeholder={translate("admin.adminKeyPlaceholder")}
                    visibleLabel={translate("secret.hide")}
                  />
                </div>
                <Button className="w-full" disabled={state.loginPending} type="submit">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {translate("admin.login")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div animate="visible" className="space-y-8" initial="hidden" variants={sectionVariants}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{translate("app.adminTitle")}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1">
              {translate("status.lastUpdated")}: {state.loadedAt ? formatDateTime(state.loadedAt, language) : translate("message.loading")}
            </span>
            <span className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1">
              {translate("status.providers")}: {formatNumber(providerCount)}
            </span>
          </div>
        </div>
        <Button onClick={function handleLogout() {
          void actions.logout();
        }} variant="outline">
          <LogOut className="mr-2 h-4 w-4" />
          {translate("action.logout")}
        </Button>
      </div>

      <Tabs
        className="w-full"
        onValueChange={function handleTabChange(value) {
          actions.setActiveTab(value as AdminTab);
        }}
        value={state.activeTab}
      >
        <TabsList className="mb-4 h-auto w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger className="flex items-center gap-2" value="global">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("admin.tab.global")}</span>
          </TabsTrigger>
          <TabsTrigger className="flex items-center gap-2" value="providers">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("admin.tab.providers")}</span>
          </TabsTrigger>
          <TabsTrigger className="flex items-center gap-2" value="groups">
            <Workflow className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("admin.tab.groups")}</span>
          </TabsTrigger>
          <TabsTrigger className="flex items-center gap-2" value="keys">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("admin.tab.keys")}</span>
          </TabsTrigger>
          <TabsTrigger className="flex items-center gap-2" value="logs">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("admin.tab.logs")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="global">
          <Card>
            <CardHeader>
              <CardTitle>{translate("admin.globalTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="global-admin-key">{translate("admin.adminKey")}</Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <SecretInput
                    autoComplete="new-password"
                    hiddenLabel={translate("secret.show")}
                    id="global-admin-key"
                    onChange={function handleAdminKeyChange(event) {
                      actions.setAdminKey(event.target.value);
                    }}
                    placeholder={translate("admin.adminKeyPlaceholder")}
                    value={String(state.globalDraft.admin_key || "")}
                    visibleLabel={translate("secret.hide")}
                    wrapperClassName="sm:flex-1"
                  />
                  <Button
                    disabled={!canSaveAdminKey}
                    onClick={function handleSaveAdminKey() {
                      void actions.saveAdminKey();
                    }}
                    type="button"
                  >
                    {translate("admin.saveAdminKey")}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-base">{translate("admin.tokenEstimation")}</Label>
                    {state.tokenEstimationPending ? (
                      <Badge variant="outline">{translate("message.saving")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{translate("admin.globalTokenHint")}</p>
                </div>
                <Switch
                  checked={Boolean(state.globalDraft.token_estimation_enabled)}
                  disabled={state.tokenEstimationPending}
                  onCheckedChange={function handleTokenEstimationChange(checked) {
                    actions.setTokenEstimationEnabled(checked);
                  }}
                />
              </div>

              <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <Label className="text-base">{translate("admin.clientKeys")}</Label>
                    <p className="text-sm text-muted-foreground">{translate("admin.clientKeysHint")}</p>
                  </div>
                  <Button
                    disabled={state.globalConfigPending && !state.globalConfigLoaded || state.clientKeysPending}
                    onClick={actions.addClientKey}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {translate("action.addKey")}
                  </Button>
                </div>

                {state.globalConfigPending && !state.globalConfigLoaded ? (
                  <div className="rounded-lg border border-dashed bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                    {translate("message.loading")}
                  </div>
                ) : null}

                {!state.globalConfigPending || state.globalConfigLoaded ? (
                  <>
                    {state.globalDraft.client_keys.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                        {translate("admin.noClientKeys")}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {state.globalDraft.client_keys.map(function renderClientKeyRow(clientKeyValue: string, index: number) {
                        return (
                          <div className="flex items-center gap-2" key={`client-key-${index}`}>
                            <SecretInput
                              autoComplete="off"
                              disabled={state.clientKeysPending}
                              hiddenLabel={translate("secret.show")}
                              onChange={function handleClientKeyChange(event) {
                                actions.updateClientKey(index, event.target.value);
                              }}
                              placeholder={translate("admin.importPlaceholder")}
                              value={clientKeyValue}
                              visibleLabel={translate("secret.hide")}
                              wrapperClassName="flex-1"
                            />
                            <Button
                              aria-label={translate("action.delete")}
                              disabled={state.clientKeysPending}
                              onClick={function handleClientKeyDelete() {
                                actions.removeClientKey(index);
                              }}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}

                {state.clientKeysPending ? (
                  <div className="flex items-center justify-end border-t pt-4">
                    <Badge variant="outline">{translate("message.saving")}</Badge>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 sm:gap-6">
                  <div>
                    <span className="block text-xs uppercase tracking-wide">{translate("admin.clientKeys")}</span>
                    <strong className="mt-1 block text-base text-foreground">{formatNumber(clientKeyCount)}</strong>
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-wide">{translate("status.providers")}</span>
                    <strong className="mt-1 block text-base text-foreground">{formatNumber(providerCount)}</strong>
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-wide">{translate("status.lastUpdated")}</span>
                    <strong className="mt-1 block text-base text-foreground">
                      {state.loadedAt ? formatDateTime(state.loadedAt, language) : "-"}
                    </strong>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="providers">
          <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4 shadow-sm">
            <h3 className="text-lg font-medium">{translate("admin.providerListTitle")}</h3>
            <Button onClick={actions.openProviderCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {translate("action.createProvider")}
            </Button>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={function handleProviderSearch(event) {
                  actions.setProviderSearch(event.target.value);
                }}
                placeholder={translate("admin.providerSearchPlaceholder")}
                value={state.providerSearch}
              />
            </div>
          </div>

          {derived.visibleProviders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {translate("admin.providerListEmpty")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {derived.visibleProviders.map(function renderProviderCard(providerSnapshot) {
                const stats = state.overview.provider_stats[providerSnapshot.name] || {};
                const tone = getProviderTone(stats, providerSnapshot);
                const isSelected = providerSnapshot.name === selectedProviderName;
                const totalKeys = Number(stats.total_keys || providerSnapshot.keys.length);
                const availableKeys = Number(stats.available_keys || 0);
                return (
                  <Card className={isSelected ? "border-primary/50 shadow-md" : undefined} key={providerSnapshot.name}>
                    <CardHeader className="py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-center gap-3">
                          <ProviderBadgeIcon providerHints={[providerSnapshot.type, providerSnapshot.name]} size={28} />
                          <div>
                            <CardTitle className="text-lg">{providerSnapshot.name}</CardTitle>
                            <CardDescription className="mt-1 font-mono text-xs">
                              {translate(`provider.type.${providerSnapshot.type}`)}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ProviderStatusCapsule status={tone.statusLabel} />
                          <Button
                            onClick={function handleKeysNavigate() {
                              actions.selectProvider(providerSnapshot.name);
                              actions.setActiveTab("keys");
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <Key className="mr-2 h-4 w-4" />
                            {translate("admin.tab.keys")}
                          </Button>
                          <Button
                            onClick={function handleEditProvider() {
                              actions.openProviderEditDialog(providerSnapshot.name);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <Edit3 className="mr-2 h-4 w-4" />
                            {translate("action.edit")}
                          </Button>
                          <Button
                            data-cache-clear-icon="database-zap"
                            onClick={function handleClearCache() {
                              void actions.clearProviderCacheByName(providerSnapshot.name);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <DatabaseZap className="mr-2 h-4 w-4" />
                            {translate("action.clearCache")}
                          </Button>
                          <Button
                            onClick={function handleDeleteProvider() {
                              void actions.deleteProviderByName(providerSnapshot.name);
                            }}
                            size="sm"
                            variant="destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="py-0 pb-4">
                      <div className="grid gap-4 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("provider.baseUrl")}
                          </span>
                          <code className="break-all text-foreground">{providerSnapshot.base_url || "-"}</code>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("provider.keyStrategy")}
                          </span>
                          <span className="text-foreground">
                            {translate(`provider.strategy.${providerSnapshot.key_strategy}`)}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("provider.cacheEnabled")}
                          </span>
                          <span className="text-foreground">
                            {providerSnapshot.cache_enabled ? translate("state.enabled") : translate("state.disabled")}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("provider.cacheMaxEntries")}
                          </span>
                          <span className="text-foreground">
                            {formatNumber(providerSnapshot.cache_max_entries)}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("provider.failThreshold")}
                          </span>
                          <span className="text-foreground">
                            {formatNumber(providerSnapshot.fail_threshold)}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("provider.minDisableSecs")}
                          </span>
                          <span className="text-foreground">
                            {formatNumber(providerSnapshot.min_disable_secs)}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("provider.maxDisableSecs")}
                          </span>
                          <span className="text-foreground">
                            {formatNumber(providerSnapshot.max_disable_secs)}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("status.availableKeys")}
                          </span>
                          <span className="text-foreground">
                            {formatNumber(availableKeys)} / {formatNumber(totalKeys)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("status.successRate")}
                          </span>
                          <strong className="mt-1 block text-foreground">
                            {formatPercent(stats.success_count, stats.error_count)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("status.requestCount")}
                          </span>
                          <strong className="mt-1 block text-foreground">
                            {formatNumber((stats.success_count || 0) + (stats.error_count || 0))}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("status.inputTokens")}
                          </span>
                          <strong className="mt-1 block text-foreground">
                            {formatNumber(stats.input_tokens || 0)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("status.outputTokens")}
                          </span>
                          <strong className="mt-1 block text-foreground">
                            {formatNumber(stats.output_tokens || 0)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("status.cacheHits")}
                          </span>
                          <strong className="mt-1 block text-foreground">
                            {formatNumber(stats.cache_hits || 0)}
                          </strong>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent className="space-y-4" value="groups">
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-md border bg-background p-2 text-muted-foreground shadow-sm">
                <Workflow className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-medium">{translate("group.listTitle")}</h3>
            </div>
            <Button onClick={openCreateGroupDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {translate("action.createGroup")}
            </Button>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={function handleGroupSearchChange(event) {
                  setGroupSearch(event.target.value);
                }}
                placeholder={translate("group.searchPlaceholder")}
                value={groupSearch}
              />
            </div>
          </div>

          {visibleGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {translate("group.listEmpty")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {visibleGroups.map(function renderGroupCard(groupSnapshot) {
                return (
                  <Card key={groupSnapshot.name}>
                    <CardHeader className="py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-md border bg-background p-2 text-muted-foreground shadow-sm">
                            <Workflow className="h-5 w-5" />
                          </div>
                          <div className="space-y-1">
                            <CardTitle className="text-lg">{groupSnapshot.name}</CardTitle>
                            <CardDescription>
                              {translate(`provider.type.${groupSnapshot.type}`)}
                              {" · "}
                              {translate("group.collectionCount", { count: groupSnapshot.collections.length })}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={function handleEditGroupClick() {
                              openEditGroupDialog(groupSnapshot);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <Edit3 className="mr-2 h-4 w-4" />
                            {translate("action.edit")}
                          </Button>
                          <Button
                            onClick={function handleDeleteGroupClick() {
                              void deleteGroupByName(groupSnapshot.name);
                            }}
                            size="sm"
                            variant="destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("group.cacheEnabled")}
                          </span>
                          <span className="text-foreground">
                            {groupSnapshot.cache_enabled ? translate("state.enabled") : translate("state.disabled")}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("group.cacheMaxEntries")}
                          </span>
                          <span className="text-foreground">{formatNumber(groupSnapshot.cache_max_entries)}</span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("group.collections")}
                          </span>
                          <span className="text-foreground">{formatNumber(groupSnapshot.collections.length)}</span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-70">
                            {translate("group.routes")}
                          </span>
                          <span className="font-mono text-foreground">/{groupSnapshot.name}</span>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {groupSnapshot.collections.map(function renderGroupCollection(collectionSnapshot, collectionIndex) {
                          return (
                            <div className="rounded-xl border bg-background p-4" key={`${groupSnapshot.name}-collection-${collectionIndex}`}>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h4 className="font-medium">{collectionSnapshot.name}</h4>
                                  <p className="text-xs text-muted-foreground">
                                    {translate(`group.strategy.${collectionSnapshot.strategy}`)}
                                  </p>
                                </div>
                                <Badge variant="outline">
                                  {translate("group.entryCount", { count: collectionSnapshot.entries.length })}
                                </Badge>
                              </div>

                              <div className="mt-3 grid gap-3">
                                {collectionSnapshot.entries.map(function renderGroupEntry(entrySnapshot, entryIndex) {
                                  const showWeightField = shouldShowWeightField(collectionSnapshot.strategy);
                                  const showPriorityField = shouldShowPriorityField(collectionSnapshot.strategy);
                                  return (
                                    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_92px]" key={`${groupSnapshot.name}-entry-${collectionIndex}-${entryIndex}`}>
                                      <div>
                                        <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                                          {translate("group.entryProvider")}
                                        </span>
                                        <div className="text-foreground">{entrySnapshot.provider}</div>
                                      </div>
                                      <div>
                                        <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                                          {translate("group.entryModel")}
                                        </span>
                                        <div className="break-all font-mono text-foreground">{entrySnapshot.model}</div>
                                      </div>
                                      {showWeightField ? (
                                        <div>
                                          <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                                            {translate("group.entryWeight")}
                                          </span>
                                          <div className="text-foreground">{formatNumber(entrySnapshot.weight)}</div>
                                        </div>
                                      ) : null}
                                      {showPriorityField ? (
                                        <div>
                                          <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                                            {translate("group.entryPriority")}
                                          </span>
                                          <div className="text-foreground">{formatNumber(entryIndex + 1)}</div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent className="space-y-4" value="keys">
          <Card>
            <CardHeader className="border-b pb-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <CardTitle>{translate("admin.tab.keys")}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    onValueChange={function handleProviderChange(value) {
                      actions.selectProvider(value);
                    }}
                    value={selectedProviderName || undefined}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder={translate("admin.selectProvider")} />
                    </SelectTrigger>
                    <SelectContent>
                      {state.overview.providers.map(function renderProviderOption(providerSnapshot) {
                        return (
                          <SelectItem key={providerSnapshot.name} value={providerSnapshot.name}>
                            {providerSnapshot.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button disabled={!hasSelectedProvider} onClick={actions.openImportDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    {translate("action.importKeys")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {!selectedProvider ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  {translate("admin.noProvidersConfigured")}
                </div>
              ) : null}

              {selectedProvider ? (
                <>
                  <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                      <ProviderBadgeIcon providerHints={[selectedProvider.type, selectedProvider.name]} size={28} />
                      <div>
                        <p className="font-medium">{selectedProvider.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {translate(`provider.type.${selectedProvider.type}`)} · {translate("provider.availableKeys", {
                            available: activeKeyCount,
                            total: totalKeyCount
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-sm">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        onChange={function handleKeySearch(event) {
                          actions.setKeySearch(event.target.value);
                        }}
                        placeholder={translate("admin.keySearchPlaceholder")}
                        value={state.keySearch}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={!selectedProvider || derived.visibleKeys.length === 0}
                        onClick={actions.toggleVisibleSelection}
                        size="sm"
                        variant="outline"
                      >
                        {translate("action.selectVisible")}
                      </Button>
                      <Button
                        disabled={state.selectedKeyRefs.length === 0}
                        onClick={actions.clearSelectedKeys}
                        size="sm"
                        variant="outline"
                      >
                        {translate("action.clearSelected")}
                      </Button>
                      <Button
                        disabled={state.selectedKeyRefs.length === 0}
                        onClick={function handleBulkEnable() {
                          void actions.applyBulkAction("enable");
                        }}
                        size="sm"
                      >
                        {translate("action.enableSelected")}
                      </Button>
                      <Button
                        disabled={state.selectedKeyRefs.length === 0}
                        onClick={function handleBulkDisableDialogOpen() {
                          const nextSeconds = Math.min(Math.max(3600, derived.disableBounds.min), derived.disableBounds.max);
                          setBulkDisableMode("duration");
                          setBulkDisableSeconds(nextSeconds);
                          setBulkDisableUntil(toDateTimeLocalValue(Date.now() + nextSeconds * 1000));
                          setBulkDisableDialogOpen(true);
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        {translate("action.disableSelected")}
                      </Button>
                      <Button
                        disabled={state.selectedKeyRefs.length === 0}
                        onClick={function handleBulkDelete() {
                          void actions.applyBulkAction("delete");
                        }}
                        size="sm"
                        variant="destructive"
                      >
                        {translate("action.deleteSelected")}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {translate("provider.selectedCount", { count: state.selectedKeyRefs.length })}
                  </div>

                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3" aria-label="select" />
                          <th className="px-4 py-3 font-medium">{translate("provider.maskedValue")}</th>
                          <th className="px-4 py-3 font-medium">{translate("provider.reference")}</th>
                          <th className="px-4 py-3 font-medium">{translate("provider.disabledUntil")}</th>
                          <th className="px-4 py-3 font-medium">{translate("provider.fails")}</th>
                          <th className="px-4 py-3 text-right font-medium">{translate("admin.actions")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {derived.visibleKeys.length === 0 ? (
                          <tr>
                            <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                              {translate("admin.noKeys")}
                            </td>
                          </tr>
                        ) : null}
                        {derived.visibleKeys.map(function renderKeyRow(keySnapshot: AdminKeySnapshot) {
                          const checked = state.selectedKeyRefs.includes(keySnapshot.ref);
                          const isDisabled = isKeyDisabledAt(keySnapshot.disabled_until, currentTimeUnix);
                          return (
                            <tr className="transition-colors hover:bg-muted/30" key={keySnapshot.ref}>
                              <td className="px-4 py-3">
                                <input
                                  checked={checked}
                                  onChange={function handleCheck(event) {
                                    actions.toggleKeySelection(keySnapshot.ref, event.target.checked);
                                  }}
                                  type="checkbox"
                                />
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">{keySnapshot.value}</td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{keySnapshot.ref}</td>
                              <td className="px-4 py-3">
                                <Badge variant={isDisabled ? "warning" : "success"}>
                                  {formatDisabledUntil(keySnapshot.disabled_until, language, translate, currentTimeMs)}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">{formatNumber(keySnapshot.consecutive_fails)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    aria-label={translate("action.edit")}
                                    onClick={function handleEditSingleKey() {
                                      void openKeyEditDialog(keySnapshot);
                                    }}
                                    size="icon"
                                    variant="ghost"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    aria-label={translate("action.delete")}
                                    onClick={function handleDeleteSingleKey() {
                                      void actions.deleteSingleKey(keySnapshot.ref);
                                    }}
                                    size="icon"
                                    variant="ghost"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="logs">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{translate("admin.logsTitle")}</CardTitle>
                <Button onClick={actions.openLogsDialog} variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  {translate("action.openLogs")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div>
                  <Label htmlFor="hide-panel-logs">{translate("admin.hidePanelLogs")}</Label>
                  <p className="text-sm text-muted-foreground">{translate("admin.logsFiltersSummary")}</p>
                </div>
                <Switch
                  checked={state.hidePanelLogs}
                  id="hide-panel-logs"
                  onCheckedChange={function handleHidePanelLogsChange(checked) {
                    actions.setHidePanelLogs(checked);
                  }}
                />
              </div>
              <AdminTerminalLogPanel
                emptyText={translate("admin.logsEmpty")}
                entries={derived.filteredLogs}
                heightClassName="h-[400px]"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        onOpenChange={function handleProviderDialogChange(open) {
          if (!open) {
            actions.closeDialogs();
          }
        }}
        open={state.providerDialogOpen}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {state.providerDialogMode === "create"
                ? translate("admin.providerDialogCreateTitle")
                : translate("admin.providerDialogEditTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-3">
            <div className="rounded-md border bg-background p-2 shadow-sm">
              <ProviderBadgeIcon
                providerHints={[String(providerDialogDraft?.type || ""), String(providerDialogDraft?.name || "")]}
                size={40}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>{translate("provider.name")}: {String(providerDialogDraft?.name || "-")}</p>
              <p className="mt-1">
                {translate("provider.type")}: {translate(`provider.type.${String(providerDialogDraft?.type || "openai_chat")}`)}
              </p>
            </div>
          </div>

          {state.providerDialogMode === "create" ? (
            <ProviderDialogBody
              draft={state.createProviderDraft as Record<string, boolean | number | string>}
              isEditMode={false}
              onChange={actions.setCreateProviderField}
              translate={translate}
            />
          ) : (
            <ProviderDialogBody
              draft={state.providerDraft as Record<string, boolean | number | string> | null}
              isEditMode={true}
              onChange={actions.setProviderField}
              translate={translate}
            />
          )}

          {state.providerDialogMessage.text ? (
            <div className={state.providerDialogMessage.kind === "error" ? buildErrorAlertClassName() : buildSuccessAlertClassName()}>
              {state.providerDialogMessage.text}
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={actions.closeDialogs} type="button" variant="outline">
              {translate("action.cancel")}
            </Button>
            <Button
              onClick={function handleProviderDialogSubmit() {
                if (state.providerDialogMode === "create") {
                  void actions.createProvider();
                  return;
                }
                void actions.saveSelectedProvider();
              }}
              type="button"
            >
              {translate("action.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={function handleGroupDialogChange(open) {
          if (!open) {
            closeGroupDialog();
          }
        }}
        open={groupDialogOpen}
      >
        <DialogContent className="sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>
              {groupDialogMode === "create" ? translate("group.dialogCreateTitle") : translate("group.dialogEditTitle")}
            </DialogTitle>
          </DialogHeader>

          <GroupDialogBody
            activeEntryModelPickerKey={groupModelPickerKey}
            availableProviders={availableGroupProviders}
            draft={groupDraft}
            getEntryModelOptions={getGroupEntryModelOptions}
            isEntryModelLoading={isGroupEntryModelLoading}
            onAddCollection={addGroupCollection}
            onAddEntry={addGroupEntry}
            onCloseEntryModelPicker={closeGroupEntryModelPicker}
            onCollectionChange={updateGroupCollectionField}
            onEntryChange={updateGroupEntryField}
            onFetchEntryModels={fetchGroupEntryModels}
            onGroupChange={updateGroupField}
            onMoveEntry={moveGroupCollectionEntry}
            onOpenEntryModelPicker={openGroupEntryModelPicker}
            onRemoveCollection={removeGroupCollection}
            onRemoveEntry={removeGroupEntry}
            onSelectEntryModel={selectGroupEntryModel}
            readOnlyName={groupDialogMode === "edit"}
            translate={translate}
          />

          {groupMessage.text ? (
            <div className={groupMessage.kind === "error" ? buildErrorAlertClassName() : buildSuccessAlertClassName()}>
              {groupMessage.text}
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={closeGroupDialog} type="button" variant="outline">
              {translate("action.cancel")}
            </Button>
            <Button
              onClick={function handleSaveGroupDialogClick() {
                void saveGroupDraftState();
              }}
              type="button"
            >
              {translate("action.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={function handleKeyEditDialogChange(open) {
          if (!open) {
            closeKeyEditDialog();
          }
        }}
        open={keyEditDialogOpen}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{translate("admin.keyEditTitle")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{translate("admin.selectProvider")}</Label>
                <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-sm">
                  {selectedProviderName || "-"}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{translate("provider.reference")}</Label>
                <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-sm">
                  {editableKeySnapshot?.ref || "-"}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-edit-value">{translate("admin.keyValue")}</Label>
              <SecretInput
                autoComplete="off"
                disabled={keyEditLoading || keyEditPending}
                hiddenLabel={translate("secret.show")}
                id="key-edit-value"
                onChange={function handleKeyEditValueChange(event) {
                  setKeyEditValue(event.target.value);
                }}
                placeholder={translate("admin.keyValuePlaceholder")}
                value={keyEditValue}
                visibleLabel={translate("secret.hide")}
              />
              {keyEditLoading ? (
                <p className="text-sm text-muted-foreground">{translate("message.loading")}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button disabled={keyEditPending} onClick={closeKeyEditDialog} type="button" variant="outline">
              {translate("action.cancel")}
            </Button>
            <Button
              disabled={keyEditLoading || keyEditPending || !String(keyEditValue || "").trim()}
              onClick={function handleSaveEditedKey() {
                void saveEditedKey();
              }}
              type="button"
            >
              {translate("action.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={function handleImportDialogChange(open) {
          if (!open) {
            actions.closeDialogs();
          }
        }}
        open={state.keyImportDialogOpen}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{translate("admin.importDialogTitle")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{translate("admin.selectProvider")}</Label>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                {selectedProvider ? (
                  <>
                    <ProviderBadgeIcon providerHints={[selectedProvider.type, selectedProvider.name]} size={24} />
                    <span>{selectedProvider.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{translate("admin.noProvidersConfigured")}</span>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="import-keys-textarea">{translate("action.importKeys")}</Label>
              <Textarea
                className="min-h-40 resize-y"
                data-import-parser="parseImportedKeys"
                data-import-splitter="splitImportedKeys"
                id="import-keys-textarea"
                onChange={function handleImportTextChange(event) {
                  actions.setImportText(event.target.value);
                }}
                placeholder={translate("admin.importPlaceholder")}
                value={state.importText}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={actions.closeDialogs} type="button" variant="outline">
              {translate("action.cancel")}
            </Button>
            <Button
              disabled={!selectedProviderName}
              onClick={function handleImport() {
                void actions.importKeys();
              }}
              type="button"
            >
              {translate("action.importKeys")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={function handleLogDialogChange(open) {
          if (!open) {
            actions.closeDialogs();
          }
        }}
        open={state.logModalOpen}
      >
        <DialogContent className="sm:max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>{translate("admin.logsTitle")}</DialogTitle>
          </DialogHeader>
          <AdminLogPanel
            emptyText={translate("admin.logsEmpty")}
            entries={derived.filteredLogs}
            heightClassName="max-h-[70vh]"
            showFullTimestamp={true}
          />
          <DialogFooter>
            <Button onClick={actions.closeDialogs} type="button" variant="outline">
              {translate("action.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={function handleBulkDisableDialogChange(open) {
          setBulkDisableDialogOpen(open);
        }}
        open={bulkDisableDialogOpen}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{translate("admin.bulkDisableTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bulk-disable-mode grid gap-2 sm:grid-cols-3">
              <Button
                onClick={function handleSelectDurationMode() {
                  setBulkDisableMode("duration");
                }}
                type="button"
                variant={bulkDisableMode === "duration" ? "default" : "outline"}
              >
                {translate("admin.bulkModeTimed")}
              </Button>
              <Button
                onClick={function handleSelectUntilMode() {
                  setBulkDisableMode("until");
                }}
                type="button"
                variant={bulkDisableMode === "until" ? "default" : "outline"}
              >
                {translate("admin.bulkModeUntil")}
              </Button>
              <Button
                onClick={function handleSelectForeverMode() {
                  setBulkDisableMode("forever");
                }}
                type="button"
                variant={bulkDisableMode === "forever" ? "default" : "outline"}
              >
                {translate("admin.bulkModeForever")}
              </Button>
            </div>

            {bulkDisableMode === "duration" ? (
              <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-wrap gap-2">
                  {disablePresetSeconds.map(function renderDisablePreset(seconds) {
                    return (
                      <Button
                        key={seconds}
                        onClick={function handlePresetClick() {
                          setBulkDisableSeconds(seconds);
                        }}
                        size="sm"
                        type="button"
                        variant={bulkDisableSeconds === seconds ? "default" : "outline"}
                      >
                        {formatDurationLabel(seconds)}
                      </Button>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  <input
                    className="bulk-disable-seconds w-full accent-primary"
                    max={derived.disableBounds.max}
                    min={derived.disableBounds.min}
                    onChange={function handleDisableSecondsChange(event) {
                      setBulkDisableSeconds(Number(event.target.value || derived.disableBounds.min));
                    }}
                    step={Math.max(1, Math.floor((derived.disableBounds.max - derived.disableBounds.min) / 48))}
                    type="range"
                    value={bulkDisableSeconds}
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{translate("admin.bulkDisableFor")}</span>
                    <strong className="font-mono">{formatDurationLabel(bulkDisableSeconds)}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {bulkDisableMode === "until" ? (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <Label htmlFor="bulk-disable-until">{translate("admin.bulkDisableAt")}</Label>
                <Input
                  id="bulk-disable-until"
                  onChange={function handleBulkDisableUntilChange(event) {
                    setBulkDisableUntil(event.target.value);
                  }}
                  type="datetime-local"
                  value={bulkDisableUntil}
                />
              </div>
            ) : null}

            {bulkDisableMode === "forever" ? (
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {translate("provider.permanent")}
              </div>
            ) : null}

            <div className="rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
              {translate("provider.selectedCount", { count: state.selectedKeyRefs.length })}
              {" · "}
              {translate("admin.bulkDisableRange", {
                max: derived.disableBounds.max,
                min: derived.disableBounds.min
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={function handleCloseBulkDisableDialog() {
                setBulkDisableDialogOpen(false);
              }}
              type="button"
              variant="outline"
            >
              {translate("action.cancel")}
            </Button>
            <Button
              disabled={bulkDisableMode === "until" && !bulkDisableUntil}
              onClick={function handleConfirmBulkDisable() {
                const disablePayload = buildBulkDisableRequest(
                  bulkDisableMode === "forever"
                    ? { mode: "forever" }
                    : bulkDisableMode === "until"
                      ? { mode: "until", until: bulkDisableUntil }
                      : { mode: "duration", seconds: bulkDisableSeconds },
                  state.providerDraft || selectedProvider
                );
                setBulkDisableDialogOpen(false);
                void actions.applyBulkAction("disable", disablePayload);
              }}
              type="button"
            >
              {translate("action.disableSelected")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
