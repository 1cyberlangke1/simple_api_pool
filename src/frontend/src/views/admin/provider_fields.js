import { html } from "../../shared/view_helpers.js";
import { keyStrategyValues, providerTypeValues } from "../../forms/provider_form.js";

export function ProviderFields(props) {
  const draft = props.draft;
  return html`
    <div class="form-grid">
      <label class="field">
        <span>${props.translate("provider.name")}</span>
        <input
          name="name"
          type="text"
          value=${draft.name}
          readOnly=${Boolean(props.readOnlyName)}
          onInput=${function handleNameInput(event) {
            props.onChange("name", event.currentTarget.value);
          }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.type")}</span>
        <select
          name="type"
          value=${draft.type}
          disabled=${Boolean(props.disableType)}
          onChange=${function handleTypeChange(event) {
            props.onChange("type", event.currentTarget.value);
          }}
        >
          ${providerTypeValues.map(function renderProviderType(typeValue) {
            return html`<option value=${typeValue}>${props.translate("provider.type." + typeValue)}</option>`;
          })}
        </select>
      </label>
    </div>
    <div class="form-grid">
      <label class="field">
        <span>${props.translate("provider.baseUrl")}</span>
        <input
          name="base_url"
          type="text"
          value=${draft.base_url}
          placeholder=${props.translate("provider.baseUrlPlaceholder")}
          onInput=${function handleBaseURLInput(event) {
            props.onChange("base_url", event.currentTarget.value);
          }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.keyStrategy")}</span>
        <select
          name="key_strategy"
          value=${draft.key_strategy}
          onChange=${function handleStrategyChange(event) {
            props.onChange("key_strategy", event.currentTarget.value);
          }}
        >
          ${keyStrategyValues.map(function renderKeyStrategy(strategyValue) {
            return html`<option value=${strategyValue}>${props.translate("provider.strategy." + strategyValue)}</option>`;
          })}
        </select>
      </label>
    </div>
    <div class="form-grid three-columns">
      <label class="field">
        <span>${props.translate("provider.failThreshold")}</span>
        <input
          name="fail_threshold"
          type="number"
          min="1"
          value=${draft.fail_threshold}
          onInput=${function handleFailThresholdInput(event) {
            props.onChange("fail_threshold", event.currentTarget.value);
          }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.minDisableSecs")}</span>
        <input
          name="min_disable_secs"
          type="number"
          min="1"
          value=${draft.min_disable_secs}
          onInput=${function handleMinDisableInput(event) {
            props.onChange("min_disable_secs", event.currentTarget.value);
          }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.maxDisableSecs")}</span>
        <input
          name="max_disable_secs"
          type="number"
          min="1"
          value=${draft.max_disable_secs}
          onInput=${function handleMaxDisableInput(event) {
            props.onChange("max_disable_secs", event.currentTarget.value);
          }}
        />
      </label>
    </div>
    <div class="form-grid">
      <label class="field checkbox-field">
        <input
          name="cache_enabled"
          type="checkbox"
          checked=${Boolean(draft.cache_enabled)}
          onChange=${function handleCacheEnabledChange(event) {
            props.onChange("cache_enabled", event.currentTarget.checked);
          }}
        />
        <span>${props.translate("provider.cacheEnabled")}</span>
      </label>
      <label class="field">
        <span>${props.translate("provider.cacheMaxEntries")}</span>
        <input
          name="cache_max_entries"
          type="number"
          min="1"
          value=${draft.cache_max_entries}
          onInput=${function handleCacheEntriesInput(event) {
            props.onChange("cache_max_entries", event.currentTarget.value);
          }}
        />
      </label>
    </div>
  `;
}
