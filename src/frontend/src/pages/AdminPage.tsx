import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Edit3,
  FileText,
  Key,
  KeyRound,
  LogOut,
  Plus,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2
} from "lucide-react";

import { ProviderBadgeIcon } from "@/components/provider/ProviderBadgeIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AdminKeySnapshot, AdminLogEntry, AdminProviderSnapshot, AdminProviderStatsSnapshot } from "@/lib/admin";
import { buildBulkDisableRequest } from "@/lib/admin";
import { formatDateTime, formatDisabledUntil, formatErrorRate, formatLogSummary, formatNumber, formatPercent } from "@/lib/format";
import { useAdminOverview, type AdminTab } from "@/hooks/useAdminOverview";
import { useAppStore } from "@/store/appStore";

const providerTypeOptions = ["openai_chat", "openai_responses", "claude", "gemini"] as const;
const keyStrategyOptions = ["round_robin", "fill"] as const;

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
      ? "border-destructive/30 bg-destructive/12 text-destructive"
      : props.status === "warning"
        ? "border-warning/40 bg-warning/15 text-warning"
        : "border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300";

  return (
    <div
      className={`inline-flex h-8 w-[92px] items-center justify-center rounded-full border text-center text-[11px] font-semibold uppercase tracking-[0.24em] ${className}`}
    >
      {props.status}
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
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="provider-cache-enabled">{props.translate("provider.cacheEnabled")}</Label>
            <p className="text-xs text-muted-foreground">{props.translate("state.enabled")}</p>
          </div>
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
  );
}

export function AdminPage() {
  const [bulkDisableDialogOpen, setBulkDisableDialogOpen] = useState(false);
  const [bulkDisableMode, setBulkDisableMode] = useState<"duration" | "forever" | "until">("duration");
  const [bulkDisableSeconds, setBulkDisableSeconds] = useState(3600);
  const [bulkDisableUntil, setBulkDisableUntil] = useState("");
  const language = useAppStore(function selectLanguage(state) {
    return state.language;
  });
  const translate = useAppStore(function selectTranslate(state) {
    return state.translate;
  });
  const { actions, derived, state } = useAdminOverview(translate, language);

  const selectedProvider = derived.selectedProvider;
  const selectedProviderKeys = selectedProvider?.keys || [];
  const selectedProviderName = state.selectedProviderName;
  const hasSelectedProvider = Boolean(selectedProvider);
  const providerCount = state.overview.providers.length;
  const clientKeyCount = state.globalConfigLoaded
    ? state.globalDraft.client_keys.length
    : Number(state.overview.global_config.client_key_count || 0);
  const canSaveAdminKey = state.globalAdminKeyDirty && String(state.globalDraft.admin_key || "").trim() !== "";
  const activeKeyCount = formatNumber(derived.selectedProviderStats.available_keys || 0);
  const totalKeyCount = formatNumber(derived.selectedProviderStats.total_keys || selectedProviderKeys.length);
  const providerDialogDraft = state.providerDialogMode === "create" ? state.createProviderDraft : state.providerDraft;
  const disablePresetSeconds = useMemo(function computeDisablePresetSeconds() {
    return createDisablePresetSeconds(derived.disableBounds);
  }, [derived.disableBounds]);
  useEffect(function syncBulkDisableDraft() {
    const nextSeconds = Math.min(Math.max(3600, derived.disableBounds.min), derived.disableBounds.max);
    setBulkDisableSeconds(nextSeconds);
    setBulkDisableUntil(toDateTimeLocalValue(Date.now() + nextSeconds * 1000));
  }, [derived.disableBounds.max, derived.disableBounds.min, selectedProviderName]);

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
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      autoComplete="current-password"
                      className="pl-9"
                      id="adminKey"
                      name="adminKey"
                      placeholder={translate("admin.adminKeyPlaceholder")}
                      type="password"
                    />
                  </div>
                  {state.loginMessage.text ? (
                    <p className="text-sm font-medium text-destructive">{state.loginMessage.text}</p>
                  ) : null}
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

      {state.flashMessage.text ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            state.flashMessage.kind === "error"
              ? "border-destructive/20 bg-destructive/10 text-destructive"
              : state.flashMessage.kind === "warning"
                ? "border-warning/20 bg-warning/10 text-warning"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {state.flashMessage.text}
        </div>
      ) : null}

      <Tabs
        className="w-full"
        onValueChange={function handleTabChange(value) {
          actions.setActiveTab(value as AdminTab);
        }}
        value={state.activeTab}
      >
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger className="flex items-center gap-2" value="global">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("admin.tab.global")}</span>
          </TabsTrigger>
          <TabsTrigger className="flex items-center gap-2" value="providers">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("admin.tab.providers")}</span>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <CardTitle>{translate("admin.globalTitle")}</CardTitle>
                <Badge variant={state.overview.global_config.admin_key_configured ? "success" : "warning"}>
                  {state.overview.global_config.admin_key_configured
                    ? translate("admin.adminKeyConfigured")
                    : translate("admin.adminKeyMissing")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="global-admin-key">{translate("admin.adminKey")}</Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    autoComplete="new-password"
                    className="sm:flex-1"
                    id="global-admin-key"
                    onChange={function handleAdminKeyChange(event) {
                      actions.setAdminKey(event.target.value);
                    }}
                    placeholder={translate("admin.adminKeyPlaceholder")}
                    type="password"
                    value={String(state.globalDraft.admin_key || "")}
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
                            <Input
                              autoComplete="off"
                              disabled={state.clientKeysPending}
                              onChange={function handleClientKeyChange(event) {
                                actions.updateClientKey(index, event.target.value);
                              }}
                              placeholder={translate("admin.importPlaceholder")}
                              value={clientKeyValue}
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
                            onClick={function handleClearCache() {
                              void actions.clearProviderCacheByName(providerSnapshot.name);
                            }}
                            size="sm"
                            variant="outline"
                          >
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
                            {translate("status.errorRate")}
                          </span>
                          <strong className="mt-1 block text-foreground">
                            {formatErrorRate(stats.success_count, stats.error_count)}
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
                          <th className="px-4 py-3 text-right font-medium">{translate("action.delete")}</th>
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
                          const isDisabled = Number(keySnapshot.disabled_until || 0) > 0;
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
                                  {formatDisabledUntil(keySnapshot.disabled_until, language, translate)}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">{formatNumber(keySnapshot.consecutive_fails)}</td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  onClick={function handleDeleteSingleKey() {
                                    void actions.deleteSingleKey(keySnapshot.ref);
                                  }}
                                  size="sm"
                                  variant="ghost"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
              <div className="h-[400px] overflow-auto rounded-md border bg-[#1e1e1e] p-4 font-mono text-xs text-[#d4d4d4]">
                {derived.filteredLogs.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">{translate("admin.logsEmpty")}</div>
                ) : (
                  derived.filteredLogs.map(function renderLogEntry(entry, index) {
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
        <DialogContent className="log-modal max-w-6xl">
          <div className="overflow-hidden rounded-lg border bg-[#1e1e1e] text-[#d4d4d4] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <h3 className="text-lg font-semibold">{translate("admin.logsTitle")}</h3>
            </div>
            <div className="max-h-[70vh] overflow-auto p-6">
              <div className="space-y-1 rounded-md border border-white/10 bg-black/20 p-4 font-mono text-xs">
                {derived.filteredLogs.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">{translate("admin.logsEmpty")}</div>
                ) : (
                  derived.filteredLogs.map(function renderLogEntry(entry, index) {
                    const level = readLogLevel(entry);
                    return (
                      <div className="grid gap-2 border-b border-white/10 py-2 last:border-b-0 lg:grid-cols-[150px_72px_220px_minmax(0,1fr)]" key={`${entry.time || "log"}-${index}`}>
                        <span className="text-slate-500">{String(entry.time || "").replace("T", " ").slice(0, 23)}</span>
                        <span
                          className={
                            level === "ERROR"
                              ? "font-semibold tracking-[0.18em] text-[#f14c4c]"
                              : level === "WARN"
                                ? "font-semibold tracking-[0.18em] text-[#cca700]"
                                : level === "DEBUG"
                                  ? "font-semibold tracking-[0.18em] text-[#c586c0]"
                                  : "font-semibold tracking-[0.18em] text-[#3794ff]"
                          }
                        >
                          {level}
                        </span>
                        <span>{String(entry.msg || "")}</span>
                        <span className="break-all text-slate-400">
                          {formatLogSummary(entry as { attrs?: Record<string, unknown> })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
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
