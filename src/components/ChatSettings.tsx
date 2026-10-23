import type { GenerationSettings } from "../types";
import { Icon } from "./Icon";

interface Props {
  settings: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
  onClose: () => void;
}

const CONTEXT_OPTIONS = [2048, 4096, 8192];

export function ChatSettings({ settings, onChange, onClose }: Props) {
  return (
    <div className="chat-settings" role="dialog" aria-label="Conversation settings">
      <div className="chat-settings-head">
        <strong>Conversation settings</strong>
        <button onClick={onClose} aria-label="Close settings">
          <Icon name="close" size={14} />
        </button>
      </div>

      <label className="field">
        <span>System prompt</span>
        <textarea
          value={settings.systemPrompt}
          onChange={(event) => onChange({ ...settings, systemPrompt: event.target.value })}
          rows={3}
        />
      </label>

      <label className="field">
        <span>
          Temperature <em>{settings.temperature.toFixed(2)}</em>
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={settings.temperature}
          onChange={(event) => onChange({ ...settings, temperature: Number(event.target.value) })}
        />
      </label>

      <label className="field">
        <span>
          Top P <em>{settings.topP.toFixed(2)}</em>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.topP}
          onChange={(event) => onChange({ ...settings, topP: Number(event.target.value) })}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Max response tokens</span>
          <input
            type="number"
            min={16}
            max={8192}
            step={16}
            value={settings.maxTokens}
            onChange={(event) =>
              onChange({ ...settings, maxTokens: Math.max(16, Number(event.target.value) || 512) })
            }
          />
        </label>
        <label className="field">
          <span>Context window</span>
          <select
            value={settings.contextSize}
            onChange={(event) => onChange({ ...settings, contextSize: Number(event.target.value) })}
          >
            {CONTEXT_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size.toLocaleString()} tokens
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-note">Changes save with this conversation and apply to the next reply.</p>
    </div>
  );
}
